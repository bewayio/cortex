---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/tasks/initial-setup.md
  children: []
  related_adrs: [0001, 0007]
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Unified window chrome

## Status

done (2026-09-21)

## Goal

Remove the empty black strip at the top of the window on Linux and Windows. Show the same layout as macOS on all three systems.

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Architecture: `.specs/architecture/overview.md`
- Module specs: `.specs/modules/shell.md`
- Area: `.specs/areas/desktop-window.md`
- UI: `.specs/ui/design-direction.md`
- ADRs: `.specs/adrs/0007-unified-window-chrome.md` (accepted), `.specs/adrs/0001-wails-desktop-shell.md`

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries are known (shell only)
- [x] Related ADRs reviewed (ADR-0007 accepted)
- [x] Security implications identified (none)

## Acceptance Criteria

1. On Linux and Windows the window is frameless. One shared title bar is the only chrome above the activity bar and editor area. No native bar, no second strip.
2. On macOS the window looks and behaves as today: hidden-inset title bar, native traffic lights, drag region, double click to maximize.
   On Linux and Windows the bar has minimize, maximize/restore and close on the right, drag, double click to maximize.
3. Bar height, color and border are identical on the three systems. Layout below it is identical.
4. Platform is detected in one place and exposed as `data-platform` on the root element. No other platform checks in components.
5. Linux and Windows windows resize from all 8 edges and corners, and cannot go below 800x500.
6. `wails dev` on Linux shows one bar only. `wails build` still passes.

## Implementation Notes

- Plan: `docs/plans/2026-09-21_unified-window-chrome.md` (single agent).
- Touch points: `main.go` (`Frameless` per OS), new `TitleBar` component, `frontend/src/App.tsx`, `frontend/src/styles/components.css`, platform detection via `Environment()` from `frontend/wailsjs/runtime`. Do not edit `frontend/wailsjs`.
- macOS keeps `mac.TitleBarHiddenInset`.
- Avoid a first paint flash: render the bar with the macOS inset hidden until the platform resolves.
- No Inbox/Outbox, no migrations.
- Next command: `bsdd start unified-window-chrome`.

## Definition Of Done

- [x] Acceptance criteria met (Linux, confirmed by the user)
- [x] Verified on Linux: build, `wails build`, and user run of `wails dev` with the visual checklist. Windows and macOS **not verified** (no machine available)
- [x] `shell.md`, `design-direction.md`, `overview.md`, `docs/frontend.md` updated
- [x] ADR-0007 status set to Accepted
- [ ] Sync Review completed if source docs changed (pending, `bsdd sync` not run)
