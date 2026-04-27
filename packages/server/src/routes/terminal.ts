import * as os from "node:os";
import type { Context } from "hono";
import { Hono } from "hono";
import type { WSContext, WSEvents } from "hono/ws";
import * as pty from "node-pty";

// biome-ignore lint/suspicious/noExplicitAny: Complex third-party type from @hono/node-ws
type UpgradeWebSocketFn = (createEvents: (c: Context) => WSEvents) => any;

type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "ping" }
  | { type: "close" };

type TerminalServerMessage =
  | { type: "ready"; cwd: string; shell: string }
  | { type: "output"; data: string }
  | { type: "exit"; exitCode?: number; signal?: number }
  | { type: "error"; message: string; code?: string }
  | { type: "pong" };

export interface TerminalRoutesDeps {
  upgradeWebSocket: UpgradeWebSocketFn;
  enabled: boolean;
  idleTimeoutMs?: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;

function sendMessage(ws: WSContext, message: TerminalServerMessage): void {
  ws.send(JSON.stringify(message));
}

function sendError(ws: WSContext, message: string, code?: string): void {
  sendMessage(ws, { type: "error", message, code });
}

function normalizeMessageData(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (data instanceof SharedArrayBuffer) {
    return Buffer.from(data as unknown as ArrayBuffer).toString("utf8");
  }
  return null;
}

function parseClientMessage(data: unknown): TerminalClientMessage | null {
  const text = normalizeMessageData(data);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as Partial<TerminalClientMessage>;
    if (parsed.type === "input" && typeof parsed.data === "string") {
      return parsed as TerminalClientMessage;
    }
    if (
      parsed.type === "resize" &&
      typeof parsed.cols === "number" &&
      typeof parsed.rows === "number"
    ) {
      return parsed as TerminalClientMessage;
    }
    if (parsed.type === "ping" || parsed.type === "close") {
      return parsed as TerminalClientMessage;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "powershell.exe";
  }
  return process.env.SHELL ?? "/bin/bash";
}

function clampTerminalSize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function createTerminalRoutes(deps: TerminalRoutesDeps): Hono {
  const routes = new Hono();
  const idleTimeoutMs = deps.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

  routes.get(
    "/terminal/ws",
    deps.upgradeWebSocket((c) => {
      let terminal: pty.IPty | null = null;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let validationPromise: Promise<void> | null = null;
      let closed = false;

      const closeTerminal = () => {
        if (closed) return;
        closed = true;
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
        if (terminal) {
          terminal.kill();
          terminal = null;
        }
      };

      const resetIdleTimer = (ws: WSContext) => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          sendError(ws, "Terminal closed after being idle.", "IDLE_TIMEOUT");
          ws.close(1000, "Idle timeout");
          closeTerminal();
        }, idleTimeoutMs);
      };

      const validateAndOpen = async (ws: WSContext): Promise<void> => {
        if (!deps.enabled) {
          sendError(ws, "Terminal access is disabled.", "TERMINAL_DISABLED");
          ws.close(1008, "Terminal disabled");
          return;
        }

        const shell = resolveShell();
        const cwd = process.cwd();
        console.log(`[Terminal] Opening terminal (${cwd})`);
        terminal = pty.spawn(shell, [], {
          name: "xterm-256color",
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          cwd,
          env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            YEP_ANYWHERE_TERMINAL: "true",
          },
        });

        terminal.onData((data) => {
          sendMessage(ws, { type: "output", data });
        });
        terminal.onExit(({ exitCode, signal }) => {
          sendMessage(ws, { type: "exit", exitCode, signal });
          ws.close(1000, "Terminal exited");
          closeTerminal();
        });

        sendMessage(ws, { type: "ready", cwd, shell });
        resetIdleTimer(ws);
      };

      return {
        onOpen(_evt, ws) {
          validationPromise = validateAndOpen(ws).catch((error) => {
            const message =
              error instanceof Error
                ? error.message
                : "Failed to open terminal";
            console.error("[Terminal] Failed to open terminal:", error);
            sendError(ws, message, "OPEN_FAILED");
            ws.close(1011, "Terminal open failed");
            closeTerminal();
          });
        },
        onMessage(evt, ws) {
          const processMessage = async () => {
            if (validationPromise) await validationPromise;
            if (!terminal) return;

            const message = parseClientMessage(evt.data);
            if (!message) {
              sendError(ws, "Invalid terminal message.", "INVALID_MESSAGE");
              return;
            }

            resetIdleTimer(ws);
            switch (message.type) {
              case "input":
                terminal.write(message.data);
                break;
              case "resize":
                terminal.resize(
                  clampTerminalSize(message.cols, 10, 400),
                  clampTerminalSize(message.rows, 4, 120),
                );
                break;
              case "ping":
                sendMessage(ws, { type: "pong" });
                break;
              case "close":
                ws.close(1000, "Client closed terminal");
                closeTerminal();
                break;
            }
          };

          processMessage().catch((error) => {
            const message =
              error instanceof Error
                ? error.message
                : "Terminal message failed";
            console.error("[Terminal] Message handling failed:", error);
            sendError(ws, message, "MESSAGE_FAILED");
          });
        },
        onClose() {
          closeTerminal();
        },
        onError(_evt, _ws) {
          closeTerminal();
        },
      };
    }),
  );

  routes.get("/status", (c) =>
    c.json({
      enabled: deps.enabled,
      platform: os.platform(),
      idleTimeoutMs,
    }),
  );

  return routes;
}
