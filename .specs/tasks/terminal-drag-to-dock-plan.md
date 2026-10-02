---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-01
version: 2
connections:
  parent: .specs/tasks/terminal-drag-to-dock.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: Terminal drag-to-dock

## Linked Task

`.specs/tasks/terminal-drag-to-dock.md` → status set to `planned` by this plan.

## Execution Model

**Single agent.** Concentrated in `Terminal.tsx` + `App.tsx` (and their stylesheet), one coherent UI change — no independent parallel surface.

## Definition of Ready — confirmed

- Project DNA, architecture overview, `.specs/modules/terminal.md` and `.specs/modules/shell.md` read.
- Task linked to both module specs; acceptance criteria testable.
- No blocking tasks pending; `pinned-tabs.md` and `tab-focus-and-persistence-fixes.md` touch the *editor* tab bar, a different component — no overlap.

## Current State (read from code, `frontend/src/components/Terminal.tsx` + `App.tsx`)

- `Terminal.tsx` owns one flat `tabs: TermTab[]` array (all terminals, PTYs, xterm instances), one `activeId`, and already has a mouse-based drag-to-reorder gesture (`handleTabMouseDown`) within its own tab bar — the gesture to extend, not reinvent.
- `App.tsx` mounts exactly one `<Terminal>` instance; `terminalDock` (`'bottom' | 'right'`) is global, read by both `App.tsx` (layout/flex direction, which resize handle to wire) and passed into `Terminal.tsx` only to pick `panelStyle` and the toggle-button icon/label.
- Persistence today: `bcode.termtabs.{workspaceId}` (tab id/type/title list + activeId, no dock field), `bcode.terminalDock` (global, owned by `shell`).

## Phases

### Phase 1 — Add `dock` to tab state and persistence (S)

- Add `dock: 'bottom' | 'right'` to `TermTab`, defaulting new tabs to `'bottom'`.
- Include `dock` in `saveTabConfig`/`loadTabConfig`'s persisted shape; treat a missing `dock` field (tabs saved before this change) as `'bottom'` on load — no migration script needed, just a default at read time.
- Dependency: none (first phase).

### Phase 2 — Split rendering into two dock regions, one shared tab list (M)

- `Terminal.tsx` (or a thin wrapper) renders two independent tab bars + content areas, each filtering `tabs` by `dock`, while `createTerminal`, the PTY/event wiring, and the single `wrapperRef` xterm-hosting div stay shared — xterm instances must **not** remount when a tab moves dock (same `display:none`-preserve pattern already used for inactive tabs).
- `App.tsx` mounts this as one logical unit spanning both the bottom panel and the right sidebar regions (exact composition — one component rendering into two DOM locations via a second ref/portal, vs. two thin presentational components reading from a shared hook — is an implementation-time call, not fixed here).
- Each dock region keeps its own `activeId` (a tab active in the bottom dock and a tab active in the right dock can both be visible at once) — current single global `activeId` becomes two.
- Dependency: Phase 1.

### Phase 3 — Extend the drag gesture to cross-dock moves (M)

- Reuse `handleTabMouseDown`'s existing `mousemove`/`mouseup` tracking; add hit-testing against the *other* dock region's bounding rect (not just the current tab bar's own children) so dropping a dragged tab over the opposite dock's tab bar (or its content area) sets that tab's `dock` instead of reordering in place.
- Visual feedback while dragging across docks (e.g. highlight the destination region) — reuse the existing `tab-drop-indicator` convention, extended for a cross-dock drop rather than introducing a new indicator style.
- Dependency: Phase 2.

### Phase 4 — Right dock becomes a full-height sibling region, collapses when empty (M)

- In `App.tsx`, move the right-dock terminal area out of `.editor-area`'s row into a new sibling of `.sidebar` and `.editor-area` inside `.app-content`, per `shell.md`'s 2026-10-01 note.
- Width is 0 / not rendered when the right dock's filtered tab list is empty; restores the persisted `terminalWidth` as soon as a tab is dragged in; collapses again when the last tab leaves (dragged to bottom, or closed).
- Bottom dock keeps its current full-width behavior; verify it now stops at the right sidebar's edge purely from the flex layout change (sibling regions), no manual width cap needed.
- Remove the global `terminalDock` state, the `terminal-dock-btn` toggle button, and `onToggleDock` prop entirely.
- Dependency: Phase 3 (dock field must exist and be settable before the layout can react to "is a dock empty").

### Phase 5 — Resize handles and `showTerminal`/mount lifecycle per dock (S)

- Each dock needs its own resize handle (bottom: height-drag, right: width-drag) active independently — today's single `showTerminal`/`terminalMounted` pair (one boolean for the whole panel) becomes dock-aware: the bottom dock is "open" if it has ≥1 tab, independently of the right dock.
- `onClose` (today closes "the terminal panel") becomes per-dock: closing the last tab in a dock hides only that dock, not the other.
- Dependency: Phase 4.

### Phase 6 — Manual verification (S)

- No automated UI test harness in this project (desktop Wails app) — verify by hand in `wails dev`: drag a terminal from bottom to right and back, confirm both docks can hold terminals simultaneously with independent active tabs, confirm PTY output/input, rename, and close still work per terminal regardless of dock, confirm resize handles, confirm right dock collapses/expands correctly, confirm persistence survives an app restart.
- Dependency: Phases 1–5.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1. Add `dock` to tab state + persistence | S |
| 2. Split rendering into two dock regions | M |
| 3. Cross-dock drag gesture | M |
| 4. Right dock full-height sibling + collapse | M |
| 5. Per-dock resize + open/close lifecycle | S |
| 6. Manual verification | S |

## Out of Scope

Unchanged from the linked task: terminal creation/naming/PTY behavior, the left Explorer/Git sidebar, multi-window/detached terminals.

## Status

All 6 phases implemented 2026-10-01. See `.specs/tasks/terminal-drag-to-dock.md` for verified vs. not-yet-verified acceptance criteria — automated checks (`tsc`, `vite build`, `go build`, a smoke-launch) passed; interactive drag verification in `wails dev` still needs the user.

## Next Step

Run `bsdd finish` once the user confirms interactive behavior in `wails dev`.
