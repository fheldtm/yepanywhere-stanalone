import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal as XtermTerminal } from "@xterm/xterm";
import { useSyncExternalStore } from "react";
import { getDesktopAuthToken } from "../api/client";
import { getTerminalTheme, loadTerminalTheme } from "./terminalThemes";

type TerminalStatus = "idle" | "connecting" | "connected" | "closed" | "error";

type TerminalServerMessage =
  | { type: "ready"; cwd: string; shell: string }
  | { type: "output"; data: string }
  | { type: "exit"; exitCode?: number; signal?: number }
  | { type: "error"; message: string; code?: string }
  | { type: "pong" };

interface TerminalSnapshot {
  status: TerminalStatus;
  statusText: string;
}

type Listener = () => void;

const PING_INTERVAL_MS = 60_000;
const TERMINAL_FONT_FALLBACK =
  '"JetBrains Mono", "D2Coding", "D2 coding", "Cascadia Code", monospace';

function buildTerminalUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = getDesktopAuthToken();
  const url = new URL(`${protocol}//${window.location.host}/api/terminal/ws`);
  if (token) {
    url.searchParams.set("desktop_token", token);
  }
  return url.toString();
}

function decodeBase64Utf8(value: string): string {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.cssText =
    "position:fixed;left:-10000px;top:-10000px;opacity:0;";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

async function readTextFromClipboard(): Promise<string> {
  if (!navigator.clipboard?.readText || !window.isSecureContext) {
    return "";
  }
  return navigator.clipboard.readText();
}

class BrowserTerminalSession {
  private xterm: XtermTerminal | null = null;
  private fitAddon: FitAddon | null = null;
  private ws: WebSocket | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private inputDisposable: { dispose: () => void } | null = null;
  private osc52Disposable: { dispose: () => void } | null = null;
  private parkingElement: HTMLDivElement | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private listeners = new Set<Listener>();
  private snapshot: TerminalSnapshot = {
    status: "idle",
    statusText: "Not started",
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): TerminalSnapshot => this.snapshot;

  getServerSnapshot = (): TerminalSnapshot => this.snapshot;

  attach(container: HTMLDivElement): () => void {
    this.ensureStarted();
    this.mountTerminal(container);
    this.fit();

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      this.fit();
      this.sendResize();
    });
    this.resizeObserver.observe(container);

    window.setTimeout(() => {
      this.fit();
      this.sendResize();
      this.xterm?.focus();
    }, 0);

    return () => {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.parkTerminal();
    };
  }

  private ensureStarted(): void {
    if (!this.xterm) {
      const xterm = new XtermTerminal({
        customGlyphs: true,
        cursorBlink: true,
        convertEol: true,
        fontFamily: this.getCodeFontFamily(),
        fontSize: 13,
        letterSpacing: 0,
        lineHeight: 1,
        rescaleOverlappingGlyphs: true,
        theme: {
          ...getTerminalTheme(loadTerminalTheme()),
        },
      });
      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);
      this.xterm = xterm;
      this.fitAddon = fitAddon;
      this.inputDisposable = xterm.onData((data) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type: "input", data }));
      });
      this.osc52Disposable = xterm.parser.registerOscHandler(52, (data) => {
        void this.handleOsc52(data);
        return true;
      });
    }

    this.applyCurrentCodeFont();
    this.applyTheme(getTerminalTheme(loadTerminalTheme()));

    if (this.started) {
      return;
    }

    this.started = true;
    this.connect();
  }

  private getCodeFontFamily(): string {
    if (typeof window === "undefined") return TERMINAL_FONT_FALLBACK;
    const codeFont = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-code")
      .trim();
    return codeFont || TERMINAL_FONT_FALLBACK;
  }

  private applyCurrentCodeFont(): void {
    if (!this.xterm) return;
    const fontFamily = this.getCodeFontFamily();
    if (this.xterm.options.fontFamily === fontFamily) return;
    this.xterm.options.fontFamily = fontFamily;
  }

  applyTheme(theme: ITheme): void {
    if (!this.xterm) return;
    this.xterm.options.theme = theme;
  }

  private connect(): void {
    this.setSnapshot({ status: "connecting", statusText: "Connecting" });
    const ws = new WebSocket(buildTerminalUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.setSnapshot({ status: "connected", statusText: "Connected" });
      this.startPing();
      this.fit();
      this.sendResize();
      this.xterm?.focus();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as TerminalServerMessage;
        switch (message.type) {
          case "ready":
            this.setSnapshot({
              status: "connected",
              statusText: `${message.shell} · ${message.cwd}`,
            });
            break;
          case "output":
            this.xterm?.write(message.data);
            break;
          case "error":
            this.setSnapshot({ status: "error", statusText: message.message });
            this.xterm?.writeln(`\r\n[terminal] ${message.message}`);
            break;
          case "exit":
            this.setSnapshot({
              status: "closed",
              statusText: "Terminal exited",
            });
            this.xterm?.writeln("\r\n[terminal] exited");
            this.stopPing();
            break;
          case "pong":
            break;
        }
      } catch {
        this.xterm?.write(String(event.data));
      }
    };

    ws.onerror = () => {
      this.setSnapshot({
        status: "error",
        statusText: "Terminal connection failed",
      });
    };

    ws.onclose = () => {
      this.stopPing();
      this.setSnapshot((current) =>
        current.status === "error"
          ? current
          : { status: "closed", statusText: "Disconnected" },
      );
    };
  }

  private mountTerminal(container: HTMLDivElement): void {
    if (!this.xterm) return;
    const element = this.xterm.element;
    if (element) {
      container.appendChild(element);
      return;
    }
    this.xterm.open(container);
  }

  private parkTerminal(): void {
    const element = this.xterm?.element;
    if (!element) return;
    this.getParkingElement().appendChild(element);
  }

  private getParkingElement(): HTMLDivElement {
    if (this.parkingElement) return this.parkingElement;
    const element = document.createElement("div");
    element.setAttribute("aria-hidden", "true");
    element.style.cssText =
      "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden;";
    document.body.appendChild(element);
    this.parkingElement = element;
    return element;
  }

  private fit(): void {
    try {
      this.fitAddon?.fit();
    } catch {
      // xterm fit can throw while its element is moving between containers.
    }
  }

  private sendResize(): void {
    const dims = this.fitAddon?.proposeDimensions();
    if (!dims || this.ws?.readyState !== WebSocket.OPEN) return;
    if (!Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return;
    this.ws.send(
      JSON.stringify({
        type: "resize",
        cols: dims.cols,
        rows: dims.rows,
      }),
    );
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ type: "ping" }));
    }, PING_INTERVAL_MS);
  }

  private async handleOsc52(data: string): Promise<void> {
    const [target, encoded] = data.split(";", 2);
    if (
      !encoded ||
      (target && !["c", "p", "s", "0", "1", "2"].includes(target))
    ) {
      return;
    }

    try {
      if (encoded === "?") {
        const text = await readTextFromClipboard();
        this.sendInput(
          `\x1b]52;${target || "c"};${encodeBase64Utf8(text)}\x1b\\`,
        );
        return;
      }

      const text = decodeBase64Utf8(encoded);
      await copyTextToClipboard(text);
    } catch (error) {
      console.warn("[Terminal] Failed to copy OSC52 payload:", error);
    }
  }

  private sendInput(data: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "input", data }));
  }

  private stopPing(): void {
    if (!this.pingTimer) return;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setSnapshot(
    next: TerminalSnapshot | ((current: TerminalSnapshot) => TerminalSnapshot),
  ): void {
    this.snapshot =
      typeof next === "function"
        ? (next as (current: TerminalSnapshot) => TerminalSnapshot)(
            this.snapshot,
          )
        : next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const browserTerminalSession = new BrowserTerminalSession();

export function useTerminalSessionSnapshot(): TerminalSnapshot {
  return useSyncExternalStore(
    browserTerminalSession.subscribe,
    browserTerminalSession.getSnapshot,
    browserTerminalSession.getServerSnapshot,
  );
}
