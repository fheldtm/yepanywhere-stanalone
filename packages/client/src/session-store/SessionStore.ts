import type { ProviderName } from "@yep-anywhere/shared";
import {
  LEGACY_KEYS,
  getServerScoped,
  removeServerScoped,
  setServerScoped,
} from "../lib/storageKeys";
import type { Message } from "../types";
import type {
  SessionAgentContentMap,
  SessionEntry,
  SessionKey,
  SessionStoreSnapshot,
  SessionTab,
  SessionUiState,
} from "./types";

type Listener = () => void;

const SESSION_TABS_STORAGE_VERSION = 1;

type PersistedSessionTab = Pick<
  SessionTab,
  | "projectId"
  | "sessionId"
  | "title"
  | "provider"
  | "model"
  | "isPinned"
  | "lastAccessedAt"
>;

interface PersistedSessionTabsState {
  version: typeof SESSION_TABS_STORAGE_VERSION;
  tabs: PersistedSessionTab[];
  activeKey: SessionKey | null;
}

export interface SessionStoreOptions {
  maxTabs?: number;
  maxWarmEntries?: number;
}

export interface OpenSessionTabOptions {
  title?: string | null;
  provider?: ProviderName;
  model?: string;
  pinned?: boolean;
  activate?: boolean;
}

export type EntryPatch = Partial<
  Omit<SessionEntry, "key" | "projectId" | "sessionId">
>;

function now(): number {
  return Date.now();
}

export function createSessionKey(
  projectId: string,
  sessionId: string,
): SessionKey {
  return `${projectId}:${sessionId}`;
}

function createDefaultUiState(): SessionUiState {
  return {
    scrollTop: 0,
    shouldAutoScroll: true,
    expandedToolIds: new Set(),
    collapsedToolIds: new Set(),
    draftText: "",
    approvalCollapsed: false,
  };
}

function createDefaultEntry(
  projectId: string,
  sessionId: string,
): SessionEntry {
  const timestamp = now();
  return {
    key: createSessionKey(projectId, sessionId),
    projectId,
    sessionId,
    actualSessionId: sessionId,
    session: null,
    messages: [],
    agentContent: {},
    toolUseToAgent: new Map(),
    markdownAugments: {},
    pagination: undefined,
    loading: false,
    loadingOlder: false,
    error: null,
    status: { owner: "none" },
    processState: "idle",
    pendingInputRequest: null,
    pendingMessages: [],
    deferredMessages: [],
    slashCommands: [],
    sessionTools: [],
    mcpServers: [],
    lastStreamActivityAt: null,
    isCompacting: false,
    mode: "default",
    modeVersion: 0,
    streamState: "disabled",
    lifecycleState: "warm",
    ui: createDefaultUiState(),
    createdAt: timestamp,
    lastAccessedAt: timestamp,
    lastHydratedAt: null,
  };
}

function createDefaultTab(
  projectId: string,
  sessionId: string,
  options: OpenSessionTabOptions = {},
): SessionTab {
  return {
    key: createSessionKey(projectId, sessionId),
    projectId,
    sessionId,
    title: options.title ?? null,
    provider: options.provider,
    model: options.model,
    dirtyDraft: false,
    activity: undefined,
    pendingInputType: undefined,
    hasUnread: undefined,
    isPinned: options.pinned ?? false,
    lastAccessedAt: now(),
  };
}

function hasChanged<T extends object>(target: T, patch: Partial<T>): boolean {
  return Object.entries(patch).some(
    ([key, value]) => target[key as keyof T] !== value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return readString(value);
}

function readPersistedTabs(maxTabs: number): {
  tabs: SessionTab[];
  activeKey: SessionKey | null;
} {
  try {
    const raw = getServerScoped("sessionTabs", LEGACY_KEYS.sessionTabs);
    if (!raw) return { tabs: [], activeKey: null };

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SESSION_TABS_STORAGE_VERSION) {
      return { tabs: [], activeKey: null };
    }
    if (!Array.isArray(parsed.tabs)) return { tabs: [], activeKey: null };

    const tabs = parsed.tabs
      .map((item): SessionTab | null => {
        if (!isRecord(item)) return null;
        const projectId = readString(item.projectId);
        const sessionId = readString(item.sessionId);
        if (!projectId || !sessionId) return null;

        const key = createSessionKey(projectId, sessionId);
        return {
          key,
          projectId,
          sessionId,
          title: readNullableString(item.title) ?? null,
          provider: readString(item.provider) as ProviderName | undefined,
          model: readString(item.model),
          dirtyDraft: false,
          activity: undefined,
          pendingInputType: undefined,
          hasUnread: undefined,
          isPinned: item.isPinned === true,
          lastAccessedAt:
            typeof item.lastAccessedAt === "number"
              ? item.lastAccessedAt
              : now(),
        };
      })
      .filter((tab): tab is SessionTab => Boolean(tab))
      .slice(-maxTabs);

    const tabKeys = new Set(tabs.map((tab) => tab.key));
    const activeKey =
      typeof parsed.activeKey === "string" &&
      tabKeys.has(parsed.activeKey as SessionKey)
        ? (parsed.activeKey as SessionKey)
        : (tabs.at(-1)?.key ?? null);

    return { tabs, activeKey };
  } catch {
    return { tabs: [], activeKey: null };
  }
}

function serializePersistedTabs(
  tabs: SessionTab[],
  activeKey: SessionKey | null,
): string {
  const state: PersistedSessionTabsState = {
    version: SESSION_TABS_STORAGE_VERSION,
    activeKey,
    tabs: tabs.map((tab) => ({
      projectId: tab.projectId,
      sessionId: tab.sessionId,
      title: tab.title,
      provider: tab.provider,
      model: tab.model,
      isPinned: tab.isPinned,
      lastAccessedAt: tab.lastAccessedAt,
    })),
  };
  return JSON.stringify(state);
}

export class SessionStore {
  private snapshot: SessionStoreSnapshot;
  private listeners = new Set<Listener>();
  private lastPersistedTabs: string | null = null;

  constructor(options: SessionStoreOptions = {}) {
    const maxTabs = options.maxTabs ?? 8;
    const restored = readPersistedTabs(maxTabs);
    const entries = new Map<SessionKey, SessionEntry>();
    for (const tab of restored.tabs) {
      entries.set(tab.key, createDefaultEntry(tab.projectId, tab.sessionId));
    }

    this.snapshot = {
      entries,
      tabs: restored.tabs,
      activeKey: restored.activeKey,
      maxTabs,
      maxWarmEntries: options.maxWarmEntries ?? 8,
    };
    this.lastPersistedTabs = serializePersistedTabs(
      this.snapshot.tabs,
      this.snapshot.activeKey,
    );
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): SessionStoreSnapshot {
    return this.snapshot;
  }

  getEntry(key: SessionKey): SessionEntry | undefined {
    return this.snapshot.entries.get(key);
  }

  getTabs(): SessionTab[] {
    return this.snapshot.tabs;
  }

  getActiveKey(): SessionKey | null {
    return this.snapshot.activeKey;
  }

  ensureEntry(projectId: string, sessionId: string): SessionEntry {
    const key = createSessionKey(projectId, sessionId);
    const existing = this.snapshot.entries.get(key);
    if (existing) return existing;

    const entry = createDefaultEntry(projectId, sessionId);
    const entries = new Map(this.snapshot.entries);
    entries.set(key, entry);
    this.commit({ ...this.snapshot, entries });
    return entry;
  }

  openTab(
    projectId: string,
    sessionId: string,
    options: OpenSessionTabOptions = {},
  ): SessionKey {
    const key = createSessionKey(projectId, sessionId);
    this.ensureEntry(projectId, sessionId);

    const existingIndex = this.snapshot.tabs.findIndex(
      (tab) => tab.key === key,
    );
    const tabs = [...this.snapshot.tabs];
    if (existingIndex >= 0) {
      const existing = tabs[existingIndex];
      if (existing) {
        tabs[existingIndex] = {
          ...existing,
          title: options.title ?? existing.title,
          provider: options.provider ?? existing.provider,
          model: options.model ?? existing.model,
          isPinned: options.pinned ?? existing.isPinned,
          lastAccessedAt: now(),
        };
      }
    } else {
      tabs.push(createDefaultTab(projectId, sessionId, options));
    }

    const shouldActivate = options.activate ?? true;
    this.commit({
      ...this.snapshot,
      tabs,
      activeKey: shouldActivate ? key : this.snapshot.activeKey,
    });
    this.evictIfNeeded();
    return key;
  }

  activateTab(key: SessionKey): void {
    const tab = this.snapshot.tabs.find((candidate) => candidate.key === key);
    if (!tab) return;

    const tabs = this.snapshot.tabs.map((candidate) =>
      candidate.key === key
        ? { ...candidate, lastAccessedAt: now() }
        : candidate,
    );
    const entries = new Map(this.snapshot.entries);
    const entry = entries.get(key);
    if (entry) {
      entries.set(key, { ...entry, lastAccessedAt: now() });
    }

    this.commit({ ...this.snapshot, tabs, entries, activeKey: key });
  }

  closeTab(key: SessionKey): void {
    const currentTabs = this.snapshot.tabs;
    const index = currentTabs.findIndex((tab) => tab.key === key);
    if (index === -1) return;

    const tabs = currentTabs.filter((tab) => tab.key !== key);
    const entries = new Map(this.snapshot.entries);
    entries.delete(key);

    let activeKey = this.snapshot.activeKey;
    if (activeKey === key) {
      activeKey = tabs[Math.max(0, index - 1)]?.key ?? tabs[0]?.key ?? null;
    }

    this.commit({ ...this.snapshot, tabs, entries, activeKey });
  }

  closeOtherTabs(key: SessionKey): void {
    const keep = this.snapshot.tabs.find((tab) => tab.key === key);
    if (!keep) return;
    const entries = new Map<SessionKey, SessionEntry>();
    const entry = this.snapshot.entries.get(key);
    if (entry) entries.set(key, entry);
    this.commit({
      ...this.snapshot,
      tabs: [keep],
      entries,
      activeKey: key,
    });
  }

  closeTabsToRight(key: SessionKey): void {
    const index = this.snapshot.tabs.findIndex((tab) => tab.key === key);
    if (index === -1) return;
    const tabs = this.snapshot.tabs.slice(0, index + 1);
    const allowed = new Set(tabs.map((tab) => tab.key));
    const entries = new Map(
      [...this.snapshot.entries].filter(([entryKey]) => allowed.has(entryKey)),
    );
    this.commit({
      ...this.snapshot,
      tabs,
      entries,
      activeKey: allowed.has(this.snapshot.activeKey as SessionKey)
        ? this.snapshot.activeKey
        : key,
    });
  }

  pinTab(key: SessionKey, pinned = true): void {
    const tabs = this.snapshot.tabs.map((tab) =>
      tab.key === key ? { ...tab, isPinned: pinned } : tab,
    );
    this.commit({ ...this.snapshot, tabs });
  }

  updateTabMetadata(key: SessionKey, patch: Partial<SessionTab>): void {
    let changed = false;
    const tabs = this.snapshot.tabs.map((tab) =>
      tab.key === key
        ? (() => {
            if (hasChanged(tab, patch)) changed = true;
            return { ...tab, ...patch, key: tab.key };
          })()
        : tab,
    );
    if (!changed) return;
    this.commit({ ...this.snapshot, tabs });
  }

  patchEntry(key: SessionKey, patch: EntryPatch): void {
    const entry = this.snapshot.entries.get(key);
    if (!entry) return;
    if (!hasChanged(entry, patch)) return;
    const entries = new Map(this.snapshot.entries);
    entries.set(key, { ...entry, ...patch, key });
    this.commit({ ...this.snapshot, entries });
  }

  setMessages(
    key: SessionKey,
    updater: Message[] | ((messages: Message[]) => Message[]),
  ): void {
    const entry = this.snapshot.entries.get(key);
    if (!entry) return;
    const messages =
      typeof updater === "function" ? updater(entry.messages) : updater;
    this.patchEntry(key, { messages });
  }

  setAgentContent(
    key: SessionKey,
    updater:
      | SessionAgentContentMap
      | ((agentContent: SessionAgentContentMap) => SessionAgentContentMap),
  ): void {
    const entry = this.snapshot.entries.get(key);
    if (!entry) return;
    const agentContent =
      typeof updater === "function" ? updater(entry.agentContent) : updater;
    this.patchEntry(key, { agentContent });
  }

  setToolUseToAgent(
    key: SessionKey,
    updater:
      | Map<string, string>
      | ((mapping: Map<string, string>) => Map<string, string>),
  ): void {
    const entry = this.snapshot.entries.get(key);
    if (!entry) return;
    const toolUseToAgent =
      typeof updater === "function"
        ? updater(new Map(entry.toolUseToAgent))
        : updater;
    this.patchEntry(key, { toolUseToAgent });
  }

  setError(key: SessionKey, error: Error | null): void {
    this.patchEntry(key, { error });
  }

  setLoading(key: SessionKey, loading: boolean): void {
    this.patchEntry(key, { loading });
  }

  setUiState(key: SessionKey, patch: Partial<SessionUiState>): void {
    const entry = this.snapshot.entries.get(key);
    if (!entry) return;
    this.patchEntry(key, { ui: { ...entry.ui, ...patch } });
  }

  setDraftText(key: SessionKey, draftText: string): void {
    this.setUiState(key, { draftText });
    this.updateTabMetadata(key, { dirtyDraft: draftText.trim().length > 0 });
  }

  clearDraft(key: SessionKey): void {
    this.setDraftText(key, "");
  }

  setToolExpanded(key: SessionKey, toolUseId: string, expanded: boolean): void {
    const entry = this.snapshot.entries.get(key);
    if (!entry) return;
    const expandedToolIds = new Set(entry.ui.expandedToolIds);
    const collapsedToolIds = new Set(entry.ui.collapsedToolIds);
    if (expanded) {
      expandedToolIds.add(toolUseId);
      collapsedToolIds.delete(toolUseId);
    } else {
      expandedToolIds.delete(toolUseId);
      collapsedToolIds.add(toolUseId);
    }
    this.setUiState(key, { expandedToolIds, collapsedToolIds });
  }

  private evictIfNeeded(): void {
    let snapshot = this.snapshot;
    const evictable = snapshot.tabs
      .filter((tab) => {
        if (tab.key === snapshot.activeKey) return false;
        if (tab.isPinned) return false;
        const entry = snapshot.entries.get(tab.key);
        if (
          entry?.processState === "in-turn" ||
          entry?.processState === "waiting-input"
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    while (snapshot.tabs.length > snapshot.maxTabs && evictable.length > 0) {
      const tab = evictable.shift();
      if (!tab) break;
      const tabs = snapshot.tabs.filter(
        (candidate) => candidate.key !== tab.key,
      );
      const entries = new Map(snapshot.entries);
      entries.delete(tab.key);
      snapshot = { ...snapshot, tabs, entries };
    }

    const warmEntries = [...snapshot.entries.values()].filter(
      (entry) => entry.lifecycleState !== "cold",
    );
    const warmEvictable = warmEntries
      .filter((entry) => {
        if (entry.key === snapshot.activeKey) return false;
        const tab = snapshot.tabs.find(
          (candidate) => candidate.key === entry.key,
        );
        if (tab?.isPinned) return false;
        return (
          entry.processState !== "in-turn" &&
          entry.processState !== "waiting-input"
        );
      })
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    const entries = new Map(snapshot.entries);
    while (
      warmEntries.length > snapshot.maxWarmEntries &&
      warmEvictable.length
    ) {
      const entry = warmEvictable.shift();
      if (!entry) break;
      entries.set(entry.key, {
        ...entry,
        messages: [],
        agentContent: {},
        toolUseToAgent: new Map(),
        markdownAugments: {},
        pagination: undefined,
        lifecycleState: "cold",
      });
      warmEntries.pop();
    }

    this.commit({ ...snapshot, entries });
  }

  private commit(snapshot: SessionStoreSnapshot): void {
    this.snapshot = snapshot;
    this.persistTabs();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private persistTabs(): void {
    try {
      if (this.snapshot.tabs.length === 0) {
        if (this.lastPersistedTabs !== null) {
          removeServerScoped("sessionTabs", LEGACY_KEYS.sessionTabs);
          this.lastPersistedTabs = null;
        }
        return;
      }

      const serialized = serializePersistedTabs(
        this.snapshot.tabs,
        this.snapshot.activeKey,
      );
      if (serialized === this.lastPersistedTabs) return;

      setServerScoped("sessionTabs", serialized, LEGACY_KEYS.sessionTabs);
      this.lastPersistedTabs = serialized;
    } catch {
      // localStorage may be unavailable or full; tabs should still work in memory.
    }
  }
}
