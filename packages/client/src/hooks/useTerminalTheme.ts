import { useCallback, useEffect, useState } from "react";
import { browserTerminalSession } from "../lib/terminalSession";
import {
  type TerminalThemeId,
  getTerminalTheme,
  loadTerminalTheme,
  normalizeTerminalTheme,
  saveTerminalTheme,
} from "../lib/terminalThemes";

export function useTerminalTheme() {
  const [terminalTheme, setTerminalThemeState] =
    useState<TerminalThemeId>(loadTerminalTheme);

  useEffect(() => {
    browserTerminalSession.applyTheme(getTerminalTheme(terminalTheme));
  }, [terminalTheme]);

  const setTerminalTheme = useCallback((nextTheme: TerminalThemeId) => {
    const normalized = normalizeTerminalTheme(nextTheme);
    saveTerminalTheme(normalized);
    setTerminalThemeState(normalized);
  }, []);

  return { terminalTheme, setTerminalTheme };
}
