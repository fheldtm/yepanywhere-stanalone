import { mkdir, readdir, rename, rmdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { Hono } from "hono";
import { canonicalizeProjectPath, isAbsolutePath } from "../projects/paths.js";
import type { ProjectScanner } from "../projects/scanner.js";

export interface FilesystemDeps {
  scanner: ProjectScanner;
}

interface DirectoryEntry {
  name: string;
  path: string;
  isHidden: boolean;
  isEmpty: boolean;
  canRename: boolean;
  canDelete: boolean;
}

const RESERVED_ROOTS = new Set(["/", homedir()]);

function normalizeDirectoryPath(input: string): string {
  let normalized = input.trim();
  if (normalized.startsWith("~")) {
    normalized = normalized.replace("~", homedir());
  }
  if (normalized.length > 1 && /[/\\]$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  normalized = resolve(normalized);
  return canonicalizeProjectPath(normalized);
}

function isProtectedPath(path: string): boolean {
  return RESERVED_ROOTS.has(path);
}

function isValidFolderName(name: string): boolean {
  return (
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}

async function ensureDirectory(path: string) {
  if (!isAbsolutePath(path)) {
    throw new Error("Path must be absolute");
  }
  const stats = await stat(path);
  if (!stats.isDirectory()) {
    throw new Error("Path is not a directory");
  }
  return stats;
}

async function readIsEmpty(path: string): Promise<boolean> {
  const entries = await readdir(path);
  return entries.length === 0;
}

async function toDirectoryEntry(path: string): Promise<DirectoryEntry | null> {
  try {
    const stats = await stat(path);
    if (!stats.isDirectory()) return null;
    const isEmpty = await readIsEmpty(path);
    const name = basename(path) || path;
    const isProtected = isProtectedPath(path);
    return {
      name,
      path,
      isHidden: name.startsWith("."),
      isEmpty,
      canRename: isEmpty && !isProtected,
      canDelete: isEmpty && !isProtected,
    };
  } catch {
    return null;
  }
}

async function assertEmptyMutableDirectory(path: string) {
  await ensureDirectory(path);
  if (isProtectedPath(path)) {
    throw new Error("This folder cannot be modified");
  }
  const isEmpty = await readIsEmpty(path);
  if (!isEmpty) {
    throw new Error("Only empty folders can be modified or deleted");
  }
}

export function createFilesystemRoutes(deps: FilesystemDeps): Hono {
  const routes = new Hono();

  routes.get("/roots", async () => {
    const rootCandidates = new Map<string, { label: string; path: string }>();
    const home = homedir();
    rootCandidates.set(home, { label: "Home", path: home });

    try {
      const cwd = process.cwd();
      rootCandidates.set(cwd, { label: "Current workspace", path: cwd });
    } catch {
      // Ignore cwd lookup failures.
    }

    try {
      const projects = await deps.scanner.listProjects();
      for (const project of projects.slice(0, 20)) {
        const parent = dirname(project.path);
        if (!rootCandidates.has(parent)) {
          rootCandidates.set(parent, {
            label: basename(parent) || parent,
            path: parent,
          });
        }
      }
    } catch {
      // Roots are best-effort; home/current workspace are enough to browse.
    }

    return Response.json({ roots: [...rootCandidates.values()] });
  });

  routes.get("/directories", async (c) => {
    const rawPath = c.req.query("path");
    if (!rawPath) {
      return c.json({ error: "path is required" }, 400);
    }

    let path: string;
    try {
      path = normalizeDirectoryPath(rawPath);
      await ensureDirectory(path);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Invalid path" },
        400,
      );
    }

    let names: string[];
    try {
      names = await readdir(path);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to read directory",
        },
        403,
      );
    }

    const entries = (
      await Promise.all(
        names.map((name) => toDirectoryEntry(resolve(path, name))),
      )
    )
      .filter((entry): entry is DirectoryEntry => entry !== null)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      );

    return c.json({
      directory: {
        name: basename(path) || path,
        path,
        parentPath: path === dirname(path) ? null : dirname(path),
        isRoot: path === dirname(path),
      },
      entries,
    });
  });

  routes.post("/directories", async (c) => {
    let body: { parentPath?: string; name?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.parentPath || !body.name) {
      return c.json({ error: "parentPath and name are required" }, 400);
    }
    if (!isValidFolderName(body.name)) {
      return c.json({ error: "Invalid folder name" }, 400);
    }

    try {
      const parentPath = normalizeDirectoryPath(body.parentPath);
      await ensureDirectory(parentPath);
      const path = resolve(parentPath, body.name);
      await mkdir(path);
      const entry = await toDirectoryEntry(path);
      return c.json({ entry });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to create folder",
        },
        400,
      );
    }
  });

  routes.patch("/directories", async (c) => {
    let body: { path?: string; name?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.path || !body.name) {
      return c.json({ error: "path and name are required" }, 400);
    }
    if (!isValidFolderName(body.name)) {
      return c.json({ error: "Invalid folder name" }, 400);
    }

    try {
      const path = normalizeDirectoryPath(body.path);
      await assertEmptyMutableDirectory(path);
      const nextPath = resolve(dirname(path), body.name);
      await rename(path, nextPath);
      const entry = await toDirectoryEntry(nextPath);
      return c.json({ entry });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to rename folder",
        },
        400,
      );
    }
  });

  routes.delete("/directories", async (c) => {
    const rawPath = c.req.query("path");
    if (!rawPath) {
      return c.json({ error: "path is required" }, 400);
    }

    try {
      const path = normalizeDirectoryPath(rawPath);
      await assertEmptyMutableDirectory(path);
      await rmdir(path);
      return c.json({ deleted: true });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to delete folder",
        },
        400,
      );
    }
  });

  return routes;
}
