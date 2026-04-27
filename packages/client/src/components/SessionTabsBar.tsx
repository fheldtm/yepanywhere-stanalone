import { X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRemoteBasePath } from "../hooks/useRemoteBasePath";
import {
  buildSessionRoute,
  useSessionTabActions,
  useSessionTabs,
} from "../session-store";

export function SessionTabsBar() {
  const { tabs, activeKey } = useSessionTabs();
  const actions = useSessionTabActions();
  const basePath = useRemoteBasePath();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (tabs.length === 0) return null;

  const activateByOffset = (offset: number) => {
    const currentIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.key === activeKey),
    );
    const next = tabs.at((currentIndex + offset + tabs.length) % tabs.length);
    if (!next) return;
    actions.activateTab(next.key);
    navigate(buildSessionRoute(next.projectId, next.sessionId, basePath));
  };

  const navigateAfterClose = (closedKey: string) => {
    if (closedKey !== activeKey) return;
    const closedIndex = tabs.findIndex((tab) => tab.key === closedKey);
    const next =
      tabs[closedIndex - 1] ??
      tabs.find((candidate) => candidate.key !== closedKey);
    navigate(
      next
        ? buildSessionRoute(next.projectId, next.sessionId, basePath)
        : `${basePath}/sessions`,
    );
  };
  const activeTab = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

  return (
    <div className="session-tabs-shell">
      <div
        className="session-tabs-bar"
        role="tablist"
        aria-label="Open sessions"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            activateByOffset(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            activateByOffset(1);
          }
        }}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          const href = buildSessionRoute(
            tab.projectId,
            tab.sessionId,
            basePath,
          );
          return (
            <Link
              key={tab.key}
              to={href}
              className={`session-tab ${active ? "active" : ""}`}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => actions.activateTab(tab.key)}
              onAuxClick={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                actions.closeTab(tab.key);
                navigateAfterClose(tab.key);
              }}
            >
              <span className="session-tab-title">
                {tab.title?.trim() || "Untitled"}
              </span>
              {tab.provider && (
                <span
                  className={`session-tab-provider provider-${tab.provider}`}
                >
                  {tab.provider.replace("-oss", "")}
                </span>
              )}
              {tab.activity === "in-turn" && (
                <span className="session-tab-activity" aria-hidden="true" />
              )}
              {tab.dirtyDraft && (
                <span className="session-tab-dirty" aria-hidden="true" />
              )}
              <button
                type="button"
                className="session-tab-close"
                aria-label="Close tab"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  actions.closeTab(tab.key);
                  navigateAfterClose(tab.key);
                }}
              >
                <X size={12} />
              </button>
            </Link>
          );
        })}
      </div>

      <div className="session-tabs-mobile">
        <button
          type="button"
          className="session-tabs-mobile-trigger"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span className="session-tabs-mobile-title">
            {activeTab?.title?.trim() || "Untitled"}
          </span>
          <span className="session-tabs-mobile-count">{tabs.length}</span>
        </button>
        {mobileOpen && (
          <div className="session-tabs-mobile-menu">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                to={buildSessionRoute(tab.projectId, tab.sessionId, basePath)}
                className={`session-tabs-mobile-item ${tab.key === activeKey ? "active" : ""}`}
                onClick={() => {
                  actions.activateTab(tab.key);
                  setMobileOpen(false);
                }}
              >
                <span>{tab.title?.trim() || "Untitled"}</span>
                <button
                  type="button"
                  className="session-tab-close"
                  aria-label="Close tab"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    actions.closeTab(tab.key);
                    navigateAfterClose(tab.key);
                    setMobileOpen(false);
                  }}
                >
                  <X size={12} />
                </button>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
