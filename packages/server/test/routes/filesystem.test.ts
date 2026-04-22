import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProjectScanner } from "../../src/projects/scanner.js";
import { createFilesystemRoutes } from "../../src/routes/filesystem.js";

async function withTempDir<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "yep-filesystem-route-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function routes() {
  return createFilesystemRoutes({
    scanner: {
      listProjects: vi.fn(async () => []),
    } as unknown as ProjectScanner,
  });
}

describe("Filesystem Routes", () => {
  it("lists child directories with empty-folder capabilities", async () => {
    await withTempDir(async (root) => {
      const emptyDir = join(root, "empty");
      const fullDir = join(root, "full");
      await mkdir(emptyDir);
      await mkdir(fullDir);
      await writeFile(join(fullDir, "file.txt"), "content");

      const response = await routes().request(
        `/directories?path=${encodeURIComponent(root)}`,
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "empty",
            isEmpty: true,
            canRename: true,
            canDelete: true,
          }),
          expect.objectContaining({
            name: "full",
            isEmpty: false,
            canRename: false,
            canDelete: false,
          }),
        ]),
      );
    });
  });

  it("creates a child directory", async () => {
    await withTempDir(async (root) => {
      const response = await routes().request("/directories", {
        method: "POST",
        body: JSON.stringify({ parentPath: root, name: "created" }),
      });

      expect(response.status).toBe(200);
      const stats = await stat(join(root, "created"));
      expect(stats.isDirectory()).toBe(true);
    });
  });

  it("renames only empty folders", async () => {
    await withTempDir(async (root) => {
      const emptyDir = join(root, "empty");
      const fullDir = join(root, "full");
      await mkdir(emptyDir);
      await mkdir(fullDir);
      await writeFile(join(fullDir, "file.txt"), "content");

      const renameEmpty = await routes().request("/directories", {
        method: "PATCH",
        body: JSON.stringify({ path: emptyDir, name: "renamed" }),
      });
      expect(renameEmpty.status).toBe(200);
      await expect(stat(join(root, "renamed"))).resolves.toBeTruthy();

      const renameFull = await routes().request("/directories", {
        method: "PATCH",
        body: JSON.stringify({ path: fullDir, name: "blocked" }),
      });
      expect(renameFull.status).toBe(400);
      const json = await renameFull.json();
      expect(json.error).toContain("Only empty folders");
    });
  });

  it("deletes only empty folders", async () => {
    await withTempDir(async (root) => {
      const emptyDir = join(root, "empty");
      const fullDir = join(root, "full");
      await mkdir(emptyDir);
      await mkdir(fullDir);
      await writeFile(join(fullDir, "file.txt"), "content");

      const deleteFull = await routes().request(
        `/directories?path=${encodeURIComponent(fullDir)}`,
        { method: "DELETE" },
      );
      expect(deleteFull.status).toBe(400);
      expect((await deleteFull.json()).error).toContain("Only empty folders");

      const deleteEmpty = await routes().request(
        `/directories?path=${encodeURIComponent(emptyDir)}`,
        { method: "DELETE" },
      );
      expect(deleteEmpty.status).toBe(200);
      await expect(readdir(root)).resolves.toEqual(["full"]);
    });
  });

  it("rejects invalid folder names", async () => {
    await withTempDir(async (root) => {
      const response = await routes().request("/directories", {
        method: "POST",
        body: JSON.stringify({ parentPath: root, name: "../bad" }),
      });

      expect(response.status).toBe(400);
    });
  });
});
