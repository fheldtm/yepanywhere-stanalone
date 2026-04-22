import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UrlProjectId } from "@yep-anywhere/shared";
import { describe, expect, it, vi } from "vitest";
import type { ProjectScanner } from "../../src/projects/scanner.js";
import { createProjectsRoutes } from "../../src/routes/projects.js";
import type { CodexSessionReader } from "../../src/sessions/codex-reader.js";
import type { ISessionReader } from "../../src/sessions/types.js";
import type { Project, SessionSummary } from "../../src/supervisor/types.js";

function createProject(): Project {
  return {
    id: "proj-1" as UrlProjectId,
    path: "/tmp/project",
    name: "project",
    sessionCount: 1,
    sessionDir: "/tmp/project/.claude-sessions",
    activeOwnedCount: 0,
    activeExternalCount: 0,
    lastActivity: null,
    provider: "claude",
  };
}

function createSummary(): SessionSummary {
  return {
    id: "sess-1",
    projectId: "proj-1" as UrlProjectId,
    title: "Codex project session",
    fullTitle: "Codex project session",
    createdAt: new Date("2026-03-10T09:45:00.000Z").toISOString(),
    updatedAt: new Date("2026-03-10T09:46:00.000Z").toISOString(),
    messageCount: 1,
    ownership: { owner: "none" },
    provider: "codex",
  };
}

describe("Projects Routes", () => {
  it("creates and persists a project directory when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "yep-project-route-"));
    const projectPath = join(root, "new-project");
    const project = { ...createProject(), path: projectPath };
    const addProject = vi.fn(async () => undefined);
    const invalidateCache = vi.fn();

    try {
      const routes = createProjectsRoutes({
        scanner: {
          getOrCreateProject: vi.fn(async () => project),
          invalidateCache,
        } as unknown as ProjectScanner,
        readerFactory: vi.fn(),
        projectMetadataService: {
          addProject,
        } as unknown as NonNullable<
          Parameters<typeof createProjectsRoutes>[0]["projectMetadataService"]
        >,
      });

      const response = await routes.request("/", {
        method: "POST",
        body: JSON.stringify({ path: projectPath, create: true }),
      });

      expect(response.status).toBe(200);
      const stats = await stat(projectPath);
      expect(stats.isDirectory()).toBe(true);
      expect(addProject).toHaveBeenCalled();
      expect(invalidateCache).toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lists mixed-provider sessions through the shared provider resolver", async () => {
    const project = createProject();
    const summary = createSummary();
    const claudeReader = {
      listSessions: vi.fn(async () => []),
    } as unknown as ISessionReader;
    const codexReader = {
      listSessions: vi.fn(async () => [summary]),
    } as unknown as ISessionReader;

    const routes = createProjectsRoutes({
      scanner: {
        getOrCreateProject: vi.fn(async () => project),
      } as unknown as ProjectScanner,
      readerFactory: vi.fn(() => claudeReader),
      codexScanner: {
        listProjects: vi.fn(async () => [{ ...project, provider: "codex" }]),
      } as unknown as NonNullable<
        Parameters<typeof createProjectsRoutes>[0]["codexScanner"]
      >,
      codexSessionsDir: "/tmp/codex-sessions",
      codexReaderFactory: vi.fn(
        () => codexReader as unknown as CodexSessionReader,
      ),
    });

    const response = await routes.request("/proj-1/sessions");
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]).toMatchObject({
      id: "sess-1",
      title: "Codex project session",
      provider: "codex",
    });
  });
});
