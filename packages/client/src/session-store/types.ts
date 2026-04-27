import type {
  AgentActivity,
  MarkdownAugment,
  PendingInputType,
  ProviderName,
  SlashCommand,
} from "@yep-anywhere/shared";
import type { PaginationInfo } from "../api/client";
import type {
  InputRequest,
  Message,
  PermissionMode,
  Session,
  SessionStatus,
} from "../types";

export type SessionKey = `${string}:${string}`;

export type SessionLifecycleState = "hot" | "warm" | "cold" | "closed";

export type SessionStreamState =
  | "disabled"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface SessionPendingMessage {
  tempId: string;
  content: string;
  timestamp: string;
  status?: string;
}

export interface SessionDeferredMessage {
  tempId?: string;
  content: string;
  timestamp: string;
}

export interface SessionAgentContent {
  messages: Message[];
  status: "pending" | "running" | "completed" | "failed";
  contextUsage?: {
    inputTokens: number;
    percentage: number;
  };
}

export type SessionAgentContentMap = Record<string, SessionAgentContent>;

export interface SessionUiState {
  scrollTop: number;
  shouldAutoScroll: boolean;
  expandedToolIds: Set<string>;
  collapsedToolIds: Set<string>;
  draftText: string;
  approvalCollapsed: boolean;
}

export interface SessionTab {
  key: SessionKey;
  projectId: string;
  sessionId: string;
  title: string | null;
  provider?: ProviderName;
  model?: string;
  dirtyDraft: boolean;
  activity?: AgentActivity;
  pendingInputType?: PendingInputType;
  hasUnread?: boolean;
  isPinned: boolean;
  lastAccessedAt: number;
}

export interface SessionEntry {
  key: SessionKey;
  projectId: string;
  sessionId: string;
  actualSessionId: string;
  session: Session | null;
  messages: Message[];
  agentContent: SessionAgentContentMap;
  toolUseToAgent: Map<string, string>;
  markdownAugments: Record<string, MarkdownAugment>;
  pagination?: PaginationInfo;
  loading: boolean;
  loadingOlder: boolean;
  error: Error | null;
  status: SessionStatus;
  processState: "idle" | "in-turn" | "waiting-input" | "hold";
  pendingInputRequest: InputRequest | null;
  pendingMessages: SessionPendingMessage[];
  deferredMessages: SessionDeferredMessage[];
  slashCommands: SlashCommand[];
  sessionTools: string[];
  mcpServers: string[];
  lastStreamActivityAt: string | null;
  isCompacting: boolean;
  mode: PermissionMode;
  modeVersion: number;
  streamState: SessionStreamState;
  lifecycleState: SessionLifecycleState;
  ui: SessionUiState;
  createdAt: number;
  lastAccessedAt: number;
  lastHydratedAt: number | null;
}

export interface SessionStoreSnapshot {
  entries: Map<SessionKey, SessionEntry>;
  tabs: SessionTab[];
  activeKey: SessionKey | null;
  maxTabs: number;
  maxWarmEntries: number;
}

/**
 * Session store invariants:
 * - There is one SessionEntry per SessionKey.
 * - UI components read from the store and dispatch actions; session state does
 *   not belong to route component lifetime.
 * - Session stream subscriptions belong to store controllers, not page
 *   components.
 * - Store actions must be idempotent because route activation, activity events,
 *   and stream reconnects can replay the same transition.
 */
