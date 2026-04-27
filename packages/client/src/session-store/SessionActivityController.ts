import { activityBus } from "../lib/activityBus";
import type {
  ProcessStateEvent,
  SessionStatusEvent,
  SessionUpdatedEvent,
} from "../lib/activityBus";
import type { SessionDataController } from "./SessionDataController";
import type { SessionStore } from "./SessionStore";
import { createSessionKey } from "./SessionStore";

export class SessionActivityController {
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly store: SessionStore,
    private readonly dataController: SessionDataController,
  ) {}

  start(): void {
    if (this.unsubscribers.length > 0) return;
    activityBus.connect();
    this.unsubscribers.push(
      activityBus.on("session-status-changed", (event) =>
        this.handleSessionStatus(event),
      ),
      activityBus.on("process-state-changed", (event) =>
        this.handleProcessState(event),
      ),
      activityBus.on("session-updated", (event) =>
        this.handleSessionUpdated(event),
      ),
      activityBus.on("file-change", (event) => {
        if (
          event.fileType !== "session" &&
          event.fileType !== "agent-session"
        ) {
          return;
        }
        for (const entry of this.store.getSnapshot().entries.values()) {
          if (
            event.relativePath.includes(entry.sessionId) &&
            entry.status.owner !== "self"
          ) {
            void this.dataController.fetchNewMessages(entry.key);
          }
        }
      }),
      activityBus.on("reconnect", () => {
        for (const entry of this.store.getSnapshot().entries.values()) {
          void this.dataController.fetchSessionMetadata(entry.key);
          if (entry.status.owner !== "self") {
            void this.dataController.fetchNewMessages(entry.key);
          }
        }
      }),
    );
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  private handleSessionStatus(event: SessionStatusEvent): void {
    const key = createSessionKey(event.projectId, event.sessionId);
    this.store.patchEntry(key, { status: event.ownership });
  }

  private handleProcessState(event: ProcessStateEvent): void {
    const key = createSessionKey(event.projectId, event.sessionId);
    if (!this.store.getEntry(key)) return;

    if (
      event.activity === "idle" ||
      event.activity === "in-turn" ||
      event.activity === "waiting-input" ||
      event.activity === "hold"
    ) {
      this.store.patchEntry(key, { processState: event.activity });
    }
    this.store.updateTabMetadata(key, {
      activity: event.activity,
      pendingInputType: event.pendingInputType,
    });
  }

  private handleSessionUpdated(event: SessionUpdatedEvent): void {
    const key = createSessionKey(event.projectId, event.sessionId);
    const entry = this.store.getEntry(key);
    if (!entry?.session) return;

    const session = {
      ...entry.session,
      ...(event.title !== undefined && { title: event.title }),
      ...(event.messageCount !== undefined && {
        messageCount: event.messageCount,
      }),
      ...(event.updatedAt !== undefined && { updatedAt: event.updatedAt }),
      ...(event.contextUsage !== undefined && {
        contextUsage: event.contextUsage,
      }),
      ...(event.model !== undefined && { model: event.model }),
    };

    this.store.patchEntry(key, { session });
    this.store.updateTabMetadata(key, {
      title: event.title ?? entry.session.title,
      model: event.model ?? entry.session.model,
    });
  }
}
