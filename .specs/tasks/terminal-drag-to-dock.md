---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-01
version: 4
connections:
  parent: .specs/modules/terminal.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Terminal drag-to-dock (bottom / right sidebar, both open together)

## Status

`in-progress` — all 6 implementation phases done (see `.specs/tasks/terminal-drag-to-dock-plan.md`); kept out of `done` only because interactive drag verification in `wails dev` needs the user, not this assistant (no GUI-automation tool available here).

## Goal

Remove the single global dock-toggle icon for the terminal panel. Each terminal tab independently docks to the bottom panel or the right sidebar, moved by dragging its tab and dropping it on the destination zone. Both docks can hold terminals simultaneously. The right dock becomes a true full-height sidebar (sibling of the left Explorer/Git sidebar), collapsing to zero width when empty; the bottom dock keeps using the remaining width, naturally stopping short of the right sidebar when it holds terminals.

## Background

User request, 2026-10-01: today `Terminal.tsx` is one panel with one internal tab list and a single `terminalDock` ('bottom' | 'right') toggled by an icon button (`terminal-dock-btn`) in `App.tsx` / `shell.md`'s owned state — all terminals move together, and the "right dock" is nested inside `editor-area`'s row rather than spanning full window height. See `.specs/modules/terminal.md` and `.specs/modules/shell.md` Notes (2026-10-01 entries) for the full rationale and the decisions already confirmed with the user (right sidebar collapses to width 0 when empty; drag gesture is the same mouse-based tab drag already used by `EditorTabBar.tsx`, not HTML5 DnD).

## Acceptance Criteria

- [x] The dock-toggle icon button and `onToggleDock` prop are removed from `Terminal.tsx`.
- [x] Each terminal tab carries its own dock (`'bottom' | 'right'`), persisted so it survives a restart (same persistence boundary as existing terminal tab names/count).
- [x] Dragging a terminal tab and dropping it on the opposite dock zone moves that one terminal there — other terminals in its original dock are unaffected.
- [x] Bottom dock and right dock can each show one or more terminals at the same time; switching tabs within a dock only affects that dock's own active tab.
- [x] The right dock is a sibling flex item of `.sidebar` and `.editor-area` inside `.app-content` (`App.tsx`), spanning the full content height — not nested inside `editor-area`'s row.
- [x] The right dock has width 0 / is not rendered when it holds zero terminals; it appears (restoring the persisted `terminalWidth`) as soon as a terminal is dragged into it, and collapses again if the last terminal leaves it (dragged back to bottom, or closed). Also revealed as a temporary "ghost" drop zone (min size, dashed outline, placeholder text) while any terminal tab is mid-drag, even with 0 tabs — otherwise there'd be no way to populate an empty dock by dragging into it.
- [x] The bottom dock's terminal(s) use the editor area's full width when the right dock is collapsed, and stop at the right dock's left edge when it's showing terminals — confirmed: falls out of the flex layout (right dock is now a true sibling region), no manual width cap needed.
- [x] Existing terminal behavior is unaffected: PTY sessions, tab rename, Shift+Enter, Ctrl+V image paste (per `terminal.md`'s existing notes) all keep working regardless of which dock a terminal is in — code path unchanged, only `dock` tagging and which wrapper div hosts the xterm instance changed.
- [x] Resize handles still work per dock: height drag for the bottom dock, width drag for the right dock — each conditioned independently on that dock's own tab count.

**Verified:** `tsc --noEmit`, `vite build`, `go build ./...` all clean; `wails build` succeeds; a smoke-launch of the built binary (`./build/bin/bcode`, ~6s, then terminated) showed no crash and no console errors beyond a pre-existing, unrelated GTK theme-parsing warning.
**Not verified by the assistant** (no GUI-automation tool available in this session — needs the user's own pass in `wails dev`): actually dragging a terminal tab across docks by hand, confirming the ghost drop-zone/highlight renders correctly, and confirming persistence survives a real app restart.

## Affected Modules

- `terminal` (primary — per-tab dock state, drag gesture, tab-group split)
- `shell` (layout: right dock becomes a full-height sibling region, collapse-when-empty, removal of the global `terminalDock` pref)

## Out of Scope

- Changing how terminals are created, named, or how PTY sessions behave.
- Any change to the left Explorer/Git sidebar.
- Multi-monitor or detached (separate OS window) terminals — still one app window.

## Next Step

Run `bsdd plan` to turn this into an ordered implementation plan.
