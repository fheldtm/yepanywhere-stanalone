import { Bot, ChevronDown, ChevronRight, Rows3, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { GlobalSessionItem } from "../api/client";
import { useOptionalRemoteConnection } from "../contexts/RemoteConnectionContext";
import { useDrafts } from "../hooks/useDrafts";
import { useGlobalSessions } from "../hooks/useGlobalSessions";
import { useNeedsAttentionBadge } from "../hooks/useNeedsAttentionBadge";
import { resolvePreferredProjectId } from "../hooks/useRecentProject";
import { useRecentProjects } from "../hooks/useRecentProjects";
import { useRemoteBasePath } from "../hooks/useRemoteBasePath";
import { useVersion } from "../hooks/useVersion";
import { useI18n } from "../i18n";
import { isRemoteClient } from "../lib/connection";
import { UI_KEYS } from "../lib/storageKeys";
import {
  buildSessionRoute,
  useSessionTabActions,
  useSessionTabs,
} from "../session-store";
import { getSessionDisplayTitle, toUrlProjectId } from "../utils";
import { SessionListItem } from "./SessionListItem";
import {
  SidebarIcons,
  SidebarNavItem,
  SidebarNavSection,
} from "./SidebarNavItem";
import { YepAnywhereLogo } from "./YepAnywhereLogo";

const SWIPE_THRESHOLD = 50; // Minimum distance to trigger close
const SWIPE_ENGAGE_THRESHOLD = 15; // Minimum horizontal distance before swipe engages
const RECENT_SESSIONS_INITIAL = 12; // Initial number of recent sessions to show
const RECENT_SESSIONS_INCREMENT = 10; // How many more to show on each expand

function loadSidebarSectionOpen(key: string): boolean {
  return localStorage.getItem(key) !== "false";
}

function saveSidebarSectionOpen(key: string, open: boolean): void {
  localStorage.setItem(key, String(open));
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: () => void;

  /** Current session ID (for highlighting in sidebar) */
  currentSessionId?: string;

  /** Desktop mode: sidebar is always visible, no overlay */
  isDesktop?: boolean;
  /** Desktop mode: sidebar is collapsed (icons only) */
  isCollapsed?: boolean;
  /** Desktop mode: callback to toggle expanded/collapsed state */
  onToggleExpanded?: () => void;
  /** Desktop mode: current sidebar width in pixels */
  sidebarWidth?: number;
  /** Desktop mode: called when resize starts */
  onResizeStart?: () => void;
  /** Desktop mode: called during resize with new width */
  onResize?: (width: number) => void;
  /** Desktop mode: called when resize ends */
  onResizeEnd?: () => void;
}

interface SidebarGroupProps {
  children: ReactNode;
}

function SidebarGroupPanel({ children }: SidebarGroupProps) {
  return <div className="sidebar-group-panel">{children}</div>;
}

function SidebarGroupList({ children }: SidebarGroupProps) {
  return <ul className="sidebar-group-list">{children}</ul>;
}

interface SidebarGroupItemProps {
  to: string;
  title: string;
  meta?: string;
  active?: boolean;
  unread?: boolean;
  draft?: boolean;
  state?: string;
  activity?: GlobalSessionItem["activity"];
  pendingInputType?: GlobalSessionItem["pendingInputType"];
  onClick?: () => void;
  endSlot?: ReactNode;
}

function SidebarGroupItem({
  to,
  title,
  meta,
  active,
  unread,
  draft,
  state,
  activity,
  pendingInputType,
  onClick,
  endSlot,
}: SidebarGroupItemProps) {
  const activitySlot =
    endSlot ??
    (state ? (
      <span className={`sidebar-group-state state-${state}`}>{state}</span>
    ) : pendingInputType ? (
      <span className="session-badge session-badge-needs-input">
        {pendingInputType === "tool-approval" ? "Appr" : "Q"}
      </span>
    ) : activity === "in-turn" ? (
      <span
        className="thinking-indicator-dot sidebar-group-activity"
        aria-hidden="true"
      />
    ) : null);

  return (
    <li
      className={[
        "sidebar-group-list-item",
        active && "active",
        unread && "unread",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Link
        to={to}
        className="sidebar-group-item"
        onClick={onClick}
        title={title}
      >
        <span className="sidebar-group-item-main">
          <span className="sidebar-group-item-title">
            {title}
            {draft && <span className="session-draft-badge">Draft</span>}
          </span>
          {meta && <span className="sidebar-group-item-meta">{meta}</span>}
        </span>
        {activitySlot}
      </Link>
    </li>
  );
}

export function Sidebar({
  isOpen,
  onClose,
  onNavigate,
  currentSessionId,
  // Desktop mode props
  isDesktop = false,
  isCollapsed = false,
  onToggleExpanded,
  sidebarWidth,
  onResizeStart,
  onResize,
  onResizeEnd,
}: SidebarProps) {
  const { t } = useI18n();
  // Get base path for relay mode (e.g., "/remote/my-server")
  const basePath = useRemoteBasePath();
  const navigate = useNavigate();
  const remoteConnection = useOptionalRemoteConnection();

  // Fetch global sessions for sidebar (non-starred only for recent/older sections)
  const { sessions: globalSessions, loading: globalLoading } =
    useGlobalSessions({ limit: 50, includeStats: false });

  // Fetch starred sessions separately to ensure we get ALL starred sessions
  const { sessions: starredSessions, loading: starredLoading } =
    useGlobalSessions({
      starred: true,
      limit: 100,
      includeStats: false,
    });

  const sessionsLoading = globalLoading || starredLoading;

  // Server capabilities for feature gating
  const { version: versionInfo } = useVersion();
  const capabilities = versionInfo?.capabilities ?? [];
  const showTerminalNavItem = !isRemoteClient();

  // Global inbox count
  const inboxCount = useNeedsAttentionBadge();
  const { tabs, activeKey } = useSessionTabs();
  const tabActions = useSessionTabActions();
  const { recentProjects, projects } = useRecentProjects();
  const newSessionProjectId = resolvePreferredProjectId(
    projects,
    recentProjects[0]?.id,
  );
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const sidebarRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeEngaged = useRef<boolean>(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef<number | null>(null);
  const resizeStartWidth = useRef<number | null>(null);
  const [recentSessionsLimit, setRecentSessionsLimit] = useState(
    RECENT_SESSIONS_INITIAL,
  );
  const [olderSessionsLimit, setOlderSessionsLimit] = useState(
    RECENT_SESSIONS_INITIAL,
  );
  const [starredSessionsLimit, setStarredSessionsLimit] = useState(
    RECENT_SESSIONS_INITIAL,
  );
  const [tabsOpen, setTabsOpen] = useState(() =>
    loadSidebarSectionOpen(UI_KEYS.sidebarTabsOpen),
  );
  const [tasksOpen, setTasksOpen] = useState(() =>
    loadSidebarSectionOpen(UI_KEYS.sidebarTasksOpen),
  );

  const toggleTabsOpen = () => {
    setTabsOpen((open) => {
      const next = !open;
      saveSidebarSectionOpen(UI_KEYS.sidebarTabsOpen, next);
      return next;
    });
  };

  const toggleTasksOpen = () => {
    setTasksOpen((open) => {
      const next = !open;
      saveSidebarSectionOpen(UI_KEYS.sidebarTasksOpen, next);
      return next;
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
    swipeEngaged.current = false;
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const currentX = e.touches[0]?.clientX;
    const currentY = e.touches[0]?.clientY;
    if (currentX === undefined || currentY === undefined) return;

    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // If not yet engaged, check if we should engage the swipe
    if (!swipeEngaged.current) {
      const absDiffX = Math.abs(diffX);
      const absDiffY = Math.abs(diffY);

      // Engage swipe only if:
      // 1. Horizontal movement exceeds threshold
      // 2. Horizontal movement is greater than vertical (user is swiping, not scrolling)
      // 3. Movement is to the left (closing gesture)
      if (
        absDiffX > SWIPE_ENGAGE_THRESHOLD &&
        absDiffX > absDiffY &&
        diffX < 0
      ) {
        swipeEngaged.current = true;
      } else {
        return; // Not engaged yet, don't track offset
      }
    }

    // Only allow swiping left (negative offset)
    if (diffX < 0) {
      setSwipeOffset(diffX);
    }
  };

  const handleTouchEnd = () => {
    if (swipeEngaged.current && swipeOffset < -SWIPE_THRESHOLD) {
      onClose();
    }
    touchStartX.current = null;
    touchStartY.current = null;
    swipeEngaged.current = false;
    setSwipeOffset(0);
  };

  // Desktop sidebar resize handlers
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (!isDesktop || isCollapsed || !sidebarWidth) return;
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
    setIsResizing(true);
    onResizeStart?.();
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (resizeStartX.current === null || resizeStartWidth.current === null)
        return;
      const diff = e.clientX - resizeStartX.current;
      const newWidth = resizeStartWidth.current + diff;
      onResize?.(newWidth);
    };

    const handleMouseUp = () => {
      resizeStartX.current = null;
      resizeStartWidth.current = null;
      setIsResizing(false);
      onResizeEnd?.();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onResize, onResizeEnd]);

  // Handle switching hosts - disconnect and go to host picker
  const handleSwitchHost = () => {
    remoteConnection?.disconnect();
    navigate("/login");
    onNavigate();
  };

  // Starred sessions come from dedicated fetch (filtered by server)
  // Filter out archived just in case
  const filteredStarredSessions = useMemo(() => {
    return starredSessions.filter((s) => !s.isArchived);
  }, [starredSessions]);

  // Sessions updated in the last 24 hours (non-starred, non-archived)
  const recentDaySessions = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const isWithinLastDay = (date: Date) => date.getTime() >= oneDayAgo;

    return globalSessions.filter(
      (s) =>
        !s.isStarred && !s.isArchived && isWithinLastDay(new Date(s.updatedAt)),
    );
  }, [globalSessions]);

  // Older sessions (non-starred, non-archived, NOT in last 24 hours)
  const olderSessions = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const isOlderThanOneDay = (date: Date) => date.getTime() < oneDayAgo;

    return globalSessions.filter(
      (s) =>
        !s.isStarred &&
        !s.isArchived &&
        isOlderThanOneDay(new Date(s.updatedAt)),
    );
  }, [globalSessions]);

  // Track which sessions have unsent drafts in localStorage
  const drafts = useDrafts();
  const navigateAfterTabClose = (closedKey: string) => {
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

  // In desktop mode, always render. In mobile mode, only render when open.
  if (!isDesktop && !isOpen) return null;

  // Sidebar toggle icon for desktop mode
  const SidebarToggleIcon = () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );

  return (
    <>
      {/* Only show overlay in non-desktop mode */}
      {!isDesktop && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          role="button"
          tabIndex={0}
          aria-label={t("actionCloseSidebar")}
        />
      )}
      <aside
        ref={sidebarRef}
        className="sidebar"
        onTouchStart={!isDesktop ? handleTouchStart : undefined}
        onTouchMove={!isDesktop ? handleTouchMove : undefined}
        onTouchEnd={!isDesktop ? handleTouchEnd : undefined}
        style={
          !isDesktop && swipeOffset < 0
            ? { transform: `translateX(${swipeOffset}px)`, transition: "none" }
            : undefined
        }
      >
        <div className="sidebar-header">
          {isDesktop && isCollapsed ? (
            /* Desktop collapsed mode: show toggle button to expand */
            <button
              type="button"
              className="sidebar-toggle"
              onClick={onToggleExpanded}
              title={t("actionExpandSidebar")}
              aria-label={t("actionExpandSidebar")}
            >
              <SidebarToggleIcon />
            </button>
          ) : isDesktop ? (
            /* Desktop expanded mode: show brand (toggle is in toolbar) */
            <span className="sidebar-brand">
              <YepAnywhereLogo />
            </span>
          ) : (
            /* Mobile mode: brand text + close button */
            <>
              <span className="sidebar-brand">
                <YepAnywhereLogo />
              </span>
              <button
                type="button"
                className="sidebar-close"
                onClick={onClose}
                aria-label={t("actionCloseSidebar")}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </>
          )}
        </div>

        <div className="sidebar-actions">
          {/* New Session: link to most recent project's new session page */}
          <SidebarNavItem
            to={
              newSessionProjectId
                ? `/new-session?projectId=${encodeURIComponent(newSessionProjectId)}`
                : "/new-session"
            }
            icon={SidebarIcons.newSession}
            label={t("sidebarNewSession")}
            onClick={onNavigate}
            basePath={basePath}
          />
        </div>

        <div className="sidebar-sessions">
          {/* Navigation items that scroll with content */}
          <SidebarNavSection>
            <SidebarNavItem
              to="/inbox"
              icon={SidebarIcons.inbox}
              label={t("sidebarInbox")}
              badge={inboxCount}
              onClick={onNavigate}
              basePath={basePath}
            />
            <SidebarNavItem
              to="/projects"
              icon={SidebarIcons.projects}
              label={t("sidebarProjects")}
              onClick={onNavigate}
              basePath={basePath}
            />
            {showTerminalNavItem && (
              <SidebarNavItem
                to="/terminal"
                icon={SidebarIcons.terminal}
                label={t("sidebarTerminal")}
                onClick={onNavigate}
                basePath={basePath}
              />
            )}
            {(capabilities.includes("deviceBridge") ||
              capabilities.includes("deviceBridge-download")) && (
              <SidebarNavItem
                to="/devices"
                icon={SidebarIcons.emulator}
                label={t("sidebarDevices")}
                onClick={onNavigate}
                basePath={basePath}
              />
            )}
            <SidebarNavItem
              to="/settings"
              icon={SidebarIcons.settings}
              label={t("sidebarSettings")}
              onClick={onNavigate}
              basePath={basePath}
            />
            {/* Switch Host - show whenever we have a remote connection */}
            {remoteConnection && (
              <button
                type="button"
                className="sidebar-nav-item sidebar-switch-host"
                onClick={handleSwitchHost}
              >
                <span className="sidebar-nav-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                </span>
                <span className="sidebar-nav-label">
                  {t("sidebarSwitchHost")}
                </span>
              </button>
            )}

            {!isCollapsed && (
              <>
                <div className="sidebar-section sidebar-workspace-section">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    onClick={toggleTabsOpen}
                    aria-expanded={tabsOpen}
                  >
                    <span className="sidebar-section-toggle-label">
                      <span className="sidebar-nav-icon">
                        <Rows3 size={16} aria-hidden="true" />
                      </span>
                      <span className="sidebar-nav-text">
                        {t("sidebarSectionTabs")}
                      </span>
                    </span>
                    {tabsOpen ? (
                      <ChevronDown size={16} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={16} aria-hidden="true" />
                    )}
                  </button>
                  {tabsOpen && (
                    <SidebarGroupPanel>
                      {tabs.length > 0 ? (
                        <SidebarGroupList>
                          {tabs.map((tab) => {
                            const active = tab.key === activeKey;
                            const href = buildSessionRoute(
                              tab.projectId,
                              tab.sessionId,
                              basePath,
                            );
                            return (
                              <SidebarGroupItem
                                key={tab.key}
                                to={href}
                                title={tab.title?.trim() || "Untitled"}
                                meta={
                                  projectNameById.get(tab.projectId) ??
                                  tab.projectId
                                }
                                active={active}
                                onClick={() => {
                                  tabActions.activateTab(tab.key);
                                  onNavigate();
                                }}
                                endSlot={
                                  <span className="sidebar-group-end">
                                    {tab.activity === "in-turn" && (
                                      <span
                                        className="thinking-indicator-dot sidebar-group-activity"
                                        aria-hidden="true"
                                      />
                                    )}
                                    <button
                                      type="button"
                                      className="sidebar-group-close"
                                      aria-label="Close tab"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        if (
                                          tab.sessionId === currentSessionId
                                        ) {
                                          navigateAfterTabClose(tab.key);
                                        }
                                        tabActions.closeTab(tab.key);
                                        onNavigate();
                                      }}
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                }
                              />
                            );
                          })}
                        </SidebarGroupList>
                      ) : (
                        <p className="sidebar-empty sidebar-group-empty">
                          {t("sidebarNoOpenTabs")}
                        </p>
                      )}
                    </SidebarGroupPanel>
                  )}
                </div>

                <div className="sidebar-section sidebar-workspace-section">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    onClick={toggleTasksOpen}
                    aria-expanded={tasksOpen}
                  >
                    <span className="sidebar-section-toggle-label">
                      <span className="sidebar-nav-icon">
                        <Bot size={16} aria-hidden="true" />
                      </span>
                      <span className="sidebar-nav-text">
                        {t("sidebarSectionTasks")}
                      </span>
                    </span>
                    {tasksOpen ? (
                      <ChevronDown size={16} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={16} aria-hidden="true" />
                    )}
                  </button>
                  {tasksOpen && (
                    <SidebarGroupPanel>
                      {recentDaySessions.length > 0 && (
                        <div className="sidebar-section sidebar-subsection">
                          <h3 className="sidebar-section-title">
                            {t("sidebarSectionLast24Hours")}
                          </h3>
                          <SidebarGroupList>
                            {recentDaySessions
                              .slice(0, recentSessionsLimit)
                              .map((session) => (
                                <SidebarGroupItem
                                  key={session.id}
                                  to={buildSessionRoute(
                                    session.projectId,
                                    session.id,
                                    basePath,
                                  )}
                                  title={getSessionDisplayTitle(session)}
                                  meta={session.projectName}
                                  pendingInputType={session.pendingInputType}
                                  unread={session.hasUnread}
                                  active={session.id === currentSessionId}
                                  activity={session.activity}
                                  onClick={onNavigate}
                                  draft={drafts.has(session.id)}
                                />
                              ))}
                          </SidebarGroupList>
                          {recentDaySessions.length > recentSessionsLimit && (
                            <button
                              type="button"
                              className="sidebar-show-more"
                              onClick={() =>
                                setRecentSessionsLimit(
                                  (prev) => prev + RECENT_SESSIONS_INCREMENT,
                                )
                              }
                            >
                              {t("actionShowMore", {
                                count: Math.min(
                                  RECENT_SESSIONS_INCREMENT,
                                  recentDaySessions.length -
                                    recentSessionsLimit,
                                ),
                              })}
                            </button>
                          )}
                        </div>
                      )}

                      {olderSessions.length > 0 && (
                        <div className="sidebar-section sidebar-subsection">
                          <h3 className="sidebar-section-title">
                            {t("sidebarSectionOlder")}
                          </h3>
                          <SidebarGroupList>
                            {olderSessions
                              .slice(0, olderSessionsLimit)
                              .map((session) => (
                                <SidebarGroupItem
                                  key={session.id}
                                  to={buildSessionRoute(
                                    session.projectId,
                                    session.id,
                                    basePath,
                                  )}
                                  title={getSessionDisplayTitle(session)}
                                  meta={session.projectName}
                                  pendingInputType={session.pendingInputType}
                                  unread={session.hasUnread}
                                  active={session.id === currentSessionId}
                                  activity={session.activity}
                                  onClick={onNavigate}
                                  draft={drafts.has(session.id)}
                                />
                              ))}
                          </SidebarGroupList>
                          {olderSessions.length > olderSessionsLimit && (
                            <button
                              type="button"
                              className="sidebar-show-more"
                              onClick={() =>
                                setOlderSessionsLimit(
                                  (prev) => prev + RECENT_SESSIONS_INCREMENT,
                                )
                              }
                            >
                              {t("actionShowMore", {
                                count: Math.min(
                                  RECENT_SESSIONS_INCREMENT,
                                  olderSessions.length - olderSessionsLimit,
                                ),
                              })}
                            </button>
                          )}
                        </div>
                      )}

                      {recentDaySessions.length === 0 &&
                        olderSessions.length === 0 && (
                          <p className="sidebar-empty sidebar-group-empty">
                            {t("sidebarNoSessions")}
                          </p>
                        )}
                    </SidebarGroupPanel>
                  )}
                </div>
              </>
            )}
          </SidebarNavSection>

          {/* Global sessions list */}
          {filteredStarredSessions.length > 0 && (
            <div className="sidebar-section">
              <h3 className="sidebar-section-title">
                {t("sidebarSectionStarred")}
              </h3>
              <ul className="sidebar-session-list">
                {filteredStarredSessions
                  .slice(0, starredSessionsLimit)
                  .map((session) => (
                    <SessionListItem
                      key={session.id}
                      sessionId={session.id}
                      projectId={session.projectId}
                      title={getSessionDisplayTitle(session)}
                      fullTitle={getSessionDisplayTitle(session)}
                      provider={session.provider}
                      status={session.ownership}
                      pendingInputType={session.pendingInputType}
                      hasUnread={session.hasUnread}
                      isStarred={session.isStarred}
                      isArchived={session.isArchived}
                      mode="compact"
                      isCurrent={session.id === currentSessionId}
                      activity={session.activity}
                      onNavigate={onNavigate}
                      showProjectName
                      projectName={session.projectName}
                      basePath={basePath}
                      messageCount={session.messageCount}
                      hasDraft={drafts.has(session.id)}
                    />
                  ))}
              </ul>
              {filteredStarredSessions.length > starredSessionsLimit && (
                <button
                  type="button"
                  className="sidebar-show-more"
                  onClick={() =>
                    setStarredSessionsLimit(
                      (prev) => prev + RECENT_SESSIONS_INCREMENT,
                    )
                  }
                >
                  {t("actionShowMore", {
                    count: Math.min(
                      RECENT_SESSIONS_INCREMENT,
                      filteredStarredSessions.length - starredSessionsLimit,
                    ),
                  })}
                </button>
              )}
            </div>
          )}

          {filteredStarredSessions.length === 0 &&
            recentDaySessions.length === 0 &&
            olderSessions.length === 0 && (
              <p className="sidebar-empty">
                {sessionsLoading
                  ? t("sidebarLoadingSessions")
                  : t("sidebarNoSessions")}
              </p>
            )}
        </div>

        {!isCollapsed && (
          <div
            className="sidebar-version"
            title={`Client v${__APP_VERSION__} · build ${__APP_BUILD_ID__}`}
          >
            <span>Client v{__APP_VERSION__}</span>
            <span>build {__APP_BUILD_ID__}</span>
          </div>
        )}

        {/* Resize handle - desktop only, when expanded */}
        {isDesktop && !isCollapsed && (
          <div
            className={`sidebar-resize-handle ${isResizing ? "active" : ""}`}
            onMouseDown={handleResizeMouseDown}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("actionResizeSidebar")}
            tabIndex={0}
          />
        )}
      </aside>
    </>
  );
}
