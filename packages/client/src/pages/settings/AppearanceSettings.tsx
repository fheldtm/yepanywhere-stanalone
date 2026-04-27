import { FilterDropdown } from "../../components/FilterDropdown";
import { useDeveloperMode } from "../../hooks/useDeveloperMode";
import {
  DEFAULT_FONT_FAMILIES,
  FONT_FAMILY_PRESETS,
  type FontFamilyTarget,
  useFontFamily,
} from "../../hooks/useFontFamily";
import { FONT_SIZES, useFontSize } from "../../hooks/useFontSize";
import { useFunPhrases } from "../../hooks/useFunPhrases";
import { useStreamingEnabled } from "../../hooks/useStreamingEnabled";
import { TAB_SIZES, useTabSize } from "../../hooks/useTabSize";
import { useTerminalTheme } from "../../hooks/useTerminalTheme";
import { THEMES, useTheme } from "../../hooks/useTheme";
import { SUPPORTED_LOCALES, useI18n } from "../../i18n";
import {
  getFontSizeLabel,
  getLocaleLabel,
  getTabSizeLabel,
  getThemeLabel,
} from "../../i18n-settings";
import {
  TERMINAL_THEME_PRESETS,
  type TerminalThemeId,
} from "../../lib/terminalThemes";

interface FontFamilySettingProps {
  target: FontFamilyTarget;
  title: string;
  description: string;
  value: string;
  setFontFamily: (target: FontFamilyTarget, value: string) => void;
}

function FontFamilySetting({
  target,
  title,
  description,
  value,
  setFontFamily,
}: FontFamilySettingProps) {
  const selectedValue = FONT_FAMILY_PRESETS[target].some(
    (preset) => preset.value === value,
  )
    ? value
    : DEFAULT_FONT_FAMILIES[target];

  return (
    <div className="settings-item font-family-setting">
      <div className="settings-item-info">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="font-family-control">
        <FilterDropdown
          label={title}
          multiSelect={false}
          align="right"
          options={FONT_FAMILY_PRESETS[target].map((preset) => ({
            value: preset.value,
            label: preset.label,
          }))}
          selected={[selectedValue]}
          onChange={(values) => {
            const nextValue = values[0] ?? DEFAULT_FONT_FAMILIES[target];
            setFontFamily(target, nextValue);
          }}
        />
      </div>
    </div>
  );
}

export function AppearanceSettings() {
  const { locale, setLocale, t } = useI18n();
  const { fontFamilies, setFontFamily } = useFontFamily();
  const { fontSize, setFontSize } = useFontSize();
  const { tabSize, setTabSize } = useTabSize();
  const { terminalTheme, setTerminalTheme } = useTerminalTheme();
  const {
    theme,
    setTheme,
    customPalette,
    setCustomPalette,
    resetCustomPalette,
  } = useTheme();
  const { streamingEnabled, setStreamingEnabled } = useStreamingEnabled();
  const { funPhrasesEnabled, setFunPhrasesEnabled } = useFunPhrases();
  const { showConnectionBars, setShowConnectionBars } = useDeveloperMode();
  const translate = (key: string) => t(key as never);

  return (
    <section className="settings-section">
      <h2>{t("appearanceSectionTitle")}</h2>
      <div className="settings-group">
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>{t("appearanceLanguageTitle")}</strong>
            <p>{t("appearanceLanguageDescription")}</p>
          </div>
          <FilterDropdown
            label={t("appearanceLanguageTitle")}
            multiSelect={false}
            align="right"
            options={SUPPORTED_LOCALES.map((value) => ({
              value,
              label: getLocaleLabel(value, translate),
            }))}
            selected={[locale]}
            onChange={(values) => {
              const nextLocale = values[0];
              if (nextLocale) {
                setLocale(nextLocale);
              }
            }}
          />
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>{t("appearanceThemeTitle")}</strong>
            <p>{t("appearanceThemeDescription")}</p>
          </div>
          <div className="font-size-selector">
            {THEMES.map((themeValue) => (
              <button
                key={themeValue}
                type="button"
                className={`font-size-option ${theme === themeValue ? "active" : ""}`}
                onClick={() => setTheme(themeValue)}
              >
                {getThemeLabel(themeValue, translate)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-item palette-setting">
          <div className="settings-item-info">
            <strong>{t("appearancePaletteTitle")}</strong>
            <p>{t("appearancePaletteDescription")}</p>
          </div>
          <div className="palette-control">
            <div className="palette-color-row">
              <label className="palette-color-label">
                <span>{t("appearancePaletteBaseColor")}</span>
                <input
                  className="palette-color-input"
                  type="color"
                  value={customPalette.baseColor}
                  onChange={(event) =>
                    setCustomPalette({ baseColor: event.target.value })
                  }
                  aria-label={t("appearancePaletteBaseColor")}
                />
              </label>
              <span className="palette-color-value">
                {customPalette.baseColor}
              </span>
              <button
                className="settings-button"
                type="button"
                onClick={resetCustomPalette}
              >
                {t("appearancePaletteReset")}
              </button>
            </div>
            <div className="palette-preview-strip" aria-hidden="true">
              <span className="palette-preview-swatch palette-preview-surface" />
              <span className="palette-preview-swatch palette-preview-secondary" />
              <span className="palette-preview-swatch palette-preview-hover" />
              <span className="palette-preview-swatch palette-preview-message" />
              <span className="palette-preview-swatch palette-preview-accent" />
            </div>
          </div>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>{t("appearanceFontSizeTitle")}</strong>
            <p>{t("appearanceFontSizeDescription")}</p>
          </div>
          <div className="font-size-selector">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={`font-size-option ${fontSize === size ? "active" : ""}`}
                onClick={() => setFontSize(size)}
              >
                {getFontSizeLabel(size, translate)}
              </button>
            ))}
          </div>
        </div>
        <FontFamilySetting
          target="system"
          title={t("appearanceSystemFontTitle")}
          description={t("appearanceSystemFontDescription")}
          value={fontFamilies.system}
          setFontFamily={setFontFamily}
        />
        <FontFamilySetting
          target="conversation"
          title={t("appearanceConversationFontTitle")}
          description={t("appearanceConversationFontDescription")}
          value={fontFamilies.conversation}
          setFontFamily={setFontFamily}
        />
        <FontFamilySetting
          target="code"
          title={t("appearanceCodeFontTitle")}
          description={t("appearanceCodeFontDescription")}
          value={fontFamilies.code}
          setFontFamily={setFontFamily}
        />
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>{t("appearanceTerminalThemeTitle")}</strong>
            <p>{t("appearanceTerminalThemeDescription")}</p>
          </div>
          <FilterDropdown
            label={t("appearanceTerminalThemeTitle")}
            multiSelect={false}
            align="right"
            options={TERMINAL_THEME_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
            }))}
            selected={[terminalTheme]}
            onChange={(values) => {
              const nextTheme = values[0];
              if (nextTheme) {
                setTerminalTheme(nextTheme as TerminalThemeId);
              }
            }}
          />
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>{t("appearanceTabSizeTitle")}</strong>
            <p>{t("appearanceTabSizeDescription")}</p>
          </div>
          <div className="font-size-selector">
            {TAB_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={`font-size-option ${tabSize === size ? "active" : ""}`}
                onClick={() => setTabSize(size)}
              >
                {getTabSizeLabel(size)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>{t("appearanceStreamingTitle")}</strong>
            <p>{t("appearanceStreamingDescription")}</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={streamingEnabled}
              onChange={(e) => setStreamingEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>{t("appearanceFunPhrasesTitle")}</strong>
            <p>{t("appearanceFunPhrasesDescription")}</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={funPhrasesEnabled}
              onChange={(e) => setFunPhrasesEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <strong>{t("appearanceConnectionBarsTitle")}</strong>
            <p>{t("appearanceConnectionBarsDescription")}</p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={showConnectionBars}
              onChange={(e) => setShowConnectionBars(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>
    </section>
  );
}
