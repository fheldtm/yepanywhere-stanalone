import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStore, createSessionKey } from "./SessionStore";

describe("SessionStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens, activates, and closes tabs", () => {
    const store = new SessionStore();
    const first = store.openTab("project-a", "session-a");
    const second = store.openTab("project-b", "session-b");

    expect(store.getTabs().map((tab) => tab.key)).toEqual([first, second]);
    expect(store.getActiveKey()).toBe(second);

    store.activateTab(first);
    expect(store.getActiveKey()).toBe(first);

    store.closeTab(first);
    expect(store.getActiveKey()).toBe(second);
    expect(store.getEntry(first)).toBeUndefined();
  });

  it("notifies subscribers when state changes", () => {
    const store = new SessionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.openTab("project-a", "session-a");

    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();

    store.openTab("project-b", "session-b");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps active, pinned, and running entries during eviction", () => {
    const store = new SessionStore({ maxTabs: 3, maxWarmEntries: 3 });

    const active = store.openTab("project", "active");
    const pinned = store.openTab("project", "pinned", { pinned: true });
    const running = store.openTab("project", "running", { activate: false });
    store.patchEntry(running, { processState: "in-turn" });
    store.activateTab(active);

    store.openTab("project", "idle-1", { activate: false });
    store.openTab("project", "idle-2", { activate: false });

    expect(store.getEntry(active)).toBeDefined();
    expect(store.getEntry(pinned)).toBeDefined();
    expect(store.getEntry(running)).toBeDefined();
    expect(
      store
        .getTabs()
        .some((tab) => tab.key === createSessionKey("project", "idle-1")),
    ).toBe(false);
  });

  it("preserves entry state independent of consumers", () => {
    const store = new SessionStore();
    const key = store.openTab("project", "session");

    store.setMessages(key, [{ uuid: "message-1", type: "user" }]);
    store.setUiState(key, { scrollTop: 240 });
    store.setDraftText(key, "hello");

    expect(store.getEntry(key)?.messages).toHaveLength(1);
    expect(store.getEntry(key)?.ui.scrollTop).toBe(240);
    expect(store.getEntry(key)?.ui.draftText).toBe("hello");
    expect(store.getTabs()[0]?.dirtyDraft).toBe(true);

    store.clearDraft(key);
    expect(store.getEntry(key)?.ui.draftText).toBe("");
    expect(store.getTabs()[0]?.dirtyDraft).toBe(false);
  });

  it("persists tab metadata across store instances", () => {
    const firstStore = new SessionStore();
    const first = firstStore.openTab("project-a", "session-a", {
      title: "First session",
      provider: "codex",
      model: "gpt-5",
    });
    const second = firstStore.openTab("project-b", "session-b", {
      title: "Second session",
      pinned: true,
    });

    firstStore.activateTab(first);

    const restoredStore = new SessionStore();

    expect(restoredStore.getTabs()).toMatchObject([
      {
        key: first,
        projectId: "project-a",
        sessionId: "session-a",
        title: "First session",
        provider: "codex",
        model: "gpt-5",
      },
      {
        key: second,
        projectId: "project-b",
        sessionId: "session-b",
        title: "Second session",
        isPinned: true,
      },
    ]);
    expect(restoredStore.getActiveKey()).toBe(first);
    expect(restoredStore.getEntry(first)).toBeDefined();
    expect(restoredStore.getEntry(second)).toBeDefined();
  });
});
