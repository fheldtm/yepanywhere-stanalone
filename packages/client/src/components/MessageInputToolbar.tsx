import type { UploadedFile } from "@yep-anywhere/shared";
import {
  Clock,
  ListPlus,
  Paperclip,
  SendHorizontal,
  Square,
} from "lucide-react";
import type { RefObject } from "react";
import { useModelSettings } from "../hooks/useModelSettings";
import { useI18n } from "../i18n";
import type { ContextUsage, PermissionMode } from "../types";
import { ContextUsageIndicator } from "./ContextUsageIndicator";
import { ModeSelector } from "./ModeSelector";
import { PromptToolsButton } from "./PromptToolsButton";
import { VoiceInputButton, type VoiceInputButtonRef } from "./VoiceInputButton";

export interface MessageInputToolbarProps {
  // Mode selector
  mode?: PermissionMode;
  onModeChange?: (mode: PermissionMode) => void;
  isHeld?: boolean;
  onHoldChange?: (held: boolean) => void;

  // Provider capability flags (default to true for backwards compatibility)
  supportsPermissionMode?: boolean;
  supportsThinkingToggle?: boolean;
  provider?: string;

  // Attachments
  canAttach?: boolean;
  attachmentCount?: number;
  onAttachClick?: () => void;

  // Voice input
  voiceButtonRef?: RefObject<VoiceInputButtonRef | null>;
  onVoiceTranscript?: (transcript: string) => void;
  onInterimTranscript?: (transcript: string) => void;
  onListeningStart?: () => void;
  voiceDisabled?: boolean;

  // Slash commands
  slashCommands?: string[];
  onSelectSlashCommand?: (command: string) => void;

  // Context usage
  contextUsage?: ContextUsage;

  // Actions
  isRunning?: boolean;
  isThinking?: boolean;
  onStop?: () => void;
  onSend?: () => void;
  /** Queue a deferred message. Only provided when agent is running. */
  onQueue?: () => void;
  canSend?: boolean;
  disabled?: boolean;

  // Pending approval indicator
  pendingApproval?: {
    type: "tool-approval" | "user-question";
    onExpand: () => void;
  };
}

export function MessageInputToolbar({
  mode = "default",
  onModeChange,
  isHeld,
  onHoldChange,
  supportsPermissionMode = true,
  supportsThinkingToggle = true,
  provider,
  canAttach,
  attachmentCount = 0,
  onAttachClick,
  voiceButtonRef,
  onVoiceTranscript,
  onInterimTranscript,
  onListeningStart,
  voiceDisabled,
  slashCommands = [],
  onSelectSlashCommand,
  contextUsage,
  isRunning,
  isThinking,
  onStop,
  onSend,
  onQueue,
  canSend,
  disabled,
  pendingApproval,
}: MessageInputToolbarProps) {
  const { t } = useI18n();
  const { thinkingMode, cycleThinkingMode, thinkingLevel } = useModelSettings();

  return (
    <div className="message-input-toolbar">
      <div className="message-input-left">
        {onModeChange && supportsPermissionMode && (
          <ModeSelector
            mode={mode}
            onModeChange={onModeChange}
            isHeld={isHeld}
            onHoldChange={onHoldChange}
            provider={provider}
          />
        )}
        <button
          type="button"
          className="attach-button"
          onClick={onAttachClick}
          disabled={!canAttach}
          title={
            canAttach ? t("toolbarAttachFiles") : t("toolbarAttachDisabled")
          }
        >
          <Paperclip size={16} aria-hidden="true" />
          {attachmentCount > 0 && (
            <span className="attach-count">{attachmentCount}</span>
          )}
        </button>
        {supportsThinkingToggle && (
          <button
            type="button"
            className={`thinking-toggle-button ${thinkingMode !== "off" ? `active ${thinkingMode}` : ""}`}
            onClick={cycleThinkingMode}
            title={
              thinkingMode === "off"
                ? t("newSessionThinkingOff")
                : thinkingMode === "auto"
                  ? t("newSessionThinkingAuto")
                  : t("newSessionThinkingOn", { level: thinkingLevel })
            }
            aria-label={t("newSessionThinkingMode", { mode: thinkingMode })}
          >
            <span className="thinking-toggle-icon">
              <Clock size={16} aria-hidden="true" />
              {thinkingMode === "auto" && (
                <span className="thinking-toggle-auto-badge">A</span>
              )}
            </span>
          </button>
        )}
        {voiceButtonRef && onVoiceTranscript && onInterimTranscript && (
          <VoiceInputButton
            ref={voiceButtonRef}
            onTranscript={onVoiceTranscript}
            onInterimTranscript={onInterimTranscript}
            onListeningStart={onListeningStart}
            disabled={voiceDisabled}
          />
        )}
        {onSelectSlashCommand && (
          <PromptToolsButton
            commands={slashCommands}
            onSelectCommand={onSelectSlashCommand}
            disabled={voiceDisabled}
          />
        )}
      </div>
      <div className="message-input-actions">
        {/* Pending approval indicator */}
        {pendingApproval && (
          <button
            type="button"
            className={`pending-approval-indicator ${pendingApproval.type}`}
            onClick={pendingApproval.onExpand}
            title={
              pendingApproval.type === "tool-approval"
                ? t("toolbarPendingApprovalExpand")
                : t("toolbarPendingQuestionExpand")
            }
          >
            <span className="pending-approval-dot" />
            <span className="pending-approval-text">
              {pendingApproval.type === "tool-approval"
                ? t("toolbarApproval")
                : t("toolbarQuestion")}
            </span>
          </button>
        )}
        <ContextUsageIndicator usage={contextUsage} size={16} />
        {/* Queue button - shown when agent is running and there's content to queue */}
        {onQueue && canSend && (
          <button
            type="button"
            onClick={onQueue}
            className="queue-button"
            title={t("toolbarQueueTitle")}
            aria-label={t("toolbarQueueLabel")}
          >
            <ListPlus size={16} aria-hidden="true" />
          </button>
        )}
        {/* Show stop button when thinking and nothing to send, otherwise show send */}
        {isRunning && onStop && isThinking && !canSend ? (
          <button
            type="button"
            onClick={onStop}
            className="stop-button"
            aria-label={t("toolbarStop")}
          >
            <Square size={14} fill="currentColor" aria-hidden="true" />
          </button>
        ) : onSend ? (
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !canSend}
            className="send-button"
            aria-label={t("toolbarSend")}
          >
            <SendHorizontal size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
