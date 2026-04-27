import { toUrlProjectId } from "@yep-anywhere/shared";
import { describe, expect, it, vi } from "vitest";
import { SessionDataController, SessionStore } from ".";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: {
    getSession: vi.fn(),
    getSessionMetadata: vi.fn(),
  },
}));

const mockApi = vi.mocked(api);

function createSessionResponse(messageText: string) {
  return {
    session: {
      id: "session",
      projectId: toUrlProjectId("/project"),
      title: messageText,
      fullTitle: messageText,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      messageCount: 1,
      ownership: { owner: "none" as const },
      provider: "claude" as const,
      messages: [],
    },
    messages: [
      {
        uuid: "message-1",
        type: "user",
        message: { role: "user" as const, content: messageText },
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ],
    ownership: { owner: "none" as const },
    pendingInputRequest: null,
    slashCommands: null,
  };
}

describe("SessionDataController", () => {
  it("deduplicates concurrent hydrate calls", async () => {
    mockApi.getSession.mockResolvedValue(createSessionResponse("hello"));
    const store = new SessionStore();
    const key = store.openTab("project", "session");
    const controller = new SessionDataController(store);

    await Promise.all([
      controller.hydrateSessionEntry(key),
      controller.hydrateSessionEntry(key),
    ]);

    expect(mockApi.getSession).toHaveBeenCalledTimes(1);
    expect(store.getEntry(key)?.messages).toHaveLength(1);
  });

  it("buffers stream messages until hydration completes", async () => {
    mockApi.getSession.mockResolvedValue(createSessionResponse("persisted"));
    const store = new SessionStore();
    const key = store.openTab("project", "session");
    const controller = new SessionDataController(store);

    controller.applyStreamMessage(key, {
      uuid: "message-2",
      type: "assistant",
      message: { role: "assistant", content: "streamed" },
      timestamp: "2026-01-01T00:00:01.000Z",
    });

    expect(store.getEntry(key)?.messages).toHaveLength(0);

    await controller.hydrateSessionEntry(key);

    expect(
      store.getEntry(key)?.messages.map((message) => message.uuid),
    ).toEqual(["message-1", "message-2"]);
  });
});
