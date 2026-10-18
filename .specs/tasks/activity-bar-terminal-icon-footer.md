---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-18
version: 2
connections:
  parent: .specs/modules/shell.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Acceptance criteria changes
---

# Task: Move the Terminal icon to the bottom of the ActivityBar

## Status

`in-progress` — implementado; falta só verificação manual do usuário (sem ferramenta de automação de GUI nesta sessão).

## Goal

In `ActivityBar.tsx`, the Terminal icon moves to the **footer** (bottom) of the bar; the other icons (AI Sessions, Explorer, Git, Database) stay grouped at the **top**, in their current order.

## Background

User request, 2026-10-18. Today `ActivityBar.tsx` renders all 5 buttons in one top-aligned flex column (AI Sessions, Explorer, Git, Database, Terminal, in that literal order — see `.specs/modules/shell.md`'s 2026-10-12 note, "a barra volta a ter só Explorer, Git, Database e Terminal" plus the AI Sessions icon added after). The request only reorders/repositions Terminal visually — it does not change what clicking it does (`onToggleTerminal`, toggles `showTerminal` in `App.tsx`).

## Acceptance Criteria

- [x] AI Sessions, Explorer, Git, Database buttons render as a top-aligned group, unchanged order and unchanged behavior.
- [x] Terminal button renders at the bottom of the bar — implemented with `margin-top: auto` via a new `activity-bar-footer-btn` class, kept `.activity-bar`'s existing flex-column layout untouched.
- [x] No change to click behavior, icons, tooltips/`title`, or the Git badge.
- [ ] Verify visually in `wails dev` — no automated UI test harness in this project. **Pending the user.**

## Affected Modules

- `shell` (`ActivityBar.tsx`, `components.css`'s `.activity-bar`/`.activity-bar-btn`)

## Out of Scope

- Changing which panel/action each icon triggers.
- Adding new icons.

## Next Step

Small enough to fold into the same plan as the other two tasks filed alongside it today (system menu, settings default-dock) — see `.specs/tasks/system-menu-terminal-and-ai-chats.md`'s plan once written, or run standalone via `bsdd plan`.
