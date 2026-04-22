import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProviderName, UrlProjectId } from "@yep-anywhere/shared";
import type { PaginationInfo } from "../sessions/pagination.js";
import type { ISessionReader } from "../sessions/types.js";
import type { Session } from "../supervisor/types.js";

const CACHE_VERSION = 2;
const DEFAULT_MAX_CACHE_BYTES = 512 * 1024 * 1024;

interface CacheSource {
  filePath: string;
  mtimeMs: number;
  size: number;
}

interface CachedSessionDetail {
  cacheVersion: number;
  key: string;
  cachedAt: string;
  source: CacheSource;
  payload: SessionDetailCachePayload;
}

export interface SessionDetailCacheOptions {
  dataDir: string;
  maxCacheBytes?: number;
}

export interface GetOrComputeSessionParams {
  provider: ProviderName;
  projectId: UrlProjectId;
  sessionId: string;
  reader: ISessionReader;
  includeOrphans: boolean;
  viewKey?: unknown;
  compute: () => Promise<SessionDetailCachePayload | null>;
}

export interface SessionDetailCachePayload {
  session: Session;
  pagination?: PaginationInfo;
}

/**
 * File-backed cache for fully normalized persisted session details.
 *
 * The source JSONL file remains authoritative. Cache entries are reused only
 * when the source file's mtime and size still match the metadata captured when
 * the cache was written.
 */
export class SessionDetailCache {
  private readonly cacheDir: string;
  private readonly maxCacheBytes: number;

  constructor(options: SessionDetailCacheOptions) {
    this.cacheDir = options.dataDir;
    this.maxCacheBytes = Math.max(
      0,
      options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES,
    );
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  async getOrCompute(
    params: GetOrComputeSessionParams,
  ): Promise<SessionDetailCachePayload | null> {
    const source = await this.getSource(params.reader, params.sessionId);
    if (!source) {
      return params.compute();
    }

    const key = this.getCacheKey(params, source.filePath);
    const cachePath = this.getCachePath(key);
    const cached = await this.readCache(cachePath, key, source);
    if (cached) {
      return cached.payload;
    }

    const payload = await params.compute();
    if (!payload) return null;

    const freshSource = await this.getSource(params.reader, params.sessionId);
    if (!freshSource) return payload;

    await this.writeCache(cachePath, {
      cacheVersion: CACHE_VERSION,
      key,
      cachedAt: new Date().toISOString(),
      source: freshSource,
      payload,
    }).catch(() => {
      // Cache writes are best-effort; the session response should still work.
    });
    await this.pruneCache().catch(() => {
      // Cache pruning is best-effort.
    });

    return payload;
  }

  private async getSource(
    reader: ISessionReader,
    sessionId: string,
  ): Promise<CacheSource | null> {
    const filePath = await reader.getSessionFilePath?.(sessionId);
    if (!filePath) return null;

    try {
      const stats = await fs.stat(filePath);
      return {
        filePath,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      };
    } catch {
      return null;
    }
  }

  private getCacheKey(
    params: GetOrComputeSessionParams,
    sourceFilePath: string,
  ): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          version: CACHE_VERSION,
          provider: params.provider,
          projectId: params.projectId,
          sessionId: params.sessionId,
          sourceFilePath,
          includeOrphans: params.includeOrphans,
          viewKey: params.viewKey,
        }),
      )
      .digest("hex");
  }

  private getCachePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  private async readCache(
    cachePath: string,
    key: string,
    source: CacheSource,
  ): Promise<CachedSessionDetail | null> {
    try {
      const content = await fs.readFile(cachePath, "utf-8");
      const cached = JSON.parse(content) as CachedSessionDetail;

      if (
        cached.cacheVersion !== CACHE_VERSION ||
        cached.key !== key ||
        cached.source.filePath !== source.filePath ||
        cached.source.mtimeMs !== source.mtimeMs ||
        cached.source.size !== source.size
      ) {
        return null;
      }

      return cached;
    } catch {
      return null;
    }
  }

  private async writeCache(
    cachePath: string,
    entry: CachedSessionDetail,
  ): Promise<void> {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

    try {
      await fs.writeFile(tempPath, JSON.stringify(entry), "utf-8");
      await fs.rename(tempPath, cachePath);
    } catch (error) {
      await fs.unlink(tempPath).catch(() => {
        // Best-effort cleanup.
      });
      throw error;
    }
  }

  private async pruneCache(): Promise<void> {
    if (this.maxCacheBytes <= 0) return;

    const entries = await fs.readdir(this.cacheDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const filePath = path.join(this.cacheDir, entry.name);
          const stats = await fs.stat(filePath).catch(() => null);
          return stats
            ? { filePath, size: stats.size, mtimeMs: stats.mtimeMs }
            : null;
        }),
    );

    const cacheFiles = files
      .filter(
        (file): file is { filePath: string; size: number; mtimeMs: number } =>
          file !== null,
      )
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    let totalBytes = cacheFiles.reduce((sum, file) => sum + file.size, 0);
    for (const file of cacheFiles) {
      if (totalBytes <= this.maxCacheBytes) break;
      await fs.unlink(file.filePath).catch(() => {
        // Ignore races with other cache writes/prunes.
      });
      totalBytes -= file.size;
    }
  }
}
