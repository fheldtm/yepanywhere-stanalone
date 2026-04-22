import { useCallback, useEffect, useState } from "react";
import { UI_KEYS } from "../lib/storageKeys";

export type FontFamilyTarget = "system" | "conversation" | "code";

export type FontFamilySettings = Record<FontFamilyTarget, string>;

export interface FontFamilyPreset {
  label: string;
  value: string;
}

export const SYSTEM_FONT_PRESETS: FontFamilyPreset[] = [
  {
    label: "Pretendard",
    value: '"Pretendard", "Noto Sans KR", system-ui, sans-serif',
  },
  {
    label: "Noto Sans KR",
    value: '"Noto Sans KR", system-ui, sans-serif',
  },
  {
    label: "SUIT",
    value: '"SUIT", "Noto Sans KR", system-ui, sans-serif',
  },
  {
    label: "IBM Plex Sans KR",
    value: '"IBM Plex Sans KR", "Noto Sans KR", system-ui, sans-serif',
  },
  {
    label: "System Default",
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
  },
];

export const CONVERSATION_FONT_PRESETS: FontFamilyPreset[] = [
  ...SYSTEM_FONT_PRESETS.filter((preset) => preset.label !== "System Default"),
];

export const CODE_FONT_PRESETS: FontFamilyPreset[] = [
  {
    label: "JetBrains Mono",
    value:
      '"JetBrains Mono", "D2Coding", "D2 coding", "Cascadia Code", monospace',
  },
  {
    label: "D2Coding",
    value:
      '"D2Coding", "D2 coding", "JetBrains Mono", "Cascadia Code", monospace',
  },
  {
    label: "Fira Code",
    value: '"Fira Code", "D2Coding", "D2 coding", "Cascadia Code", monospace',
  },
  {
    label: "Cascadia Code",
    value:
      '"Cascadia Code", "D2Coding", "D2 coding", "JetBrains Mono", monospace',
  },
  {
    label: "SF Mono / Monaco",
    value: '"SF Mono", Monaco, "Cascadia Code", Consolas, monospace',
  },
];

export const FONT_FAMILY_PRESETS: Record<FontFamilyTarget, FontFamilyPreset[]> =
  {
    system: SYSTEM_FONT_PRESETS,
    conversation: CONVERSATION_FONT_PRESETS,
    code: CODE_FONT_PRESETS,
  };

export const DEFAULT_FONT_FAMILIES: FontFamilySettings = {
  system: SYSTEM_FONT_PRESETS[0]?.value ?? "",
  conversation: CONVERSATION_FONT_PRESETS[0]?.value ?? "",
  code: CODE_FONT_PRESETS[0]?.value ?? "",
};

function cleanFontFamily(value: string): string {
  return value
    .replace(/[\n\r;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPresetValue(target: FontFamilyTarget, value: string): string {
  const cleaned = cleanFontFamily(value);
  const presets = FONT_FAMILY_PRESETS[target];
  return (
    presets.find((preset) => preset.value === cleaned)?.value ??
    DEFAULT_FONT_FAMILIES[target]
  );
}

function loadFontFamilies(): FontFamilySettings {
  return {
    system: getPresetValue(
      "system",
      localStorage.getItem(UI_KEYS.systemFontFamily) ?? "",
    ),
    conversation: getPresetValue(
      "conversation",
      localStorage.getItem(UI_KEYS.conversationFontFamily) ?? "",
    ),
    code: getPresetValue(
      "code",
      localStorage.getItem(UI_KEYS.codeFontFamily) ?? "",
    ),
  };
}

function saveFontFamily(target: FontFamilyTarget, value: string): void {
  const key =
    target === "system"
      ? UI_KEYS.systemFontFamily
      : target === "conversation"
        ? UI_KEYS.conversationFontFamily
        : UI_KEYS.codeFontFamily;
  const cleaned = cleanFontFamily(value);
  if (cleaned) {
    localStorage.setItem(key, cleaned);
  } else {
    localStorage.removeItem(key);
  }
}

function applyFontFamilies(settings: FontFamilySettings): void {
  const root = document.documentElement;
  const system =
    cleanFontFamily(settings.system) || DEFAULT_FONT_FAMILIES.system;
  const conversation =
    cleanFontFamily(settings.conversation) ||
    DEFAULT_FONT_FAMILIES.conversation;
  const code = cleanFontFamily(settings.code) || DEFAULT_FONT_FAMILIES.code;

  root.style.setProperty("--font-ui", system);
  root.style.setProperty("--font-conversation", conversation);
  root.style.setProperty("--font-code", code);
  root.style.setProperty("--font-sans", system);
  root.style.setProperty("--font-mono", code);
}

export function useFontFamily() {
  const [fontFamilies, setFontFamilies] =
    useState<FontFamilySettings>(loadFontFamilies);

  useEffect(() => {
    applyFontFamilies(fontFamilies);
  }, [fontFamilies]);

  const setFontFamily = useCallback(
    (target: FontFamilyTarget, value: string) => {
      const presetValue = getPresetValue(target, value);
      setFontFamilies((current) => ({ ...current, [target]: presetValue }));
      saveFontFamily(target, presetValue);
    },
    [],
  );

  const resetFontFamily = useCallback((target: FontFamilyTarget) => {
    setFontFamilies((current) => ({
      ...current,
      [target]: DEFAULT_FONT_FAMILIES[target],
    }));
    saveFontFamily(target, "");
  }, []);

  return { fontFamilies, setFontFamily, resetFontFamily };
}

export function initializeFontFamilies(): void {
  applyFontFamilies(loadFontFamilies());
}
