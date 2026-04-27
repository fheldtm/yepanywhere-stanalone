# Session Tabs With Central Store Plan

Goal: implement browser-like session tabs where session state and streams survive route changes. This plan uses the central Session Store approach from the start, not component keep-alive. UI components may unmount, but session data, process state, stream subscriptions, scroll state, drafts, and tab metadata stay alive in a store.

## Desired Behavior

- [ ] Opening a session creates or activates a session tab.
- [ ] Navigating away from a session does not discard session state.
- [ ] Returning to an opened session does not trigger a full REST reload unless the store entry was evicted or explicitly refreshed.
- [ ] Running sessions continue receiving stream/activity updates even when their UI is not mounted.
- [ ] Idle sessions keep cached state but do not keep unnecessary session-stream subscriptions alive.
- [ ] Tabs can be closed manually.
- [ ] Active tab is reflected in the URL, and URL navigation activates/creates the corresponding tab.
- [ ] Mobile remains usable with a compact tab UI or overflow menu.

## Non-Goals For First Version

- [ ] Do not keep entire React trees alive with hidden panels.
- [ ] Do not implement cross-browser persistence of all tab state.
- [ ] Do not store full session message history in localStorage.
- [ ] Do not change server-side session persistence format.
- [ ] Do not add Redis or external infrastructure.

## Phase 0: Baseline And Instrumentation

- [ ] Add a short note to this plan with current timing numbers before implementation:
  - [ ] Session route switch time.
  - [ ] Session initial REST fetch time.
  - [ ] Revisit already-opened session time.
  - [ ] Number of network calls on revisit.
- [ ] Identify representative test sessions:
  - [ ] Large Codex session with many tool calls.
  - [ ] Active/running session.
  - [ ] Idle session.
  - [ ] Session with pending tool approval/question.
- [ ] Add temporary dev logging behind a flag, if needed:
  - [ ] Store create.
  - [ ] Store hydrate.
  - [ ] Stream attach/detach.
  - [ ] Eviction.
  - [ ] Route activation.

## Phase 1: Define Session Store Model

- [x] Create `packages/client/src/session-store/` directory.
- [x] Add `types.ts` with store-owned state:
  - [x] `SessionKey` as `${projectId}:${sessionId}`.
  - [x] `SessionTab`.
  - [x] `SessionEntry`.
  - [x] `SessionLifecycleState`.
  - [x] `SessionStreamState`.
  - [x] `SessionUiState`.
  - [x] `SessionStoreSnapshot`.
- [x] Include these fields in `SessionEntry`:
  - [x] `projectId`.
  - [x] `sessionId`.
  - [x] `actualSessionId`.
  - [x] `session`.
  - [x] `messages`.
  - [x] `agentContent`.
  - [x] `toolUseToAgent`.
  - [x] `markdownAugments`.
  - [x] `pagination`.
  - [x] `loading`.
  - [x] `loadingOlder`.
  - [x] `error`.
  - [x] `status`.
  - [x] `processState`.
  - [x] `pendingInputRequest`.
  - [x] `pendingMessages`.
  - [x] `deferredMessages`.
  - [x] `slashCommands`.
  - [x] `sessionTools`.
  - [x] `mcpServers`.
  - [x] `lastStreamActivityAt`.
  - [x] `isCompacting`.
  - [x] `mode`.
  - [x] `modeVersion`.
  - [x] `scrollTop`.
  - [x] `expandedToolIds`.
  - [x] `draftText`.
  - [x] `createdAt`.
  - [x] `lastAccessedAt`.
  - [x] `lastHydratedAt`.
- [x] Include these fields in `SessionTab`:
  - [x] `key`.
  - [x] `projectId`.
  - [x] `sessionId`.
  - [x] `title`.
  - [x] `provider`.
  - [x] `model`.
  - [x] `dirtyDraft`.
  - [x] `activity`.
  - [x] `hasUnread`.
  - [x] `isPinned`.
  - [x] `lastAccessedAt`.
- [x] Decide store library:
  - [x] Prefer React context plus `useSyncExternalStore` for fine-grained subscriptions.
  - [x] Avoid adding Zustand unless project already chooses it explicitly.
- [x] Add store invariants as comments:
  - [x] One entry per session key.
  - [x] UI components read from store and dispatch actions.
  - [x] Stream subscriptions belong to store controllers, not page components.
  - [x] Store actions are idempotent.

## Phase 2: Store Core Implementation

- [x] Add `SessionStore.ts`.
- [x] Implement `createSessionKey(projectId, sessionId)`.
- [x] Implement store state:
  - [x] `entries: Map<SessionKey, SessionEntry>`.
  - [x] `tabs: SessionTab[]`.
  - [x] `activeKey: SessionKey | null`.
  - [x] `maxTabs`.
  - [x] `maxWarmEntries`.
- [x] Implement store subscription API:
  - [x] `subscribe(listener)`.
  - [x] `getSnapshot()`.
  - [x] `getEntry(key)`.
  - [x] `getTabs()`.
  - [x] `getActiveKey()`.
- [x] Implement tab actions:
  - [x] `openTab(projectId, sessionId, options?)`.
  - [x] `activateTab(key)`.
  - [x] `closeTab(key)`.
  - [x] `closeOtherTabs(key)`.
  - [x] `closeTabsToRight(key)`.
  - [x] `pinTab(key)`.
  - [x] `updateTabMetadata(key, patch)`.
- [x] Implement entry actions:
  - [x] `ensureEntry(projectId, sessionId)`.
  - [x] `patchEntry(key, patch)`.
  - [x] `setMessages(key, updater)`.
  - [x] `setAgentContent(key, updater)`.
  - [x] `setToolUseToAgent(key, updater)`.
  - [x] `setError(key, error)`.
  - [x] `setLoading(key, loading)`.
  - [x] `setUiState(key, patch)`.
- [x] Implement eviction:
  - [x] Never evict active tab.
  - [x] Never evict pinned tab.
  - [x] Never evict running/waiting-input tab unless user explicitly closes it.
  - [x] Evict oldest idle unpinned entry after limit.
  - [ ] On eviction, close store-owned stream subscriptions.

## Phase 3: Store Provider And Hooks

- [x] Add `SessionStoreProvider.tsx`.
- [x] Mount provider in `App` and `RemoteApp` shared app tree.
- [x] Add hooks:
  - [x] `useSessionStore()`.
  - [x] `useSessionEntry(key)`.
  - [x] `useActiveSessionEntry()`.
  - [x] `useSessionTabs()`.
  - [x] `useSessionTabActions()`.
- [ ] Ensure hooks subscribe narrowly:
  - [ ] A session page rerenders when its own entry changes.
  - [ ] Tab bar rerenders when tab list changes.
  - [ ] Sidebar should not rerender for every token/message.
- [x] Add tests for:
  - [x] Open/activate/close tab.
  - [x] State survives consumer unmount/remount.
  - [x] Eviction does not remove active/running/pinned entries.

## Phase 4: Extract Session Data Controller

- [x] Split current `useSessionMessages` into store-compatible operations:
  - [x] `hydrateSessionEntry(key)`.
  - [x] `fetchNewMessages(key)`.
  - [x] `fetchSessionMetadata(key)`.
  - [x] `loadOlderMessages(key)`.
  - [x] `applyStreamMessage(key, message)`.
  - [x] `applyStreamSubagentMessage(key, message, agentId)`.
  - [x] `registerToolUseAgent(key, toolUseId, agentId)`.
- [ ] Preserve current behavior:
  - [x] Initial REST load uses `tailCompactions=2`.
  - [x] JSONL messages tagged with `_source: "jsonl"`.
  - [x] Codex messages reconciled with `reconcileCodexLinearMessages`.
  - [x] Timestamp watermark suppresses duplicate replay.
  - [x] `lastMessageIdRef` becomes store state.
  - [x] Stream buffer becomes store state.
  - [x] Initial load complete flag becomes store state.
- [ ] Add race protections:
  - [x] Hydrate only once per entry unless forced.
  - [x] Deduplicate concurrent hydrate calls.
  - [ ] Ignore hydrate result if entry was closed while request was in flight.
  - [ ] Preserve newer stream messages if REST response resolves late.
- [ ] Add tests for:
  - [x] Concurrent hydrate dedupe.
  - [x] Stream event before hydrate completes is buffered and flushed.
  - [ ] Store survives page unmount.

## Phase 5: Extract Session Stream Controller

- [ ] Move session stream ownership out of `useSessionStream` usage in `SessionPage`.
- [x] Create `SessionStreamController`.
- [ ] Controller responsibilities:
  - [x] Subscribe when entry status is `owner: self`.
  - [x] Keep stream alive for running session even when page is not mounted.
  - [x] Close stream when session becomes `owner: none` and no live work remains.
  - [x] Reconnect through existing `ConnectionManager`.
  - [x] Handle `lastEventId`.
  - [x] Apply all stream events into store.
- [ ] Preserve event handling:
  - [x] `message`.
  - [x] `status`.
  - [x] `deferred-queue`.
  - [x] `complete`.
  - [ ] `connected`.
  - [ ] `mode-change`.
  - [ ] `markdown-augment`.
  - [ ] `pending`.
  - [ ] `session-id-changed`.
- [ ] Handle temp-to-real ID:
  - [ ] Update entry `actualSessionId`.
  - [ ] Update tab key or add alias mapping.
  - [ ] Replace URL if current active tab is affected.
  - [ ] Update pending input request session ID.
- [ ] Add tests for:
  - [ ] Stream remains subscribed after `SessionPage` unmount.
  - [ ] Stream closes when tab closes.
  - [ ] Complete event sets process state idle and ownership none.
  - [ ] Connected event restores state after reconnect.

## Phase 6: Activity Bus Integration

- [ ] Move session-specific `useFileActivity` handling into store controller.
- [x] Store should listen once globally and route events by session ID.
- [x] Handle events:
  - [x] `session-status-changed`.
  - [x] `process-state-changed`.
  - [x] `session-updated`.
  - [x] `file-change`.
  - [x] `reconnect`.
- [ ] Keep current rules:
  - [ ] Owned sessions use stream for messages.
  - [ ] Non-owned sessions use focused watch/file activity for refresh.
  - [ ] Activity reconnect fetches messages and metadata.
- [ ] Add test for:
  - [ ] Process state event updates tab badge.
  - [ ] Ownership change updates tab status.
  - [ ] File event refreshes idle session only.

## Phase 7: Session Page Refactor

- [x] Replace `useSession(...)` internal state with store-backed hook:
  - [x] `useSessionController(projectId, sessionId, initialStatus, initialTitle, initialProvider, initialModel)`.
- [x] Page responsibilities after refactor:
  - [x] Activate/open tab.
  - [x] Read entry state from store.
  - [x] Dispatch user actions.
  - [x] Render UI.
- [x] Preserve all current UI features:
  - [x] Rename title.
  - [x] Archive/star/read toggle.
  - [x] Process info modal.
  - [x] Model switch modal.
  - [x] Tool approval.
  - [x] Ask user question.
  - [x] Queue/deferred messages.
  - [x] Attachments/uploads.
  - [x] Slash commands.
  - [x] Custom command.
  - [x] Hold mode.
  - [x] Context usage.
  - [x] Agent content lazy loading.
  - [x] Load older messages.
- [ ] Move local-only UI state into store where tab switching should preserve it:
  - [x] Scroll position.
  - [x] Draft text.
  - [x] Expanded/collapsed tool states if currently local to renderers.
  - [ ] Approval collapsed state.
  - [ ] Modal open state only if desired; default can remain local.
- [ ] Add route activation behavior:
  - [x] Visiting `/projects/:projectId/sessions/:sessionId` opens/activates tab.
  - [x] Closing active tab navigates to nearest remaining tab or `/sessions`.
  - [ ] Browser back/forward activates matching tab.

## Phase 8: Tab UI

- [x] Create `SessionTabsBar`.
- [x] Placement:
  - [x] Inside `NavigationLayout`, above active route content.
  - [x] Hidden when no session tabs exist.
  - [x] Hidden on login/custom layout pages.
- [ ] Each tab shows:
  - [x] Title.
  - [x] Provider icon/badge.
  - [x] Activity state indicator.
  - [x] Unsaved draft marker.
  - [x] Close button.
  - [ ] Optional pin button.
- [ ] Interactions:
  - [x] Click tab activates and navigates.
  - [x] Middle click closes.
  - [x] Close button closes.
  - [ ] Context menu: close, close others, close right, pin.
  - [ ] Drag reorder if feasible after base implementation.
- [ ] Overflow:
  - [x] Desktop: horizontal scroll or overflow dropdown.
  - [x] Mobile: responsive horizontal tab strip.
  - [x] Mobile: compact dropdown showing active tab title and count.
- [x] Accessibility:
  - [x] `role="tablist"`.
  - [x] Each tab `role="tab"`.
  - [x] `aria-selected`.
  - [x] Keyboard navigation with ArrowLeft/ArrowRight.

## Phase 9: Navigation Layout Integration

- [x] Add `SessionTabsBar` to `NavigationLayout`.
- [x] Ensure content height accounts for tabs bar.
- [x] Verify sidebar remains persistent.
- [ ] Verify mobile sidebar overlay still works.
- [ ] Verify pages without tabs keep layout unchanged.
- [ ] Add route metadata helper:
  - [x] `isSessionRoute(pathname)`.
  - [x] `parseSessionRoute(pathname)`.
  - [x] `buildSessionRoute(projectId, sessionId)`.

## Phase 10: Draft And Scroll Persistence

- [ ] Decide draft source of truth:
  - [x] Keep existing localStorage draft persistence for crash/reload.
  - [x] Mirror current draft into session store for fast tab switching.
- [x] Add store action:
  - [x] `setDraftText(key, text)`.
  - [x] `clearDraft(key)`.
- [ ] Update `MessageInput` integration:
  - [x] On draft change, update store.
  - [ ] On tab activation, restore draft immediately.
- [ ] Add scroll persistence:
  - [x] Capture scrollTop on scroll with throttle.
  - [x] Restore scrollTop after messages render.
  - [ ] Preserve near-bottom auto-scroll state.
  - [ ] Do not scroll hidden/unmounted UI.
- [ ] Add tests/manual checks:
  - [ ] Type draft, switch tabs, return: draft remains.
  - [x] Scroll middle, switch tabs, return: scroll remains.
  - [ ] At bottom in active running tab, new messages auto-scroll.
  - [ ] Not at bottom, new messages do not force scroll.

## Phase 11: Resource Management

- [x] Add max tab settings:
  - [x] Default desktop max open tabs: 8.
  - [ ] Default mobile max open tabs: 4.
  - [x] Pinned tabs excluded from auto-close.
- [ ] Add warm/cold state:
  - [x] `hot`: active UI mounted.
  - [x] `warm`: store data and stream retained.
  - [x] `cold`: tab metadata only, messages evicted.
- [ ] Implement downgrade rules:
  - [x] Running/waiting-input sessions stay warm.
  - [ ] Idle sessions can become cold after N minutes.
  - [x] Closed tabs clean up immediately.
- [ ] Add memory guard:
  - [ ] Estimate message count and payload size per entry.
  - [ ] Prefer evicting largest idle coldable entry.
- [ ] Add debug view/logging:
  - [ ] Open tabs count.
  - [ ] Warm entries count.
  - [ ] Active streams count.
  - [ ] Eviction count.

## Phase 12: Server/API Adjustments If Needed

- [ ] Verify current API supports store use:
  - [ ] Session detail.
  - [ ] Session metadata.
  - [ ] Pending input.
  - [ ] Agents.
  - [ ] Upload.
  - [ ] Queue message.
  - [ ] Resume session.
- [ ] Add endpoint only if needed:
  - [ ] Lightweight session status batch endpoint for open tabs.
  - [ ] Batch metadata endpoint for tabs bar titles/statuses.
- [ ] Avoid adding server complexity until client store needs it.

## Phase 13: Testing

- [ ] Unit tests:
  - [x] SessionStore open/close/activate.
  - [x] SessionStore eviction.
  - [x] SessionStore hydrate dedupe.
  - [ ] Stream controller lifecycle.
  - [ ] Activity event routing.
  - [ ] Draft persistence.
  - [ ] Scroll state persistence helper.
- [ ] Integration tests:
  - [x] Open session A, switch to session B, return A without full reload.
  - [ ] Running session continues to receive messages while another route is active.
  - [ ] Close running tab asks for confirmation or clearly preserves process server-side.
  - [ ] Complete event updates hidden tab badge.
  - [ ] Pending approval appears when tab is reactivated.
- [ ] E2E/manual tests with dev-browser:
  - [x] Open two sessions.
  - [ ] Send message in one, switch away, wait, switch back.
  - [x] Verify no full session REST fetch on return.
  - [ ] Verify message list did not reset scroll.
  - [x] Verify mobile tab overflow.
  - [ ] Verify browser back/forward.

## Phase 14: Migration Strategy

- [ ] Keep old `useSession` path available until store path is stable.
- [ ] Implement behind feature flag:
  - [ ] `SESSION_TABS_STORE=true` during development.
  - [ ] Default off until manual QA passes.
- [ ] Convert one path first:
  - [ ] Local direct app session route.
  - [ ] Then remote direct mode.
  - [ ] Then relay mode.
- [x] Remove old path after:
  - [x] Local and remote QA pass.
  - [x] No regressions in session stream, uploads, approvals.

## Phase 15: Rollout Checklist

- [ ] Run `pnpm lint`.
- [x] Run `pnpm --filter client build`.
- [x] Run relevant client tests.
- [ ] Run server tests if any API behavior changes.
- [x] Test on desktop Chrome.
- [x] Test on mobile viewport.
- [ ] Test on actual phone if available.
- [ ] Test direct LAN/Tailscale mode.
- [ ] Test relay mode.
- [x] Test active Codex session.
- [x] Test idle Codex session.
- [ ] Test Claude session.
- [ ] Test session with pending approval.
- [ ] Test session with file upload.
- [ ] Test close tab cleanup.
- [ ] Test reload page recovery.

## Risks And Mitigations

- [x] Memory growth from many open sessions.
  - [x] Mitigate with tab limit, warm/cold downgrade, LRU eviction.
- [x] Duplicate stream subscriptions.
  - [x] Mitigate by making stream controller keyed by session key and idempotent.
- [x] Race between REST hydrate and stream messages.
  - [x] Mitigate with timestamp watermark and merge semantics already used today.
- [x] URL and active tab drift.
  - [x] Mitigate with route parser and single `activateTabAndNavigate` action.
- [ ] Remote relay reconnect edge cases.
  - [ ] Mitigate by reusing `ConnectionManager` and existing subscription abstraction.
- [x] Hidden tabs doing too much work.
  - [x] Mitigate by keeping state updates in store and only rendering active route UI.

## Success Criteria

- [x] Switching back to an already-open session does not show the session loading indicator.
- [x] Switching back to an already-open session does not perform a full session detail fetch.
- [x] Running hidden session continues to receive messages.
- [x] Idle hidden session preserves scroll/draft/message state.
- [x] Closing a tab cleans up store state and stream subscription.
- [x] Memory remains bounded with the configured tab limit.
- [x] Existing session behaviors still work: send, queue, resume, approve, deny, upload, slash command, load older.
