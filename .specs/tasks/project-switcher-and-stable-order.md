---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 6
connections:
  parent: .specs/modules/workspace.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Project switcher overlay (Ctrl/Cmd+↑/↓) + stable "Open projects" order

## Status

`in-progress` — all 5 implementation phases done (see `.specs/tasks/project-switcher-and-stable-order-plan.md`); kept out of `done` only because interactive GUI verification in `wails dev` needs the user (no GUI-automation tool available here).

## Goal

A new global shortcut — hold Ctrl (Linux/Windows) or Cmd (macOS), tap ↑/↓ — shows an app-switcher-style overlay (same look on every OS) listing "Open projects" in a fixed, user-controlled order; releasing the modifier switches to the highlighted project. "Open projects" stops reordering itself on open/switch (today it moves the opened project to the front, most-recently-used-first) — its order only changes when the user drags an entry up/down in the sidebar.

## Background

User request, 2026-10-11. See `.specs/modules/workspace.md` Notes (2026-10-11 entries) for full rationale. Confirmed with the user: the switcher cycles the sidebar's "Open projects" list specifically (not "Ever opened", which keeps its existing most-recently-used-first behavior — it's a history view, not something the user hand-arranges).

Current behavior (read from code): `SaveWorkspace` (`app.go`) moves the opened workspace to the front of both `recent.json` and `ever_opened.json` on every call. `WorkspaceList.tsx` renders both lists in whatever order the backend returns. There is no existing drag-and-drop for either list, and no project-level keyboard shortcut today (the existing Ctrl/Cmd+Tab cycles *editor tabs*, not projects — see `shell.md`).

## Acceptance Criteria

- [x] `SaveWorkspace` no longer reorders `recent.json` ("Open projects") on open/switch — a project keeps its position (`stableUpsertCapped`, replacing `frontInsertCapped` for this list only). `ever_opened.json` ("Ever opened") is unaffected, still most-recently-used-first. Verified with a disposable Go test: re-saving (re-opening) a project does not move it.
- [x] The sidebar's "Open projects" section supports drag-and-drop reordering (up/down within the list, mouse-based — same convention as `EditorTabBar.tsx`); the dragged order persists via the new `ReorderRecentWorkspaces` backend method.
- [x] Holding Ctrl/Cmd and pressing ↑ or ↓ shows an overlay (`components/ProjectSwitcher.tsx`) listing "Open projects" in their current (stable, user-arranged) order, with one entry highlighted.
- [x] Each ↑/↓ press while the modifier is held moves the highlight to the previous/next entry (wrapping around at both ends via modulo arithmetic) — it does **not** switch the active workspace yet (only local `switcherIndex` state changes).
- [x] Releasing Ctrl/Cmd (`keyup` on `Meta`/`Control`) commits the highlighted project via `handleOpenWorkspace` (same function the sidebar click uses) and dismisses the overlay.
- [x] Clicking a project in the overlay with the mouse commits immediately via the same `handleOpenWorkspace` call.
- [x] The overlay's visual style is one implementation (`.project-switcher-overlay`/`-card`/`-row` in `components.css`), used identically regardless of OS.
- [x] If zero projects are open, the shortcut does nothing (`projects.length === 0` guard in the keydown handler, before `preventDefault` even fires — doesn't swallow the arrow key for no reason). One project still opens a trivial single-row overlay, no crash.
- [x] Pressing Escape while the overlay is open cancels without switching (`switcherIndex` reset to `null`, `handleOpenWorkspace` never called).

## Affected Modules

- `workspace` (primary — `SaveWorkspace` reorder removal, new `ReorderRecentWorkspaces` method, `recent.json` shape unaffected otherwise)
- `shell` (new global keyboard shortcut + overlay component, alongside the existing Ctrl/Cmd+Tab editor-tab cycling)

## Out of Scope

- Any change to "Ever opened" (Home tab) ordering or behavior.
- Editor-tab cycling (existing Ctrl/Cmd+Tab) — untouched, this is a separate, project-level shortcut.
- A configurable cap or sort mode for "Open projects" — stays at its existing planned cap (8), just stops auto-reordering.

## Bug fix (2026-10-11, same day, user report)

The shortcut didn't work with a file open — Monaco intercepted Ctrl/Cmd+↑/↓ before it reached `App.tsx`'s window listener (same class of bug as the existing Ctrl/Cmd+Tab fix). Fixed by moving the switcher's "open/move highlight" logic into `workspaceStore.ts` (`cycleProjectSwitcher`/`closeProjectSwitcher` actions) and adding global Monaco commands in `globalEditorShortcuts.ts`, mirroring the Tab-cycle precedent exactly. See `.specs/modules/shell.md`'s Notes for the full writeup. `tsc`/`vite build`/`go build` re-verified clean.

## Progress

All 5 phases done 2026-10-11. Phases 1–2 (stop auto-reordering "Open projects", add drag-to-reorder) landed first, fixing the specific bug the user reported. Phases 3–5 (the Ctrl/Cmd+↑/↓ switcher overlay, styling, verification) followed in the same session.

**Verified:** `tsc`, `vite build`, `go build`/`vet`/`fmt`, `wails build` all clean; a disposable Go test confirmed `stableUpsertCapped` (existing entry keeps position, new entry appends, over-cap evicts the front) and `ReorderRecentWorkspaces` (applies given order; a subsequent re-open does not undo it).
**Not verified by the assistant** (no GUI-automation tool available here): the actual drag gesture in the sidebar, and the Ctrl/Cmd+↑/↓ hold-and-release gesture itself — both are fundamentally interactive, needs the user's own pass in `wails dev`.

## Next Step

Run `bsdd finish` once the user confirms the interactive behavior in `wails dev`.
