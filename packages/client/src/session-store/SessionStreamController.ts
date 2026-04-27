import {
  type Subscription,
  connectionManager,
  getGlobalConnection,
  getWebSocketConnection,
  isNonRetryableError,
} from "../lib/connection";
import type { SessionDataController } from "./SessionDataController";
import type { SessionStore } from "./SessionStore";
import type { SessionKey, SessionStreamState } from "./types";

interface SessionConnection {
  subscribeSession: (
    sessionId: string,
    handlers: {
      onEvent: (
        eventType: string,
        eventId: string | undefined,
        data: unknown,
      ) => void;
      onOpen?: () => void;
      onError?: (err: Error) => void;
      onClose?: () => void;
    },
    lastEventId?: string,
  ) => Subscription;
}

interface StreamRecord {
  subscription: Subscription | null;
  lastEventId: string | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  starting: boolean;
}

export class SessionStreamController {
  private streams = new Map<SessionKey, StreamRecord>();

  constructor(
    private readonly store: SessionStore,
    private readonly dataController: SessionDataController,
  ) {}

  start(key: SessionKey): void {
    const entry = this.store.getEntry(key);
    if (!entry) return;
    if (entry.status.owner !== "self") return;

    const current = this.streams.get(key);
    if (current?.subscription || current?.starting) return;

    const record = current ?? {
      subscription: null,
      lastEventId: null,
      reconnectTimer: null,
      starting: false,
    };
    record.starting = true;
    this.streams.set(key, record);
    this.patchStreamState(key, "connecting");

    const connection = this.getConnection();
    let subscription: Subscription | null = null;
    const isStale = () =>
      subscription !== null &&
      this.streams.get(key)?.subscription !== subscription;

    subscription = connection.subscribeSession(
      entry.sessionId,
      {
        onEvent: (eventType, eventId, data) => {
          connectionManager.recordEvent();
          if (eventType === "heartbeat") {
            connectionManager.recordHeartbeat();
            return;
          }
          if (eventId) {
            record.lastEventId = eventId;
          }
          this.handleStreamEvent(key, eventType, data);
        },
        onOpen: () => {
          if (isStale()) return;
          this.patchStreamState(key, "connected");
          connectionManager.markConnected();
        },
        onError: (error) => {
          if (isStale()) return;
          this.patchStreamState(key, "error");
          record.subscription = null;
          record.starting = false;
          if (!isNonRetryableError(error)) {
            connectionManager.handleError(error);
          }
        },
        onClose: () => {
          if (isStale()) return;
          this.patchStreamState(key, "disconnected");
          record.subscription = null;
          record.starting = false;
        },
      },
      record.lastEventId ?? undefined,
    );

    record.subscription = subscription;
    record.starting = false;
  }

  stop(key: SessionKey): void {
    const record = this.streams.get(key);
    if (!record) return;
    if (record.reconnectTimer) {
      clearTimeout(record.reconnectTimer);
    }
    record.subscription?.close();
    this.streams.delete(key);
    this.patchStreamState(key, "disabled");
  }

  reconcile(key: SessionKey): void {
    const entry = this.store.getEntry(key);
    if (!entry) {
      this.stop(key);
      return;
    }
    if (entry.lifecycleState === "hot") {
      this.stop(key);
      return;
    }
    if (entry.status.owner === "self") {
      this.start(key);
      return;
    }
    if (
      entry.status.owner === "none" &&
      entry.processState !== "in-turn" &&
      entry.processState !== "waiting-input"
    ) {
      this.stop(key);
    }
  }

  stopAll(): void {
    for (const key of [...this.streams.keys()]) {
      this.stop(key);
    }
  }

  private getConnection(): SessionConnection {
    return getGlobalConnection() ?? getWebSocketConnection();
  }

  private patchStreamState(
    key: SessionKey,
    streamState: SessionStreamState,
  ): void {
    const entry = this.store.getEntry(key);
    if (!entry || entry.streamState === streamState) return;
    this.store.patchEntry(key, { streamState });
  }

  private handleStreamEvent(
    key: SessionKey,
    eventType: string,
    data: unknown,
  ): void {
    const payload = data as { [key: string]: unknown };
    if (eventType === "message") {
      this.dataController.applyStreamMessage(key, {
        ...payload,
        eventType: undefined,
      });
      return;
    }
    if (eventType === "status") {
      const state = payload.state;
      if (
        state === "idle" ||
        state === "in-turn" ||
        state === "waiting-input" ||
        state === "hold"
      ) {
        this.store.patchEntry(key, { processState: state });
      }
      return;
    }
    if (eventType === "deferred-queue") {
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      this.store.patchEntry(key, {
        deferredMessages: messages as never,
      });
      return;
    }
    if (eventType === "complete") {
      this.store.patchEntry(key, {
        processState: "idle",
        status: { owner: "none" },
        pendingInputRequest: null,
        deferredMessages: [],
      });
      this.stop(key);
    }
  }
}
