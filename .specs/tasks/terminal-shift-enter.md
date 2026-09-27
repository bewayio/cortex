---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: [0004]
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Shift+Enter inserts a newline in Claude and Codex

## Status

in-progress

## Goal

In the integrated terminal, Shift+Enter inserts a new line in the Claude CLI and the Codex CLI prompts. It must not submit the prompt.

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Module specs: `.specs/modules/terminal.md`
- ADRs: `.specs/adrs/0004-pty-terminal.md`

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries are known (terminal frontend only)
- [x] Related ADRs reviewed
- [x] Security implications identified (none)

## Acceptance Criteria

1. Shift+Enter in `claude` inserts a newline and does not send the message.
2. Shift+Enter in `codex` inserts a newline and does not send the message.
3. Plain Enter still submits in both, and still runs the command in a normal shell.
4. Each Shift+Enter sends exactly one newline to the PTY. No extra carriage return.
5. Works on Linux, Windows and macOS, since it lives in the xterm.js layer.

## Implementation Notes

- **Finding:** `Terminal.tsx` already has a custom key handler that sends `\n` for Shift+Enter. It returns `false` only for `keydown`. xterm.js 5.5 also calls the handler on `keypress`, where it returns `true`, so xterm sends `\r` after the `\n`. The CLI sees a newline and then Enter, which submits. This is the likely cause. Confirm by logging PTY input before changing anything.
- Planned fix: in the handler, return `false` for every event type (`keydown`, `keypress`, `keyup`) when the key is Enter with Shift and no Ctrl, Alt or Meta. Send the newline once, on `keydown`.
- Byte to send: `\n` (Ctrl+J). Both Claude Code and Codex read it as "new line in prompt". Alternative if a CLI ignores it: `ESC` + `\r` for Claude. Decide during verification, keep it in one constant.
- Not planned: the kitty keyboard protocol. It is a large change and not needed for this goal.
- Touch point: `frontend/src/components/Terminal.tsx` (`attachCustomKeyEventHandler`). Do not edit `frontend/wailsjs`.
- Plan: `docs/plans/2026-09-21_terminal-plain-and-shift-enter.md`. Next command: `bsdd start`.

## Definition Of Done

- [ ] Acceptance criteria met
- [ ] Verified in `claude` and `codex` inside the app
- [ ] `terminal.md` updated
- [ ] Sync Review completed if source docs changed
