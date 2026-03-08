import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("loadConfig codex paths", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses CODEX_HOME/sessions when CODEX_SESSIONS_DIR is unset", async () => {
    vi.stubEnv("CODEX_HOME", "/tmp/custom-codex-home");

    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config.codexSessionsDir).toBe("/tmp/custom-codex-home/sessions");
  });

  it("prefers CODEX_SESSIONS_DIR over CODEX_HOME", async () => {
    vi.stubEnv("CODEX_HOME", "/tmp/custom-codex-home");
    vi.stubEnv("CODEX_SESSIONS_DIR", "/tmp/explicit-codex-sessions");

    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config.codexSessionsDir).toBe("/tmp/explicit-codex-sessions");
  });

  it("falls back to ~/.codex/sessions when neither env var is set", async () => {
    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config.codexSessionsDir).toBe(
      path.join(os.homedir(), ".codex", "sessions"),
    );
  });
});
