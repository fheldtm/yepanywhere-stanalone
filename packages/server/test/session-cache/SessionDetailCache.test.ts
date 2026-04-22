import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toUrlProjectId } from "@yep-anywhere/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionDetailCache } from "../../src/session-cache/index.js";
import type { ISessionReader } from "../../src/sessions/types.js";
import type { Session } from "../../src/supervisor/types.js";

describe("SessionDetailCache", () => {
  let testDir: string;
  let cacheDir: string;
  let sessionFile: string;
  let cache: SessionDetailCache;
  const projectId = toUrlProjectId("/test/project");

  beforeEach(async () => {
    testDir = join(tmpdir(), `session-detail-cache-test-${randomUUID()}`);
    cacheDir = join(testDir, "cache");
    sessionFile = join(testDir, "session.jsonl");
    await mkdir(testDir, { recursive: true });
    await writeFile(sessionFile, '{"type":"user"}\n');

    cache = new SessionDetailCache({ dataDir: cacheDir });
    await cache.initialize();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function createReader(): ISessionReader {
    return {
      listSessions: vi.fn(),
      getSessionSummary: vi.fn(),
      getSession: vi.fn(),
      getSessionSummaryIfChanged: vi.fn(),
      getAgentMappings: vi.fn(),
      getAgentSession: vi.fn(),
      getSessionFilePath: vi.fn(async () => sessionFile),
    } as unknown as ISessionReader;
  }

  function createSession(title: string): Session {
    return {
      id: "session-1",
      projectId,
      title,
      fullTitle: title,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      messageCount: 1,
      ownership: { owner: "none" },
      provider: "claude",
      messages: [
        {
          type: "user",
          message: { role: "user", content: title },
        },
      ],
    };
  }

  it("reuses cached session when source mtime and size match", async () => {
    const reader = createReader();
    const compute = vi.fn(async () => ({ session: createSession("first") }));

    const first = await cache.getOrCompute({
      provider: "claude",
      projectId,
      sessionId: "session-1",
      reader,
      includeOrphans: false,
      compute,
    });
    const second = await cache.getOrCompute({
      provider: "claude",
      projectId,
      sessionId: "session-1",
      reader,
      includeOrphans: false,
      compute,
    });

    expect(first?.session.title).toBe("first");
    expect(second?.session.title).toBe("first");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes when the source file changes", async () => {
    const reader = createReader();
    const compute = vi
      .fn()
      .mockResolvedValueOnce({ session: createSession("first") })
      .mockResolvedValueOnce({ session: createSession("second") });

    await cache.getOrCompute({
      provider: "claude",
      projectId,
      sessionId: "session-1",
      reader,
      includeOrphans: false,
      compute,
    });

    await writeFile(sessionFile, '{"type":"user"}\n{"type":"assistant"}\n');

    const second = await cache.getOrCompute({
      provider: "claude",
      projectId,
      sessionId: "session-1",
      reader,
      includeOrphans: false,
      compute,
    });

    expect(second?.session.title).toBe("second");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("uses separate entries for different view keys", async () => {
    const reader = createReader();
    const compute = vi
      .fn()
      .mockResolvedValueOnce({ session: createSession("full") })
      .mockResolvedValueOnce({ session: createSession("tail") });

    await cache.getOrCompute({
      provider: "claude",
      projectId,
      sessionId: "session-1",
      reader,
      includeOrphans: false,
      viewKey: { tailCompactions: null },
      compute,
    });

    const tail = await cache.getOrCompute({
      provider: "claude",
      projectId,
      sessionId: "session-1",
      reader,
      includeOrphans: false,
      viewKey: { tailCompactions: 2 },
      compute,
    });

    expect(tail?.session.title).toBe("tail");
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
