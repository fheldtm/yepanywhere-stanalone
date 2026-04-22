import { useCallback, useEffect, useState } from "react";
import { UI_KEYS } from "../lib/storageKeys";

export type Theme = "auto" | "light" | "dark";
export type CustomPaletteStrength = "subtle" | "balanced" | "colorful";

export interface CustomPalette {
  baseColor: string;
  strength: CustomPaletteStrength;
}

export const CUSTOM_PALETTE_STRENGTHS: CustomPaletteStrength[] = [
  "subtle",
  "balanced",
  "colorful",
];

export const DEFAULT_CUSTOM_PALETTE: CustomPalette = {
  baseColor: "#a78bfa",
  strength: "balanced",
};

const themeLabels: Record<Theme, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

export const THEMES: Theme[] = ["auto", "light", "dark"];

const CUSTOM_PALETTE_STRENGTH_VALUES: Record<
  CustomPaletteStrength,
  {
    surfaceChroma: string;
    neutralChroma: string;
    hoverChroma: string;
    accentChroma: string;
  }
> = {
  subtle: {
    surfaceChroma: "0.01",
    neutralChroma: "0.018",
    hoverChroma: "0.038",
    accentChroma: "0.12",
  },
  balanced: {
    surfaceChroma: "0.016",
    neutralChroma: "0.028",
    hoverChroma: "0.06",
    accentChroma: "0.16",
  },
  colorful: {
    surfaceChroma: "0.026",
    neutralChroma: "0.044",
    hoverChroma: "0.085",
    accentChroma: "0.19",
  },
};

interface OklchColor {
  lightness: number;
  chroma: number;
  hue: number;
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const shortMatch = /^#?([0-9a-fA-F]{3})$/.exec(trimmed);
  const shortHex = shortMatch?.[1];
  if (shortHex) {
    return `#${shortHex
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toLowerCase()}`;
  }

  const match = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  const hex = match?.[1];
  return hex ? `#${hex.toLowerCase()}` : null;
}

function normalizeCustomPalette(value: Partial<CustomPalette>): CustomPalette {
  const baseColor =
    normalizeHexColor(value.baseColor) ?? DEFAULT_CUSTOM_PALETTE.baseColor;
  const strength = CUSTOM_PALETTE_STRENGTHS.includes(
    value.strength as CustomPaletteStrength,
  )
    ? (value.strength as CustomPaletteStrength)
    : DEFAULT_CUSTOM_PALETTE.strength;

  return { baseColor, strength };
}

function loadCustomPalette(): CustomPalette {
  try {
    const stored = localStorage.getItem(UI_KEYS.customPalette);
    if (!stored) return DEFAULT_CUSTOM_PALETTE;
    const parsed = JSON.parse(stored) as Partial<CustomPalette>;
    return normalizeCustomPalette(parsed);
  } catch {
    return DEFAULT_CUSTOM_PALETTE;
  }
}

function saveCustomPalette(palette: CustomPalette) {
  localStorage.setItem(UI_KEYS.customPalette, JSON.stringify(palette));
}

function srgbChannelToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function getOklchColor(hexColor: string): OklchColor {
  const normalized =
    normalizeHexColor(hexColor) ?? DEFAULT_CUSTOM_PALETTE.baseColor;
  const red = srgbChannelToLinear(Number.parseInt(normalized.slice(1, 3), 16));
  const green = srgbChannelToLinear(
    Number.parseInt(normalized.slice(3, 5), 16),
  );
  const blue = srgbChannelToLinear(Number.parseInt(normalized.slice(5, 7), 16));

  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  const lightness =
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const b = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const chroma = Math.sqrt(a * a + b * b);
  const hue =
    chroma < 0.0001
      ? 300
      : (Math.atan2(b, a) * 180) / Math.PI + (b < 0 ? 360 : 0);

  return { lightness, chroma, hue };
}

function applyCustomPalette(palette: CustomPalette) {
  const root = document.documentElement;
  const strength = CUSTOM_PALETTE_STRENGTH_VALUES[palette.strength];
  const color = getOklchColor(palette.baseColor);
  const neutralBaseChroma = color.chroma < 0.015 ? 0 : 1;
  const accentLightness = Math.min(
    0.7,
    Math.max(0.32, color.lightness || 0.52),
  );

  root.style.setProperty("--custom-palette-base", palette.baseColor);
  root.style.setProperty("--custom-palette-h", color.hue.toFixed(2));
  root.style.setProperty(
    "--custom-palette-accent-l",
    `${(accentLightness * 100).toFixed(1)}%`,
  );
  root.style.setProperty(
    "--custom-palette-surface-c",
    String(Number(strength.surfaceChroma) * neutralBaseChroma),
  );
  root.style.setProperty(
    "--custom-palette-neutral-c",
    String(Number(strength.neutralChroma) * neutralBaseChroma),
  );
  root.style.setProperty(
    "--custom-palette-hover-c",
    String(Number(strength.hoverChroma) * neutralBaseChroma),
  );
  root.style.setProperty(
    "--custom-palette-accent-c",
    String(Number(strength.accentChroma) * neutralBaseChroma),
  );
}

export function getThemeLabel(theme: Theme): string {
  return themeLabels[theme];
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
}

function loadTheme(): Theme {
  const stored = localStorage.getItem(UI_KEYS.theme);
  if (stored && THEMES.includes(stored as Theme)) {
    return stored as Theme;
  }
  if (stored === "verydark") return "dark";
  if (stored === "custom") return "light";
  return "auto";
}

function saveTheme(theme: Theme) {
  localStorage.setItem(UI_KEYS.theme, theme);
}

/**
 * Hook to manage theme preference.
 * Persists to localStorage and applies data-theme attribute.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [customPalette, setCustomPaletteState] =
    useState<CustomPalette>(loadCustomPalette);

  useEffect(() => {
    applyCustomPalette(customPalette);
    applyTheme(theme);
  }, [theme, customPalette]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    saveTheme(newTheme);
  }, []);

  const setCustomPalette = useCallback((updates: Partial<CustomPalette>) => {
    setCustomPaletteState((current) => {
      const next = normalizeCustomPalette({ ...current, ...updates });
      saveCustomPalette(next);
      return next;
    });
  }, []);

  const resetCustomPalette = useCallback(() => {
    setCustomPaletteState(DEFAULT_CUSTOM_PALETTE);
    saveCustomPalette(DEFAULT_CUSTOM_PALETTE);
  }, []);

  return {
    theme,
    setTheme,
    customPalette,
    setCustomPalette,
    resetCustomPalette,
  };
}

/**
 * Initialize theme on app load (call once at startup).
 * This runs before React renders to avoid flash of wrong theme.
 */
export function initializeTheme() {
  const theme = loadTheme();
  applyCustomPalette(loadCustomPalette());
  applyTheme(theme);
}

/**
 * Get current resolved theme (useful for components that need
 * to know if we're actually in light or dark mode when auto)
 */
export function getResolvedTheme(): "light" | "dark" {
  const stored = loadTheme();
  if (stored === "auto") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return stored === "light" ? "light" : "dark";
}

/**
 * Hook to reactively get the resolved theme (light or dark).
 * Listens for both localStorage changes and system preference changes.
 */
export function useResolvedTheme(): "light" | "dark" {
  const [resolved, setResolved] = useState<"light" | "dark">(getResolvedTheme);

  useEffect(() => {
    const update = () => setResolved(getResolvedTheme());

    // Listen for system preference changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    mediaQuery.addEventListener("change", update);

    // Listen for storage changes (theme changed in another tab or by useTheme)
    window.addEventListener("storage", update);

    // Also listen for attribute changes on documentElement (for same-tab updates)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "data-theme"
        ) {
          update();
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });

    return () => {
      mediaQuery.removeEventListener("change", update);
      window.removeEventListener("storage", update);
      observer.disconnect();
    };
  }, []);

  return resolved;
}
