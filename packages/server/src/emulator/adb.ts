import { execSync } from "node:child_process";
import * as os from "node:os";

const isWindows = os.platform() === "win32";

/**
 * Detect if adb is available on PATH.
 * Returns the path to adb, or null if not found.
 */
export function detectAdb(): string | null {
  const cmd = isWindows ? "where adb" : "which adb";
  try {
    const result = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
      .split("\n")[0]
      ?.trim();
    return result || null;
  } catch {
    return null;
  }
}
