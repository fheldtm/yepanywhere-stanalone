import { useCallback, useEffect, useState } from "react";
import { UI_KEYS } from "../lib/storageKeys";

export type FontFamilyTarget = "system" | "conversation" | "code";

export type FontFamilySettings = Record<FontFamilyTarget, string>;

export const DEFAULT_FONT_FAMILIES: FontFamilySettings = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
  conversation:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
  code: '"SF Mono", Monaco, "Cascadia Code", Consolas, monospace',
};

function cleanFontFamily(value: string): string {
  return value
    .replace(/[\n\r;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadFontFamilies(): FontFamilySettings {
  return {
    system:
      cleanFontFamily(localStorage.getItem(UI_KEYS.systemFontFamily) ?? "") ||
      DEFAULT_FONT_FAMILIES.system,
    conversation:
      cleanFontFamily(
        localStorage.getItem(UI_KEYS.conversationFontFamily) ?? "",
      ) || DEFAULT_FONT_FAMILIES.conversation,
    code:
      cleanFontFamily(localStorage.getItem(UI_KEYS.codeFontFamily) ?? "") ||
      DEFAULT_FONT_FAMILIES.code,
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
      const cleaned = cleanFontFamily(value);
      setFontFamilies((current) => ({ ...current, [target]: cleaned }));
      saveFontFamily(target, cleaned);
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
