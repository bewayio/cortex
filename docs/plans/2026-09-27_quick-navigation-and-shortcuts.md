# Plan: Two project lists, global shortcuts, command palette, always-open Home

- Task: `.specs/tasks/quick-navigation-and-shortcuts.md`
- Modules: `workspace.md`, `shell.md`, `database.md`, `usage.md`
- ADR: none
- Execution model: **single agent**, phases in sequence
- Status: in-progress (implementation done, phases 1-7 + 9 docs complete; phase 8 blocked on manual `wails dev` testing this assistant cannot perform)

## Goal

Replace the "recently closed" list with "Open projects" (8, above Explorer) + "Ever opened" (15, Home). Add Ctrl/Cmd+Tab, fixed Ctrl/Cmd+P, new Ctrl/Cmd+Shift+P command palette, Ctrl/Cmd+Q, keyboard-open in file/database trees, cross-platform font-size shortcuts. Always open on Home. Show all shortcuts on Home.

## Definition of Ready

- [x] Spec, criteria and decisions are current (task's "Decisions Already Made")
- [x] Touches `workspace` (backend), `shell`/`App.tsx` (shortcuts, startup), `database` (tree focus + Ctrl+Enter), `files` frontend (explorer keydown)
- [x] No ADR needed

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | Backend: two-list workspace model | M | none |
| 2 | Frontend: WorkspaceList / Home list split | M | 1 |
| 3 | Cross-platform shortcut fix + Ctrl/Cmd+Tab | S | none |
| 4 | Command palette | M | none |
| 5 | Ctrl/Cmd+Q, file explorer Ctrl+Enter | S | none |
| 6 | Database tree focus + Ctrl+Enter | M | none |
| 7 | Always-open Home + shortcuts reference on Home | S | 2 |
| 8 | Verify | M | 1–7 |
| 9 | Docs and finish | S | 8 |

### Phase 1: backend two-list model

- [x] `app.go`: remove `recentClosedPath`, `GetRecentClosedWorkspaces`, `purgeFromRecentClosed`, `CloseWorkspace` entirely (dead once frontend stops calling them).
- [x] `SaveWorkspace`: after resolving id/name (existing reuse-by-path logic stays), write to `recent.json` capped at **8** (front-insert, dedupe by id, truncate) instead of uncapped.
- [x] New `everOpenedPath()` = `~/.bcode/ever_opened.json`, `GetEverOpenedWorkspaces() []Workspace` (same `[]Workspace{}`-not-nil pattern as the rest of this file), and have `SaveWorkspace` also front-insert/dedupe/truncate that list at **15**.
- [x] `RemoveWorkspace`: drop the closed-list purge call, remove the id from both `recent.json` and `ever_opened.json`.
- [x] `wails generate module`.

### Phase 2: frontend list split

- [x] `workspaceStore.ts`: rename/repurpose `recentClosedWorkspaces` → `everOpenedWorkspaces` (or add fresh state, whichever is less error-prone given existing usages — check call sites before renaming blindly).
- [x] `WorkspaceList.tsx`: remove the "Recently Closed" section, the `Archive` import/button, `handleClose`/`CloseWorkspace` call. Rename the visible "Recent" label to something clearer like "Open Projects" if that reads better in place — keep the component receiving `onOpenWorkspace` as today.
- [x] `App.tsx`: wherever `GetRecentClosedWorkspaces` was fetched (init effect, `handleOpenWorkspace`), replace with `GetEverOpenedWorkspaces` feeding the *Home* tab's data path, not the sidebar's. Confirm `GetRecentWorkspaces` (now capped at 8) still feeds the sidebar `WorkspaceList` as before.
- [x] `UsageTab.tsx`: recent-projects section now reads from the "ever opened" list/prop (max 15) instead of whatever it used before; update the section label if it said "Recent".

### Phase 3: cross-platform shortcuts + tab cycling

- [x] `App.tsx`'s global keydown handler: import `usePlatform` (already used in `TitleBar.tsx`), compute `const mod = (e: KeyboardEvent) => platform === 'darwin' ? e.metaKey : e.ctrlKey` (or equivalent), and switch the existing `p`/`=`/`-`/`0` checks from `e.metaKey` to this helper so they work on Linux/Windows too.
- [x] Add Ctrl/Cmd+Tab (next tab) and Ctrl/Cmd+Shift+Tab (previous tab): new `cycleTab(direction: 1 | -1)` in `editorStore.ts` using `tabs`/`activeTabId` with wraparound, wired into the same keydown handler. `e.preventDefault()` to stop any default browser tab-switch attempt.

### Phase 4: command palette

- [x] `frontend/src/utils/commands.ts`: `{id, label, run: () => void}[]` — v1 set per acceptance criterion 8 (New Terminal, New Query, Open Folder, Go to File, toggle Explorer/Git/Database panels, Go Home, Close Tab, Close All Tabs). Some of these need callbacks threaded in from `App.tsx` (e.g. panel toggle, open folder) — build the list inside a hook/function in `App.tsx` that has access to the needed setters, not as a static top-level array if it needs closures.
- [x] `components/CommandPalette.tsx`: adapt `FileSearch.tsx`'s overlay/list markup and CSS classes (`.file-search-overlay`, `.file-search-panel`, `.file-search-input-row`, `.file-search-list`, `.file-search-item`) for a command list instead of a file list — reuse classes where the visual is identical, add palette-specific ones only where it actually differs (no full style fork of a near-identical popup).
- [x] Wire Ctrl/Cmd+Shift+P in `App.tsx`'s keydown handler to open it; Enter runs the highlighted command and closes; Escape closes without running.

### Phase 5: Ctrl+Q and file explorer Ctrl+Enter

- [x] Ctrl/Cmd+Q in the same global keydown handler: same blank-query-tab `openOrFocusTab` call already used by `DatabasePanel.tsx`'s "New Query" button — either export that helper or duplicate the small `openOrFocusTab({...isQueryTab:true...})` call inline; keep it consistent with the DatabasePanel version (same field shape).
- [x] `FileExplorer.tsx`'s `handleKeyDown`: add a branch for Ctrl/Cmd+Enter that opens `focusedPath` the same way a click does (reuse whatever function the file row's `onClick` calls).

### Phase 6: database tree focus + Ctrl+Enter

- [x] `DatabasePanel.tsx`: add `focusedNode: { kind: 'connection' | 'database'; connectionId: string; database?: string } | null` state, set on click of a connection row or a database row (in addition to the existing expand/collapse toggle — don't remove that behavior, just also record focus).
- [x] A `tabIndex`/`onKeyDown` on the tree container (or per-row, matching whichever is simpler given the existing markup) handling Ctrl/Cmd+Enter: call `ListSavedQueries()`, filter by `connectionId` (and `database` if the focused node is a specific database), pick the max `updatedAt`; if the filtered list is empty, open a new blank query bound to the same scope (reuse the same open-query helper as phase 5); otherwise open the found one via the existing `openSavedQuery`-style call.

### Phase 7: always-open Home + shortcuts reference

- [x] `App.tsx`'s init effect: after the existing tab/workspace restore logic finishes, call the same `openOrFocusTab({ isUsageTab: true, ... })` shape the Home button in `ActivityBar.tsx` uses, so Home ends up active regardless of what was cached per workspace.
- [x] `UsageTab.tsx`: new small section listing every shortcut from this task (key combo + one-line description), plain two-column layout matching the existing card style, near the recent-projects section (exact placement is an implementer's call — note the choice made).

### Phase 8: verify

- [x] `go build ./...` and `npm run build` (tsc + vite) both pass clean.
- [ ] `wails build` (full binary) not run — not done in this session.
- [ ] `wails dev`, by hand: **not verified** — everything in this checklist (list behavior across a real restart, every shortcut in a real window, palette filtering/running a command, both database-tree Ctrl+Enter scopes, font-size shortcuts, Home-on-launch) requires clicking through a running window, which this assistant cannot do. Only verified by code reading/type-checking so far.
- [x] Recorded explicitly above which parts are code-verified only vs. actually clicked through (none of the latter yet), per this project's established honesty practice on GUI-only criteria.

### Phase 9: docs and finish

- [x] `workspace.md`, `shell.md`, `database.md` updated from "Planned" to shipped shape.
- [x] Confirmed `.specs/tasks/home-icon-and-closed-projects.md`'s superseded-note still reads accurately.
- [ ] `bsdd finish`. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Renaming `recentClosedWorkspaces` store state breaks a call site not caught by a quick grep | Runtime error, blank list | Grep all usages before renaming; prefer adding new state over renaming if any doubt |
| Ctrl/Cmd+Tab conflicting with a browser/webview default | Shortcut silently does nothing or does something else | `e.preventDefault()`, test on the real running window, not assumed from code |
| Command palette callback closures going stale (React state captured at mount) | Commands act on outdated state (wrong active panel, etc.) | Build the command list from current props/state on each palette open, not once at module scope |
| Database tree "focused node" state colliding with the existing expand/collapse click handler | Clicking a connection to expand it also unexpectedly changes what Ctrl+Enter would open, or vice versa — actually the intended behavior, but verify it doesn't *only* expand without recording focus | Explicit manual test for both single-click behaviors in phase 8 |
| `usePlatform()` resolves to `'unknown'` briefly on startup (documented elsewhere in this codebase) | A shortcut checks the wrong modifier for a moment right after launch | Same as `TitleBar.tsx`'s existing tolerance of this — acceptable, brief, already an accepted pattern here |

## Definition of Done

Per `.specs/tasks/quick-navigation-and-shortcuts.md`.
