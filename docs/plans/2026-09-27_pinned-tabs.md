# Plan: Home always pinned first (icon-only), plus a general pin-tab feature

- Task: `.specs/tasks/pinned-tabs.md`
- Modules: `files.md`, `shell.md`, `workspace.md`
- ADR: none
- Execution model: **single agent**, phases in sequence
- Status: in-progress
- Depends on: `docs/plans/2026-09-27_tab-focus-and-persistence-fixes.md` (touches the same `persistCurrentWs`/`WorkspaceState` save path — land that one first to avoid rebasing this one on top of it)

## Goal

Home becomes a global, icon-only, always-pinned-first editor tab that survives workspace switches and is only removed by an explicit close. Generalize into a real "pin tab" feature for any other tab, with pin state persisted per workspace.

## Definition of Ready

- [x] Spec, criteria and decisions are current (task's "Decisions Already Made": Home never unpinnable, pin state persists per workspace)
- [x] Touches `files` (`editorStore.ts`, `EditorTabBar.tsx`), `shell` (`ActivityBar.tsx`'s Home button), `workspace` (`WorkspaceState` struct, `persistCurrentWs`, restore path)
- [x] No ADR needed

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | `editorStore`: global tabs (Home) + generic `pinned` field | M | none |
| 2 | `EditorTabBar.tsx`: fixed-left pinned group, icon-only Home, pin/unpin context menu | M | 1 |
| 3 | Backend: `pinnedFiles` in `WorkspaceState` | S | none |
| 4 | Wire persistence: save/restore pinned tabs per workspace | M | 1, 3 |
| 5 | `ActivityBar.tsx` Home button uses the new global-tab path | S | 1 |
| 6 | Verify | M | 1–5 |
| 7 | Docs and finish | S | 6 |

### Phase 1: editorStore changes

- [ ] Add `globalTabs: EditorTab[]` and `globalActiveTabId: string | null`(or fold "which is active, global or workspace" into a single `activeTabId` checked against both arrays — pick whichever keeps `getActiveTab()`/`setActiveTab()` simplest; note the choice) to `EditorState`. `globalTabs` is never touched by `switchWorkspace`'s cache swap — it's the same across every workspace.
- [ ] `openOrFocusTab`'s existing `isUsageTab` branch moves to operate on `globalTabs` instead of `tabs` (still a singleton, same `id: 'usage-tab'`).
- [ ] `getActiveTab()` checks `globalTabs` first (or whichever precedence matches how `activeTabId` is tracked), then `tabs`.
- [ ] `closeTab`, `closeOtherTabs`, `closeAllTabs`, `renameTab`, `markTabSaved`, `updateTabContent`, `reorderTabs` — audit each for whether it needs a `globalTabs`-aware branch (at minimum `closeTab` does, since Home must be closeable; `closeAllTabs` should probably *not* close Home, given "only removed by an explicit close" — confirm this reading and implement accordingly).
- [ ] Add `pinned?: boolean` to `EditorTab` (`types.ts`) and `pinTab(id)`/`unpinTab(id)` (or one `setPinned(id, pinned)`) actions operating on the current workspace's `tabs` array — pinned tabs stay in `tabs`, not `globalTabs`, so `switchWorkspace`'s existing per-workspace caching keeps handling them for free.

### Phase 2: EditorTabBar rendering

- [ ] Render order: `globalTabs` (Home) first, then `tabs.filter(t => t.pinned)`, then `tabs.filter(t => !t.pinned)` (the existing scrollable/reorderable region, unchanged otherwise).
- [ ] Home renders icon-only (no name label) — scope this specifically to `isUsageTab` in the existing per-tab render logic, not to pinned tabs generally.
- [ ] Add a visual separator (thin border or gap) between the fixed-left group and the scrollable group, so it's clear which tabs don't scroll.
- [ ] Context menu: for a non-pinned, non-global tab, add "Pin Tab" (calls `pinTab(id)`). For a pinned tab, replace it with "Unpin Tab" (calls `unpinTab(id)`). For Home (`isUsageTab`), no pin/unpin entry at all — only "Close" (per decision 1, Home is never unpinnable since it's not really "pinnable/unpinnable," it's a different, always-fixed category).
- [ ] `reorderTabs` (drag-to-reorder): constrain drags to stay within the same group (pinned can reorder among pinned, normal among normal) — simplest is clamping the drop index to the source group's index range; don't allow dragging into/out of `globalTabs` at all (Home doesn't reorder).

### Phase 3: backend WorkspaceState field

- [ ] `app.go`: add `PinnedFiles []string` (json `pinnedFiles`) to the `WorkspaceState` struct, next to `OpenFiles`/`ActiveFile`.
- [ ] `wails generate module`.

### Phase 4: wire persistence

- [ ] `App.tsx`'s `persistCurrentWs`: collect `pinnedFiles` from `tabs.filter(t => t.pinned && t.path).map(t => t.path)` (mirrors the existing `openFiles` collection) and include it in the `SaveWorkspaceState` call.
- [ ] `App.tsx`'s tab-restore path (the init effect and `loadTabsFromDisk`): when building `tabsToLoad` from `state.openFiles`, set `pinned: state.pinnedFiles?.includes(filePath) ?? false` on each.
- [ ] Confirm this coordinates cleanly with the sibling task's `OnBeforeClose`/`persistCurrentWs` changes rather than conflicting — implement this one second, after that plan has landed, per this plan's stated dependency.

### Phase 5: ActivityBar Home button

- [ ] `ActivityBar.tsx`'s `openHomeTab` and `homeTabActive` need to target `globalTabs` instead of `tabs` now that Home lives there.

### Phase 6: verify

- [ ] `go build ./...`, `npm run build` both pass.
- [ ] `wails dev`, by hand: Home stays pinned first across opening files, switching workspaces, and restarting the app; pinning/unpinning a regular file via context menu works and persists across a restart; drag-reorder stays within its group; closing Home and reopening it via the Home button works; closing all tabs doesn't take Home with it.
- [ ] Record explicitly what was and wasn't clicked through.

### Phase 7: docs and finish

- [ ] `files.md`, `shell.md`, `workspace.md` updated from "Planned" to shipped shape, including which `activeTabId` precedence design was chosen in Phase 1.
- [ ] `bsdd finish`. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Splitting `tabs`/`globalTabs`/`activeTabId` tracking introduces a subtle bug where `getActiveTab()` returns the wrong tab or `null` at a transition moment | Editor pane renders blank or the wrong content briefly | Keep the precedence rule for "which array is `activeTabId` currently in" simple and centralized in one helper, not duplicated across call sites |
| `closeAllTabs` accidentally also clearing `globalTabs` (Home) | Violates "Home only closes explicitly" | Explicit test/manual-check in Phase 6 for this exact scenario |
| Pin-state persistence (Phase 4) landing before or conflicting with the sibling task's `OnBeforeClose` rewrite of the same save path | Merge conflict or a save path that only writes one of `openFiles`/`pinnedFiles` | This plan explicitly depends on the sibling plan landing first (see header) |
| Cross-group drag (dragging a normal tab to become pinned by dropping it in the pinned area) feels like it should work since it's visually adjacent, but v1 only supports pin via context menu | Minor UX gap, not a bug | Documented as a known v1 limitation in Phase 2; can be a fast follow if requested |

## Definition of Done

Per `.specs/tasks/pinned-tabs.md`.
