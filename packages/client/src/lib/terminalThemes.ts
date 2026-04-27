import type { ITheme } from "@xterm/xterm";
import { UI_KEYS } from "./storageKeys";

export type TerminalThemeId =
  | "system"
  | "yep-dark"
  | "nord"
  | "one-dark"
  | "solarized-dark"
  | "solarized-light"
  | "github-dark"
  | "github-light";

export interface TerminalThemePreset {
  id: TerminalThemeId;
  label: string;
  theme: ITheme;
}

export const TERMINAL_THEME_IDS: TerminalThemeId[] = [
  "system",
  "yep-dark",
  "nord",
  "one-dark",
  "solarized-dark",
  "solarized-light",
  "github-dark",
  "github-light",
];

export const TERMINAL_THEME_PRESETS: TerminalThemePreset[] = [
  {
    id: "system",
    label: "System",
    theme: {},
  },
  {
    id: "yep-dark",
    label: "Yep Dark",
    theme: {
      background: "#0f1117",
      foreground: "#d8dee9",
      cursor: "#d8dee9",
      selectionBackground: "#394150",
      black: "#161821",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#d8dee9",
      brightBlack: "#5c6370",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "nord",
    label: "Nord",
    theme: {
      background: "#2e3440",
      foreground: "#d8dee9",
      cursor: "#d8dee9",
      selectionBackground: "#4c566a",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#bf616a",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4",
    },
  },
  {
    id: "one-dark",
    label: "One Dark",
    theme: {
      background: "#282c34",
      foreground: "#abb2bf",
      cursor: "#abb2bf",
      selectionBackground: "#3e4451",
      black: "#282c34",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#abb2bf",
      brightBlack: "#5c6370",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    theme: {
      background: "#002b36",
      foreground: "#839496",
      cursor: "#93a1a1",
      selectionBackground: "#073642",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    theme: {
      background: "#fdf6e3",
      foreground: "#657b83",
      cursor: "#586e75",
      selectionBackground: "#eee8d5",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    theme: {
      background: "#0d1117",
      foreground: "#c9d1d9",
      cursor: "#c9d1d9",
      selectionBackground: "#264f78",
      black: "#484f58",
      red: "#ff7b72",
      green: "#3fb950",
      yellow: "#d29922",
      blue: "#58a6ff",
      magenta: "#bc8cff",
      cyan: "#39c5cf",
      white: "#b1bac4",
      brightBlack: "#6e7681",
      brightRed: "#ffa198",
      brightGreen: "#56d364",
      brightYellow: "#e3b341",
      brightBlue: "#79c0ff",
      brightMagenta: "#d2a8ff",
      brightCyan: "#56d4dd",
      brightWhite: "#f0f6fc",
    },
  },
  {
    id: "github-light",
    label: "GitHub Light",
    theme: {
      background: "#ffffff",
      foreground: "#24292f",
      cursor: "#24292f",
      selectionBackground: "#b6d7ff",
      black: "#24292f",
      red: "#cf222e",
      green: "#116329",
      yellow: "#4d2d00",
      blue: "#0969da",
      magenta: "#8250df",
      cyan: "#1b7c83",
      white: "#6e7781",
      brightBlack: "#57606a",
      brightRed: "#a40e26",
      brightGreen: "#1a7f37",
      brightYellow: "#633c01",
      brightBlue: "#218bff",
      brightMagenta: "#a475f9",
      brightCyan: "#3192aa",
      brightWhite: "#8c959f",
    },
  },
];

const DEFAULT_TERMINAL_THEME: TerminalThemeId = "yep-dark";
const DEFAULT_TERMINAL_THEME_PRESET =
  TERMINAL_THEME_PRESETS.find((preset) => preset.id === DEFAULT_TERMINAL_THEME)
    ?.theme ?? {};

export function normalizeTerminalTheme(value: string | null): TerminalThemeId {
  return TERMINAL_THEME_IDS.includes(value as TerminalThemeId)
    ? (value as TerminalThemeId)
    : DEFAULT_TERMINAL_THEME;
}

export function loadTerminalTheme(): TerminalThemeId {
  return normalizeTerminalTheme(localStorage.getItem(UI_KEYS.terminalTheme));
}

export function saveTerminalTheme(theme: TerminalThemeId): void {
  localStorage.setItem(UI_KEYS.terminalTheme, theme);
}

function getResolvedAppTheme(): "light" | "dark" {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme === "dark" || theme === "light") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getTerminalTheme(themeId: TerminalThemeId): ITheme {
  const resolvedId =
    themeId === "system"
      ? getResolvedAppTheme() === "dark"
        ? "yep-dark"
        : "github-light"
      : themeId;
  return (
    TERMINAL_THEME_PRESETS.find((preset) => preset.id === resolvedId)?.theme ??
    DEFAULT_TERMINAL_THEME_PRESET
  );
}
