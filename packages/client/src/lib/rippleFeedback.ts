const RIPPLE_SELECTOR = [
  ".sidebar-nav-item",
  ".sidebar-section-toggle",
  ".sidebar-group-item",
  ".sidebar-group-close",
  ".sidebar-workspace-item",
  ".sidebar-workspace-close",
  ".sidebar-show-more",
  ".sidebar-toggle",
  ".sidebar-close",
  ".session-tab",
  ".session-tabs-mobile-trigger",
  ".session-tabs-mobile-item",
  ".session-tab-close",
  ".toolbar-button",
  ".attach-button",
  ".mode-button",
  ".mode-selector-option",
  ".thinking-toggle-button",
  ".voice-input-button",
  ".slash-command-button",
  ".slash-command-item",
  ".pending-approval-indicator",
  ".send-button",
  ".stop-button",
  ".queue-button",
  ".session-menu-trigger",
  ".session-menu-dropdown button",
  ".provider-badge-button",
  ".filter-dropdown-button",
  ".settings-button",
  ".inbox-refresh-button",
  ".bulk-action-button",
  ".project-selector-button",
  ".project-card__action-button",
  ".terminal-back-button",
  ".fab-button",
].join(",");

const INTERACTIVE_EXCLUSION_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[data-ripple='off']",
].join(",");

let cleanupRippleFeedback: (() => void) | null = null;

export function enableRippleFeedback() {
  if (cleanupRippleFeedback) return cleanupRippleFeedback;

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || event.defaultPrevented) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(INTERACTIVE_EXCLUSION_SELECTOR)) return;

    const surface = target.closest(RIPPLE_SELECTOR);
    if (!(surface instanceof HTMLElement)) return;
    if (surface.matches(":disabled,[aria-disabled='true']")) return;

    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    surface.classList.add("ya-ripple-surface");

    const diameter = Math.ceil(Math.hypot(rect.width, rect.height) * 2);
    const ripple = document.createElement("span");
    ripple.className = "ya-ripple-wave";
    ripple.style.width = `${diameter}px`;
    ripple.style.height = `${diameter}px`;
    ripple.style.left = `${event.clientX - rect.left - diameter / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - diameter / 2}px`;

    surface.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), {
      once: true,
    });
  };

  document.addEventListener("pointerdown", handlePointerDown, {
    capture: true,
    passive: true,
  });

  cleanupRippleFeedback = () => {
    document.removeEventListener("pointerdown", handlePointerDown, {
      capture: true,
    });
    cleanupRippleFeedback = null;
  };

  return cleanupRippleFeedback;
}
