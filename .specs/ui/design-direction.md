---
bsdd_version: "1.0"
document_type: source
domain: ui
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: [0001, 0007]
  sync_triggers:
    - Visual style changes
    - New area added
    - Design system adopted/changed
---

# Design Direction

> Documented from code (`inferred`). Not yet confirmed by the user. Confirm before any new layout work.

## Style per Surface

| Surface | Chosen style | Reference | Emulate | Avoid |
|---------|--------------|-----------|---------|-------|
| desktop-window | Dark, dense, VS Code like | VS Code (inferred from tokens and layout) | Activity bar, sidebar, tabbed editor, status bar | Extra bars that exist on one OS only |

## Layout Contract

- Order top to bottom: window chrome, main row (activity bar 48px, sidebar 240px default, editor area), status bar 22px.
- Terminal docks bottom or right and is resizable.
- Window chrome is identical on Linux, Windows and macOS. No separate empty strip above the content. The macOS look (hidden-inset, content starting at the top edge) is the reference. Method: ADR-0007 (accepted), frameless window on Linux and Windows with one shared title bar, native traffic lights on macOS.

## Branding

- App icon: `build/appicon.png` (1024×1024, transparent background, a "b" mark with a checkmark stroke, teal-to-dark gradient). Set 2026-09-25, replacing the Wails scaffold default. Wails regenerates the per-OS icon (`.icns` on macOS, `.ico` on Windows) from this file during `wails build`, on that OS — a Linux-built binary does not refresh the macOS bundle's `.icns`, so a stale `build/bin/*.app` from an earlier macOS build must be rebuilt on macOS to pick up a new icon.
- No favicon/window-icon override elsewhere in the frontend; the OS-level icon comes only from this file.

## Design Tokens

| Token | Value |
|-------|-------|
| Background | `#1e1e1e` |
| Sidebar | `#252526` |
| Tab bar | `#2d2d2d` |
| Status bar | `#1a1a1a` |
| Accent | `#007ACC` |
| Text / dim | `#d4d4d4` / `#858585` |
| Divider | `#3a3a3a` |
| Title bar height | `--titlebar-height` 44px |
| Title bar background | `#161616` |
| Row height | 28px |
| Font | system UI stack, 13px |

Source: `frontend/src/styles/theme.css`.

## Responsiveness

- Minimum window 800x500, resizable panes. No mobile layout.

## Accessibility

- Target: WCAG AA for text contrast (needs audit). Keyboard focus states need review.

## Connections

- **Parent:** `.specs/architecture/overview.md`
- **Related:** `.specs/areas/desktop-window.md`
