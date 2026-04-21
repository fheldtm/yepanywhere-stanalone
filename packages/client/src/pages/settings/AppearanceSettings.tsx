import { useDeveloperMode } from "../../hooks/useDeveloperMode";
import {
  DEFAULT_FONT_FAMILIES,
  type FontFamilyTarget,
  useFontFamily,
} from "../../hooks/useFontFamily";
import { FONT_SIZES, useFontSize } from "../../hooks/useFontSize";
import { useFunPhrases } from "../../hooks/useFunPhrases";
import { useStreamingEnabled } from "../../hooks/useStreamingEnabled";
import { TAB_SIZES, useTabSize } from "../../hooks/useTabSize";
import { THEMES, useTheme } from "../../hooks/useTheme";
import { SUPPORTED_LOCALES, useI18n } from "../../i18n";
import {
  getFontSizeLabel,
  getLocaleLabel,
  getTabSizeLabel,
  getThemeLabel,
} from "../../i18n-settings";

interface FontFamilySettingProps {
  target: FontFamilyTarget;
  title: string;
  description: string;
  placeholder: string;
  preview: string;
  value: string;
  setFontFamily: (target: FontFamilyTarget, value: string) => void;
  resetFontFamily: (target: FontFamilyTarget) => void;
  resetLabel: string;
}

function FontFamilySetting({
  target,
  title,
  description,
  placeholder,
  preview,
  value,
  setFontFamily,
  resetFontFamily,
  resetLabel,
}: FontFamilySettingProps) {
  return (
    <div className="settings-item font-family-setting">
      <div className="settings-item-info">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="font-family-control">
        <div className="font-family-input-row">
          <input
            className="font-family-input"
            type="text"
            value={value}
            onChange={(event) => setFontFamily(target, event.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            aria-label={title}
          />
          <button
            className="settings-button"
            type="button"
            onClick={() => resetFontFamily(target)}
          >
            {resetLabel}
          </button>
        </div>
        <div
          className={`font-family-preview font-family-preview-${target}`}
          style={{ fontFamily: value || DEFAULT_FONT_FAMILIES[target] }}
        >
          {preview}
        </div>
      </div>
    </div>
  );
}

export function AppearanceSettings() {
  const { locale, setLocale, t } = useI18n();
  const { fontFamilies, setFontFamily, resetFontFamily } = useFontFamily();
  const { fontSize, setFontSize } = useFontSize();
  const { tabSize, setTabSize } = useTabSize();
  const { theme, setTheme } = useTheme();
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
          <select
            className="settings-select"
            value={locale}
            onChange={(e) =>
              setLocale(e.target.value as (typeof SUPPORTED_LOCALES)[number])
            }
            aria-label={t("appearanceLanguageTitle")}
          >
            {SUPPORTED_LOCALES.map((value) => (
              <option key={value} value={value}>
                {getLocaleLabel(value, translate)}
              </option>
            ))}
          </select>
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
          placeholder={t("appearanceSystemFontPlaceholder")}
          preview={t("appearanceSystemFontPreview")}
          value={fontFamilies.system}
          setFontFamily={setFontFamily}
          resetFontFamily={resetFontFamily}
          resetLabel={t("appearanceFontReset")}
        />
        <FontFamilySetting
          target="conversation"
          title={t("appearanceConversationFontTitle")}
          description={t("appearanceConversationFontDescription")}
          placeholder={t("appearanceConversationFontPlaceholder")}
          preview={t("appearanceConversationFontPreview")}
          value={fontFamilies.conversation}
          setFontFamily={setFontFamily}
          resetFontFamily={resetFontFamily}
          resetLabel={t("appearanceFontReset")}
        />
        <FontFamilySetting
          target="code"
          title={t("appearanceCodeFontTitle")}
          description={t("appearanceCodeFontDescription")}
          placeholder={t("appearanceCodeFontPlaceholder")}
          preview={t("appearanceCodeFontPreview")}
          value={fontFamilies.code}
          setFontFamily={setFontFamily}
          resetFontFamily={resetFontFamily}
          resetLabel={t("appearanceFontReset")}
        />
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
