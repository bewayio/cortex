---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 2
connections:
  parent: .specs/tasks/project-switcher-and-stable-order.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: Project switcher overlay (Ctrl/Cmd+↑/↓) + stable "Open projects" order

## Linked Task

`.specs/tasks/project-switcher-and-stable-order.md` → status set to `planned` by this plan.

## Execution Model

**Single agent.** Backend (Go, stable-order change) must land before the frontend drag-reorder/switcher can persist anything meaningful against it — sequential dependency, same pattern as this module's other tasks this session.

## Definition of Ready — confirmed

- Project DNA, architecture overview, `.specs/modules/workspace.md`, `.specs/modules/shell.md` read.
- Root cause/current behavior confirmed by reading `app.go`: `SaveWorkspace` calls the shared `frontInsertCapped` helper for *both* `recent.json` and `ever_opened.json` — always move-to-front, always capped. `WorkspaceList.tsx` has no existing drag-and-drop for either list.
- No blocking tasks; no cross-module boundary beyond `workspace` (backend) + `shell` (frontend shortcut/overlay).

## Plan-Time Decisions

- **Eviction rule for a new entry when "Open projects" is already at its cap (8)**: not specified by the user (who only said "stop reordering on select"). Simplest rule consistent with "stable, user-arranged order": a brand-new project is appended at the **end** of the list; if that pushes the list over the cap, the entry at the **front** (position 0) is evicted — the only remaining "oldest" signal once there's no more most-recently-used reordering. Revisit if this doesn't feel right in use.
- **`ReorderRecentWorkspaces` takes the full ordered id list** (not a from/to index pair) — simplest given "Open projects" is always fully visible and small (≤8 entries), matches how `WorkspaceList.tsx` would naturally hand off a post-drag array.

## Phases

### Phase 1 — Backend: stop reordering "Open projects" on open/switch (S)

- `app.go`: new `stableUpsertCapped(list []Workspace, entry Workspace, cap int) []Workspace` — if `entry.ID` already in `list`, return `list` unchanged (just updates `Name`/`Path` in place in case they changed, same spirit as the existing upsert); if new, append at the end, then truncate from the **front** if over cap (see Plan-Time Decisions).
- `SaveWorkspace`: use `stableUpsertCapped` for `recent` (Open projects), keep `frontInsertCapped` for `everOpened` (Ever opened — unaffected, stays MRU).
- New method `ReorderRecentWorkspaces(ids []string) error`: reads `recent.json`, reorders its entries to match `ids` (any id not in `ids` keeps its relative position at the end, defensive against a stale/partial list from the frontend), writes back.
- `wails generate module` after adding the method.
- Dependency: none (first phase).

### Phase 2 — Frontend: drag-and-drop reordering in `WorkspaceList.tsx` (S)

- Add mouse-based drag-and-drop to the "Open projects" section's rows (`source === 'open'`) — same convention as other drag-reorder in this codebase (mouse-based, not HTML5 DnD; see `EditorTabBar.tsx`/`Terminal.tsx`'s tab reordering for the established pattern), not the "Ever opened" section (Home tab, unaffected, no drag needed there).
- On drop, call the new `ReorderRecentWorkspaces` with the new full id order, then refresh `recentWorkspaces` in `workspaceStore`.
- Dependency: Phase 1.

### Phase 3 — Frontend: project switcher overlay component (M)

- New `components/ProjectSwitcher.tsx`: a full-screen dim overlay (fixed, covers the whole window) with a centered card listing "Open projects" (from `workspaceStore.recentWorkspaces`, already in stable order after Phase 1–2), one row highlighted. Clicking a row commits immediately (calls `handleOpenWorkspace` and dismisses).
- `App.tsx`: new global `keydown`/`keyup` listeners (alongside the existing `mod`-based shortcut handlers, `usePlatform()`-driven Ctrl-vs-Cmd convention already used everywhere else in this file) —
  - `keydown` with the modifier held and `ArrowDown`/`ArrowUp`: if the overlay isn't open yet, open it (default highlight = current workspace's index, or 0); otherwise move the highlight by ±1 with wraparound. `preventDefault()` so the arrow key doesn't do anything else (e.g. scroll).
  - `keyup` of the modifier key itself (not the arrow): if the overlay is open, commit the highlighted project (`handleOpenWorkspace`) and close the overlay.
  - `Escape` while open: close without committing.
- Dependency: Phase 2 (needs the same stable, reorderable list the overlay cycles through).

### Phase 4 — Styling (S)

- New CSS section for `.project-switcher-overlay`/`.project-switcher-card`/`.project-switcher-row` (dim backdrop, centered card, highlighted-row treatment) — one implementation, used identically on every OS (restriction: same behavior everywhere), not a native per-OS switcher.
- Dependency: Phase 3.

### Phase 5 — Verification (S)

- `tsc --noEmit`, `vite build`, `go build ./...`.
- A disposable Go test for `stableUpsertCapped`/`ReorderRecentWorkspaces` (upsert-keeps-position, new-entry-appends-and-evicts-front-when-over-cap, reorder-applies-given-order) — cheap to verify without a real MySQL/GUI dependency, pure logic over JSON files.
- Manual GUI verification flagged as needed from the user (the hold-and-release gesture, the overlay's visual appearance, drag-reordering "Open projects") — this is fundamentally a held-key interaction this assistant cannot simulate; no GUI-automation tool available here.
- Dependency: Phases 1–4.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1. Backend: stop reordering, add `ReorderRecentWorkspaces` | S |
| 2. Drag-and-drop in `WorkspaceList.tsx` | S |
| 3. Project switcher overlay component + shortcut | M |
| 4. Styling | S |
| 5. Verification | S |

## Out of Scope

Unchanged from the linked task: "Ever opened" ordering, editor-tab cycling, a configurable cap/sort mode.

## Status

All 5 phases implemented 2026-10-11. See `.specs/tasks/project-switcher-and-stable-order.md` for verified vs. not-yet-verified acceptance criteria.

## Next Step

Run `bsdd finish` once the user confirms the interactive behavior in `wails dev`.
