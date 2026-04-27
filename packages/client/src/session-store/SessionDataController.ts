import type { SlashCommand } from "@yep-anywhere/shared";
import { type PaginationInfo, api } from "../api/client";
import {
  hasEquivalentJsonlMessage,
  reconcileCodexLinearMessages,
} from "../lib/codexLinearMessages";
import {
  getMessageId,
  mergeJSONLMessages,
  mergeStreamMessage,
} from "../lib/mergeMessages";
import { getProvider } from "../providers/registry";
import type { InputRequest, Message, Session, SessionStatus } from "../types";
import type { SessionStore } from "./SessionStore";
import type { SessionKey } from "./types";

interface SessionRestResponse {
  session: Session;
  messages: Message[];
  ownership: SessionStatus;
  pendingInputRequest?: InputRequest | null;
  slashCommands?: SlashCommand[] | null;
  pagination?: PaginationInfo;
}

type BufferedStreamEvent =
  | { type: "message"; message: Message }
  | { type: "subagent"; message: Message; agentId: string };

function isCodexProvider(provider?: string): boolean {
  return provider === "codex" || provider === "codex-oss";
}

function tagJsonlMessages(messages: Message[]): Message[] {
  return messages.map((message) => ({ ...message, _source: "jsonl" as const }));
}

function getMaxTimestampMs(messages: Message[]): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const message of messages) {
    const raw = message.timestamp;
    if (typeof raw !== "string") continue;
    const ms = new Date(raw).getTime();
    if (!Number.isNaN(ms) && ms > max) {
      max = ms;
    }
  }
  return max;
}

function mergePersistedMessages(
  current: Message[],
  incoming: Message[],
  provider?: string,
): Message[] {
  const merged = mergeJSONLMessages(current, incoming, {
    skipDagOrdering: !getProvider(provider).capabilities.supportsDag,
  });
  return isCodexProvider(provider)
    ? reconcileCodexLinearMessages(merged.messages)
    : merged.messages;
}

export class SessionDataController {
  private inFlightHydrates = new Map<SessionKey, Promise<void>>();
  private initialLoadComplete = new Set<SessionKey>();
  private streamBuffers = new Map<SessionKey, BufferedStreamEvent[]>();
  private maxPersistedTimestampMs = new Map<SessionKey, number>();

  constructor(private readonly store: SessionStore) {}

  async hydrateSessionEntry(key: SessionKey, force = false): Promise<void> {
    const entry = this.store.getEntry(key);
    if (!entry) return;
    if (!force && entry.lastHydratedAt !== null) return;

    const existing = this.inFlightHydrates.get(key);
    if (existing) return existing;

    const promise = this.hydrateSessionEntryInternal(key);
    this.inFlightHydrates.set(key, promise);
    try {
      await promise;
    } finally {
      if (this.inFlightHydrates.get(key) === promise) {
        this.inFlightHydrates.delete(key);
      }
    }
  }

  async fetchNewMessages(key: SessionKey): Promise<void> {
    const entry = this.store.getEntry(key);
    if (!entry) return;

    const lastMessage = entry.messages[entry.messages.length - 1];
    const afterMessageId = lastMessage ? getMessageId(lastMessage) : undefined;
    const data = await api.getSession(
      entry.projectId,
      entry.sessionId,
      afterMessageId,
    );
    this.applyRestResponse(key, data, { append: true });
  }

  async fetchSessionMetadata(key: SessionKey): Promise<void> {
    const entry = this.store.getEntry(key);
    if (!entry) return;

    const data = await api.getSessionMetadata(entry.projectId, entry.sessionId);
    this.store.patchEntry(key, {
      session: entry.session
        ? { ...entry.session, ...data.session, messages: entry.messages }
        : { ...data.session, messages: [] },
      status: data.ownership,
      pendingInputRequest: data.pendingInputRequest ?? null,
    });
  }

  async loadOlderMessages(key: SessionKey): Promise<void> {
    const entry = this.store.getEntry(key);
    if (!entry?.pagination?.hasOlderMessages) return;
    const beforeMessageId = entry.pagination.truncatedBeforeMessageId;
    if (!beforeMessageId) return;

    this.store.patchEntry(key, { loadingOlder: true });
    try {
      const data = await api.getSession(
        entry.projectId,
        entry.sessionId,
        undefined,
        {
          tailCompactions: 2,
          beforeMessageId,
        },
      );
      const older = tagJsonlMessages(data.messages);
      this.updatePersistedTimestampWatermark(key, older);
      this.store.patchEntry(key, {
        session: { ...data.session, messages: [...older, ...entry.messages] },
        messages: isCodexProvider(data.session.provider)
          ? reconcileCodexLinearMessages([...older, ...entry.messages])
          : [...older, ...entry.messages],
        pagination: data.pagination,
      });
    } finally {
      this.store.patchEntry(key, { loadingOlder: false });
    }
  }

  applyStreamMessage(key: SessionKey, message: Message): void {
    if (!this.initialLoadComplete.has(key)) {
      this.pushBufferedEvent(key, { type: "message", message });
      return;
    }
    this.applyStreamMessageNow(key, message);
  }

  applyStreamSubagentMessage(
    key: SessionKey,
    message: Message,
    agentId: string,
  ): void {
    if (!this.initialLoadComplete.has(key)) {
      this.pushBufferedEvent(key, { type: "subagent", message, agentId });
      return;
    }
    this.applyStreamSubagentMessageNow(key, message, agentId);
  }

  registerToolUseAgent(
    key: SessionKey,
    toolUseId: string,
    agentId: string,
  ): void {
    this.store.setToolUseToAgent(key, (current) => {
      const next = new Map(current);
      if (!next.has(toolUseId)) {
        next.set(toolUseId, agentId);
      }
      return next;
    });
  }

  private async hydrateSessionEntryInternal(key: SessionKey): Promise<void> {
    const entry = this.store.getEntry(key);
    if (!entry) return;

    this.store.patchEntry(key, { loading: true, error: null });
    try {
      const data = await api.getSession(
        entry.projectId,
        entry.sessionId,
        undefined,
        {
          tailCompactions: 2,
        },
      );
      this.applyRestResponse(key, data, { append: false });
      this.initialLoadComplete.add(key);
      this.flushBufferedEvents(key);
    } catch (error) {
      this.store.patchEntry(key, {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    } finally {
      this.store.patchEntry(key, { loading: false });
    }
  }

  private applyRestResponse(
    key: SessionKey,
    data: SessionRestResponse,
    options: { append: boolean },
  ): void {
    const entry = this.store.getEntry(key);
    if (!entry) return;

    const taggedMessages = tagJsonlMessages(data.messages);
    this.updatePersistedTimestampWatermark(key, taggedMessages);

    const messages = options.append
      ? mergePersistedMessages(
          entry.messages,
          taggedMessages,
          data.session.provider,
        )
      : isCodexProvider(data.session.provider)
        ? reconcileCodexLinearMessages(taggedMessages)
        : taggedMessages;

    this.store.patchEntry(key, {
      session: { ...data.session, messages },
      messages,
      pagination: data.pagination,
      status: data.ownership,
      pendingInputRequest: data.pendingInputRequest ?? null,
      slashCommands: data.slashCommands ?? [],
      lastHydratedAt: Date.now(),
    });
  }

  private updatePersistedTimestampWatermark(
    key: SessionKey,
    messages: Message[],
  ): void {
    const current =
      this.maxPersistedTimestampMs.get(key) ?? Number.NEGATIVE_INFINITY;
    this.maxPersistedTimestampMs.set(
      key,
      Math.max(current, getMaxTimestampMs(messages)),
    );
  }

  private pushBufferedEvent(key: SessionKey, event: BufferedStreamEvent): void {
    const buffer = this.streamBuffers.get(key) ?? [];
    buffer.push(event);
    this.streamBuffers.set(key, buffer);
  }

  private flushBufferedEvents(key: SessionKey): void {
    const buffer = this.streamBuffers.get(key) ?? [];
    this.streamBuffers.delete(key);
    for (const event of buffer) {
      if (event.type === "message") {
        this.applyStreamMessageNow(key, event.message);
      } else {
        this.applyStreamSubagentMessageNow(key, event.message, event.agentId);
      }
    }
  }

  private applyStreamMessageNow(key: SessionKey, incoming: Message): void {
    const entry = this.store.getEntry(key);
    if (!entry) return;
    if (
      this.shouldSuppressCodexReplay(key, incoming, entry.session?.provider)
    ) {
      return;
    }
    this.store.setMessages(
      key,
      (current) => mergeStreamMessage(current, incoming).messages,
    );
    this.store.patchEntry(key, {
      lastStreamActivityAt: new Date().toISOString(),
    });
  }

  private applyStreamSubagentMessageNow(
    key: SessionKey,
    incoming: Message,
    agentId: string,
  ): void {
    const incomingId = getMessageId(incoming);
    this.store.setAgentContent(key, (current) => {
      const existing = current[agentId] ?? { messages: [], status: "running" };
      if (
        incomingId &&
        existing.messages.some(
          (message) => getMessageId(message) === incomingId,
        )
      ) {
        return current;
      }
      return {
        ...current,
        [agentId]: {
          ...existing,
          messages: [...existing.messages, incoming],
          status: "running",
        },
      };
    });
  }

  private shouldSuppressCodexReplay(
    key: SessionKey,
    incoming: Message,
    provider?: string,
  ): boolean {
    if (!isCodexProvider(provider)) return false;
    if (incoming.isReplay !== true) return false;

    const entry = this.store.getEntry(key);
    if (!entry) return false;

    const maxPersisted =
      this.maxPersistedTimestampMs.get(key) ?? Number.NEGATIVE_INFINITY;
    const timestamp =
      typeof incoming.timestamp === "string"
        ? new Date(incoming.timestamp).getTime()
        : Number.NaN;
    if (!Number.isNaN(timestamp) && timestamp <= maxPersisted) {
      return true;
    }
    return hasEquivalentJsonlMessage(entry.messages, incoming);
  }
}
