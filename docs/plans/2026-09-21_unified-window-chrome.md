# Plan: Unified window chrome

- Task: `.specs/tasks/unified-window-chrome.md`
- ADR: `.specs/adrs/0007-unified-window-chrome.md` (accepted)
- Execution model: **single agent**, phases in sequence
- Status: done

## Goal

One title bar, same on Linux, Windows and macOS. Frameless window on Linux and Windows. Native traffic lights on macOS.

## Definition of Ready

- [x] Spec, criteria and ADR current
- [x] Only the shell module is touched
- [x] No security impact

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | Window option per OS | S | none |
| 2 | Platform detection | S | none |
| 3 | Shared TitleBar component and CSS | M | 1, 2 |
| 4 | Verify | M | 3 |
| 5 | Docs and sync | S | 4 |

### Phase 1: window option per OS

- [x] In `main.go`, add a small function returning whether the window is frameless. Explicit branches: darwin false, linux true, windows true.
- [x] Set `Frameless` from it. Keep the `Mac` options as they are.
- [x] Leave `DisableFramelessWindowDecorations` unset on Windows so shadow and snapping stay.

### Phase 2: platform detection

- [x] Add `frontend/src/utils/platform.ts`. It calls `Environment()` from `wailsjs/runtime` once and returns `darwin`, `linux` or `windows`.
- [x] Expose it through a hook. Set `data-platform` on the root element. Default to a neutral value before it resolves.
- [x] Do not edit `frontend/wailsjs`.

### Phase 3: TitleBar component and CSS

- [x] Create `frontend/src/components/TitleBar.tsx`. It replaces the bare `app-titlebar` div in `App.tsx`.
- [x] Left area: 80px inset on macOS, none elsewhere. Center or left: app name `BCode`.
- [x] Right area on Linux and Windows: minimize, maximize/restore, close. Icons as inline SVG. Close hover uses a red background.
- [x] Maximize state from `WindowIsMaximised()`, refreshed on window `resize`.
- [x] Double click on the bar calls `WindowToggleMaximise()`. Buttons stop propagation.
- [x] In `components.css`: add `--titlebar-height` token (44px), keep background `#161616` and the bottom divider, replace `-webkit-app-region` with `--wails-draggable: drag`, and `--wails-draggable: no-drag` on buttons. Prefix classes with `app-`.
- [x] Remove the old strip styles and the macOS-only comment.

### Phase 4: verify

- [x] `npm run build` in `frontend` passes.
- [x] `wails dev` on Linux, checklist:
  - one bar only, no native bar
  - drag moves the window
  - double click maximizes and restores
  - minimize, maximize/restore and close work
  - resize from 4 edges and 4 corners
  - cannot shrink below 800x500
  - terminal, editor and sidebar resize handles near the edges still work
  - no strip flash on first paint
- [x] `wails build` passes on Linux. App starts without crash (5 s smoke run). No screenshot tool available here.
- [x] Windows and macOS: not verified, no machine available.

### Phase 5: docs and sync

- [x] Update `.specs/modules/shell.md`: remove "planned", describe `TitleBar`, `platform.ts`, `data-platform`.
- [x] Update `.specs/ui/design-direction.md` layout contract and token table (`--titlebar-height`).
- [x] Update `.specs/architecture/overview.md` risk row.
- [x] Create `docs/frontend.md` with the title bar pattern, per the global rule.
- [x] Set the task to `done` through `bsdd finish`. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| WebKitGTK or Wayland drag and resize quirks | Window hard to move or resize | Test on the real desktop. Fall back to `--wails-draggable` on the inner bar only |
| Edge resize zone overlaps activity bar and status bar edges | Clicks near edges start a resize | Accept the 6px Wails border, check handles |
| No native shadow on Linux | Window looks flat on light desktops | Keep the 1px divider. Revisit if needed |
| Windows 11 snap layouts absent on custom button | Minor UX loss | Documented in ADR as known trade-off |
| Cannot test Windows and macOS here | Untested branches | Report clearly, keep branches minimal |

## Definition of Done

Per the task file. Plus: the verification checklist recorded in the task before `done`.
