---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: [0003, 0004]
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Terminal panel offers only the plain terminal

## Status

in-progress

## Goal

Remove the "Claude" chat option from the terminal panel. The only tab type a user can create is the normal shell terminal. Claude and Codex run as CLIs inside that terminal.

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Architecture: `.specs/architecture/overview.md`
- Module specs: `.specs/modules/terminal.md`, `.specs/modules/chat.md`
- Area: `.specs/areas/desktop-window.md`
- ADRs: `.specs/adrs/0003-claude-cli-with-sdk-fallback.md`, `.specs/adrs/0004-pty-terminal.md`

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries are known (terminal frontend, chat entry point)
- [x] Related ADRs reviewed
- [x] Security implications identified (none)

## Acceptance Criteria

1. The add button in the terminal tab bar creates a plain terminal directly. No dropdown menu and no "Claude" entry.
2. No code path creates a `chat` tab (`addChatTab` and its menu item are gone).
3. Saved tab configs that contain `chat` tabs (`bcode.termtabs.*`) load without error. The chat tabs are skipped, plain terminals restore as before. If nothing is left, one plain terminal is created.
4. Files in `~/.bcode/chats` are not touched or deleted (restriction 3).
5. No visible leftover: no Sparkles icon, no chat tab style, no unused menu state or CSS for the add menu.

## Implementation Notes

- Touch points: `frontend/src/components/Terminal.tsx` (add menu, `addChatTab`, restore at two places, chat panel render), `frontend/src/styles/components.css` (`terminal-add-menu*`).
- After this change the chat module has no entry point. `ClaudeChatPanel.tsx` and the backend chat methods become unused. Removing them is out of scope here. It needs its own task and would supersede ADR-0003.
- Keep the change to the terminal panel. Do not edit `frontend/wailsjs`.
- No Inbox/Outbox, no migrations.
- Plan: `docs/plans/2026-09-21_terminal-plain-and-shift-enter.md`. Next command: `bsdd start`.

## Definition Of Done

- [ ] Acceptance criteria met
- [ ] Verified by running the app (new tab, restart with old saved chat tab)
- [ ] `terminal.md`, `chat.md`, `desktop-window.md` updated
- [ ] Sync Review completed if source docs changed
