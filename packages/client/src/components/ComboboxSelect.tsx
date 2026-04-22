import { Check, ChevronDown, Search } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";

const DESKTOP_BREAKPOINT = 769;
const POPOVER_MARGIN = 8;
const MIN_POPOVER_HEIGHT = 180;
const MAX_POPOVER_HEIGHT = 360;
const MAX_POPOVER_WIDTH = 420;

export interface ComboboxOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  status?: string;
  colorClassName?: string;
  searchText?: string;
}

interface ComboboxSelectProps<T extends string> {
  label: string;
  options: ComboboxOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

export function ComboboxSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
}: ComboboxSelectProps<T>) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isDesktop, setIsDesktop] = useState(
    () => window.innerWidth >= DESKTOP_BREAKPOINT,
  );
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const [presentation, setPresentation] = useState<"popover" | "modal">(
    "popover",
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => {
      const haystack = [
        option.label,
        option.description,
        option.status,
        option.searchText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, options]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const handleSelect = (option: ComboboxOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };

  const calculatePopoverPlacement = useCallback((): {
    presentation: "popover" | "modal";
    style: CSSProperties;
  } => {
    const button = buttonRef.current;
    if (!button || !isDesktop) {
      return { presentation: "modal", style: {} };
    }

    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxAvailableWidth = viewportWidth - POPOVER_MARGIN * 2;
    const desiredWidth = Math.max(
      rect.width,
      Math.min(MAX_POPOVER_WIDTH, maxAvailableWidth),
    );

    if (desiredWidth > maxAvailableWidth) {
      return { presentation: "modal", style: {} };
    }

    const left = Math.min(
      Math.max(POPOVER_MARGIN, rect.left),
      viewportWidth - desiredWidth - POPOVER_MARGIN,
    );
    const fitsHorizontally =
      left >= POPOVER_MARGIN &&
      left + desiredWidth <= viewportWidth - POPOVER_MARGIN;
    if (!fitsHorizontally) {
      return { presentation: "modal", style: {} };
    }

    const spaceBelow = viewportHeight - rect.bottom - POPOVER_MARGIN;
    const spaceAbove = rect.top - POPOVER_MARGIN;
    const canOpenBelow = spaceBelow >= MIN_POPOVER_HEIGHT;
    const canOpenAbove = spaceAbove >= MIN_POPOVER_HEIGHT;

    if (!canOpenBelow && !canOpenAbove) {
      return { presentation: "modal", style: {} };
    }

    const openAbove = !canOpenBelow && canOpenAbove;
    const availableHeight = openAbove ? spaceAbove : spaceBelow;

    return {
      presentation: "popover",
      style: {
        position: "fixed",
        left,
        width: desiredWidth,
        maxHeight: Math.min(MAX_POPOVER_HEIGHT, availableHeight),
        ...(openAbove
          ? { bottom: viewportHeight - rect.top + POPOVER_MARGIN }
          : { top: rect.bottom + POPOVER_MARGIN }),
      },
    };
  }, [isDesktop]);

  const updatePopoverPosition = useCallback(() => {
    const placement = calculatePopoverPlacement();
    setPresentation(placement.presentation);
    setPopoverStyle(placement.style);
  }, [calculatePopoverPlacement]);

  const open = () => {
    if (disabled) return;
    buttonRef.current?.blur();
    if (isDesktop) {
      const placement = calculatePopoverPlacement();
      setPresentation(placement.presentation);
      setPopoverStyle(placement.style);
    } else {
      setPresentation("modal");
      setPopoverStyle({});
    }
    setIsOpen(true);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen || !isDesktop) return;
    updatePopoverPosition();
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        close();
      }
    };
    const handleReposition = () => updatePopoverPosition();
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [close, isDesktop, isOpen, updatePopoverPosition]);

  useEffect(() => {
    if (isOpen && (!isDesktop || presentation === "modal")) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isDesktop, isOpen, presentation]);

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [isOpen]);

  const overlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const content = (
    <>
      <div className="combobox-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder ?? t("comboboxSearchPlaceholder")}
          aria-label={searchPlaceholder ?? t("comboboxSearchPlaceholder")}
        />
      </div>
      <div className="combobox-options" role="listbox" tabIndex={-1}>
        {filteredOptions.length === 0 ? (
          <div className="combobox-empty">
            {emptyText ?? t("comboboxNoResults")}
          </div>
        ) : (
          filteredOptions.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={`combobox-option ${isSelected ? "selected" : ""}`}
                onClick={() => handleSelect(option)}
                disabled={option.disabled}
                role="option"
                aria-selected={isSelected}
              >
                {option.colorClassName && (
                  <span
                    className={`combobox-option-dot ${option.colorClassName}`}
                    aria-hidden="true"
                  />
                )}
                <span className="combobox-option-copy">
                  <span className="combobox-option-label">{option.label}</span>
                  {option.description && (
                    <span className="combobox-option-description">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.status && (
                  <span className="combobox-option-status">
                    {option.status}
                  </span>
                )}
                {isSelected && (
                  <Check
                    className="combobox-option-check"
                    size={16}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );

  const sheet =
    isOpen && (!isDesktop || presentation === "modal")
      ? createPortal(
          <div
            className="combobox-overlay"
            onClick={overlayClick}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
            }}
          >
            <div
              ref={popoverRef}
              className={
                isDesktop ? "combobox-sheet combobox-modal" : "combobox-sheet"
              }
              tabIndex={-1}
              aria-label={label}
            >
              <div className="combobox-header">{label}</div>
              {content}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="combobox-select">
      <button
        ref={buttonRef}
        type="button"
        className={`combobox-trigger ${selectedOption ? "has-selection" : ""}`}
        onClick={open}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={label}
      >
        <span className="combobox-trigger-copy">
          <span className="combobox-trigger-label">
            {selectedOption?.label ?? placeholder ?? label}
          </span>
          {selectedOption?.description && (
            <span className="combobox-trigger-description">
              {selectedOption.description}
            </span>
          )}
        </span>
        <ChevronDown
          className="combobox-trigger-chevron"
          size={16}
          aria-hidden="true"
        />
      </button>
      {isOpen && isDesktop && presentation === "popover" && (
        <div
          ref={popoverRef}
          className="combobox-popover"
          style={popoverStyle}
          tabIndex={-1}
          aria-label={label}
        >
          {content}
        </div>
      )}
      {sheet}
    </div>
  );
}
