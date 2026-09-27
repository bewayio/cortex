---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-27
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: []
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Two project lists, global shortcuts, command palette, always-open Home

## Status

implemented, pending manual verification — all 15 acceptance criteria coded and building clean (`go build ./...`, `npm run build`); interactive `wails dev` walkthrough not yet done (assistant cannot click through a running window)

## Goal

Two clearly-scoped project lists ("Open projects" above the file explorer, "Ever opened" — max 15 — on Home), a set of new global keyboard shortcuts (tab cycling, go-to-file, command palette, quick-open-query, keyboard-driven file/database opening), the app always opening on the Home tab, and all these shortcuts shown visually on Home.

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Module specs: `.specs/modules/workspace.md` (redesigned), `.specs/modules/shell.md` (shortcuts, command palette), `.specs/modules/database.md` (Ctrl+Q, tree Ctrl+Enter), `.specs/modules/usage.md` (Home content), `.specs/modules/files.md` (file explorer keyboard nav, already exists)
- Superseded task: `.specs/tasks/home-icon-and-closed-projects.md` (its "recently closed" list and close action are removed by this task; its Home-icon reorder is untouched)
- ADRs: none new

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries known (`workspace`, `shell`, `database`, `files` frontend touch points)
- [x] Related ADRs reviewed (none apply)
- [x] Security implications identified (none — no new data leaves the machine, no new secrets)

## Decisions Already Made (2026-09-27, with the user)

1. **Replace, not add to**, the previous "recently closed" list and its Archive/close action (`.specs/tasks/home-icon-and-closed-projects.md`). Two lists instead: "Open projects" (above the explorer) and "Ever opened" (Home, max 15).
2. **"Open projects" persists** across app restarts (not session-only). Cap is a project default (**8**, not user-specified) — smaller than the Home list on purpose, easy to tune later.
3. **Ctrl/Cmd+Q** opens a **new blank query tab** directly (not the Database sidebar panel). **Revised same day (user follow-up)**: it now reopens/focuses the last-used saved query instead, falling back to a blank tab only if none exists — see criterion 9.
4. **Ctrl/Cmd+Enter on a connection node** (not a specific database) in the tree looks for the most recent saved query **within that connection's own databases only** — not across every connection in the app.
5. **Cross-platform shortcut convention**: Ctrl on Linux/Windows, Cmd on macOS — for every new shortcut in this task, applying the same rule already used for the SQL editor's Run/Save shortcuts, not a literal "Ctrl" everywhere (macOS reserves plain Ctrl+P as a native Cocoa text-navigation shortcut). This also means fixing the *existing* file-search and font-size shortcuts in `App.tsx`, which today check `metaKey` only and silently do nothing on Linux/Windows.

## Acceptance Criteria

### Two project lists

1. A list labeled for quick project switching appears above the file explorer in the sidebar, showing up to 8 most-recently-used projects, most-recent-first. Clicking one switches to it.
2. A separate list on the Home tab shows up to 15 most-recently-used projects (independent cap from #1), most-recent-first. Clicking one opens it.
3. Opening any project (new or already in a list) moves it to the front of *both* lists.
4. The old "Recently Closed" section and its Archive/close button are gone from `WorkspaceList.tsx`. **Revised same day (bug report)**: a single shared `X` removing from both lists made "Open projects" and "Ever opened" behave as one list in practice — closing a project from the sidebar erased it from Home history too. Fixed with two distinct actions behind the same `X`, picked by `WorkspaceList.tsx`'s `source` prop: sidebar's `X` calls `CloseWorkspace` (removes from "Open projects" only), Home's `X` calls `RemoveWorkspace` (removes from both — it's the "forget entirely" action there).
5. Both lists persist across an app restart.

### Shortcuts

6. Ctrl/Cmd+Tab moves to the next editor tab; Ctrl/Cmd+Shift+Tab to the previous; both wrap around at the ends.
7. Ctrl/Cmd+P opens the existing go-to-file search — and now works on Linux and Windows too (today it's macOS-only).
8. Ctrl/Cmd+Shift+P opens a new command palette listing at least: New Terminal, New Query, Open Folder, Go to File, toggle each sidebar panel (Explorer/Git/Database), Go Home, Close Tab, Close All Tabs. Typing filters the list; Enter runs the highlighted command; Escape closes it.
9. Ctrl/Cmd+Q reopens/focuses the last-used saved query (highest `updatedAt` across all connections); if it's already open in a tab, it's just focused (existing `savedQueryId` dedupe in `openOrFocusTab`), not duplicated. Only opens a new blank tab if no saved query exists at all (revised per decision 3's update).
10. In the file explorer, with an item keyboard-focused (arrow-key navigation already exists), Ctrl/Cmd+Enter opens it — same result as clicking it.
11. In the database tree, with a table or database node focused/clicked, Ctrl/Cmd+Enter opens that database's most recently updated saved query, or a new blank query bound to it if none exists.
12. In the database tree, with a *connection* node focused/clicked (not a specific database), Ctrl/Cmd+Enter opens the most recently updated saved query across that connection's databases (per decision 4), or a new blank query for that connection if none exists.
13. The existing font-size shortcuts (`Cmd+=`, `Cmd+-`, `Cmd+0`) also get the cross-platform fix (decision 5) while this area of `App.tsx` is being touched — same bug, same fix, no reason to leave two of the three broken.

### Home tab

14. The app always opens showing the Home tab, regardless of which workspace/file was open when it was last closed.
15. The Home tab visually lists the shortcuts from this task (key combo + short description) — a reference, not just a changelog entry nobody sees.

## Implementation Notes

- **Backend** (`app.go`, workspace section): rename/repurpose without losing existing data compatibility where reasonable — `recent.json` becomes the capped-8 "Open projects" list (`GetRecentWorkspaces` keeps its name and shape, just gains a cap); add `~/.bcode/ever_opened.json` + `GetEverOpenedWorkspaces()` (capped 15). `SaveWorkspace` updates both. Remove `recent_closed.json`, `GetRecentClosedWorkspaces`, `CloseWorkspace`, and the `purgeFromRecentClosed` helper entirely — dead code once the frontend stops calling them. `RemoveWorkspace` no longer needs to touch a "closed" list, only the two lists above.
- **Frontend — lists**: `WorkspaceList.tsx` loses its "Recently Closed" section and the `Archive` button; it now renders under a clear "Open Projects" label (still the always-visible block above Explorer/Git/Database panel content — unchanged position). `UsageTab.tsx`'s existing recent-projects section becomes "Ever opened", backed by `GetEverOpenedWorkspaces`, capped display at 15 (the backend already caps, but don't rely on that alone if the component ever reuses `WorkspaceList.tsx` — pass the right data source explicitly).
- **Frontend — tab cycling**: a small addition to `editorStore.ts` (e.g. `cycleTab(direction: 1 | -1)`) using the existing `tabs`/`activeTabId`, wired to a global keydown handler in `App.tsx`.
- **Frontend — Ctrl+P fix and Ctrl+Shift+P**: `App.tsx`'s existing keydown handler already has a metaKey-only branch for `p`; extend the modifier check using `usePlatform()` (already used elsewhere, e.g. `Terminal.tsx`) to resolve Ctrl vs Cmd per OS instead of hardcoding `metaKey`. Same fix for the `=`/`-`/`0` font-size shortcuts already in that handler (decision 5 / criterion 13). New `components/CommandPalette.tsx`, modeled on `FileSearch.tsx`'s overlay markup/CSS (`.file-search-overlay` etc. — reuse or lightly adapt, don't invent a parallel modal style) with its own small command registry file, e.g. `frontend/src/utils/commands.ts` (`{id, label, run: () => void}[]`), easy to extend later without touching this task's spec again.
- **Frontend — Ctrl+Q**: reuses the same "New Query" logic already in `DatabasePanel.tsx` (blank tab, `isQueryTab: true`, no bound connection/database yet — the tab's own subheader lets the user pick, and `QueryTab.tsx`'s `ensureConnected()` from the previous task's follow-up already handles the "nothing picked yet" case when the user runs it).
- **Frontend — file explorer Ctrl+Enter**: one more branch in `FileExplorer.tsx`'s existing `handleKeyDown` (it already handles `ArrowUp`/`ArrowDown`), calling the same open-file function bound to `focusedPath`.
- **Frontend — database tree Ctrl+Enter**: `DatabasePanel.tsx` needs a currently-focused-tree-node concept (it doesn't fully have one today — clicking a connection/database toggles expansion, it doesn't set a distinct "focused" state the way `FileExplorer.tsx` does). Add a lightweight `focusedNode: { kind: 'connection' | 'database'; connectionId: string; database?: string } | null`, set on click (in addition to the existing expand/collapse behavior — don't remove that), and a keydown handler that, on Ctrl/Cmd+Enter, filters `ListSavedQueries()` by `connectionId` (and `database`, if the focused node is a specific database) and opens the one with the latest `updatedAt`, or a new blank query bound to the same scope if the filtered list is empty.
- **Home tab shortcuts list**: a new small section in `UsageTab.tsx`, a plain two-column reference (key combo, description) styled consistently with its existing card sections — not a new card style invented for this alone.
- **Startup**: in `App.tsx`'s existing init effect (which restores the last workspace and its tabs), after that restore completes, call the same `openOrFocusTab({ isUsageTab: true, ... })` the Home button already uses, so Home ends up as the active tab regardless of what was cached.
- Do not touch `frontend/wailsjs` by hand; `wails generate module` after any backend method changes.
- Out of scope: a full VS Code-style "quick switcher" fuzzy search across *all* app state (files + commands + projects combined into one box) — this task keeps Ctrl+P (files), Ctrl+Shift+P (commands) and the project lists as three separate, simpler surfaces, matching what was actually asked for.

- Plan: `docs/plans/2026-09-27_quick-navigation-and-shortcuts.md`. Next command: `bsdd start`.

## Definition Of Done

- [ ] Acceptance criteria 1–15 verified by hand in `wails dev` (list behavior, every shortcut, the command palette, Home always opening, the shortcuts reference actually being visible) — **not done**: this task is almost entirely interactive UI behavior that cannot be verified by a backend test alone, and this assistant cannot click through a running window. All 15 criteria are implemented and type/build-checked (`go build ./...`, `npm run build` both clean) but not exercised live.
- [x] `workspace.md`, `shell.md`, `database.md` updated from "Planned" to the shipped shape
- [x] `.specs/tasks/home-icon-and-closed-projects.md` status note confirmed accurate (superseded parts clearly marked, not silently left stale)
- [ ] Sync Review completed if source docs changed — pending `bsdd sync`, to be run only with user confirmation
