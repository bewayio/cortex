# Plan: Terminal accepts pasting an in-memory image

- Task: `.specs/tasks/terminal-image-paste.md`
- ADR: `.specs/adrs/0008-terminal-raw-paste-passthrough.md` (accepted, verification pending)
- Execution model: **single agent**, phases in sequence
- Status: in-progress

## Goal

Ctrl+V in the integrated terminal sends the raw control byte `0x16` to the PTY, so `claude`/`codex` running inside can read an in-memory clipboard image themselves, instead of xterm.js swallowing the paste as text-only.

## Definition of Ready

- [x] Spec, criteria and ADR are current
- [x] Only the terminal frontend is touched
- [x] No security impact beyond the existing "runs arbitrary commands" note
- [x] Known risk: depends on undocumented `claude`/`codex` clipboard behavior; verification is part of Definition of Done, not optional

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | Add the Ctrl+V branch to the key handler | S | none |
| 2 | Verify against real `claude` | M | 1 |
| 3 | Verify against real `codex` | M | 1 |
| 4 | Decide outcome and update docs | S | 2, 3 |

### Phase 1: key handler

- [x] In `frontend/src/components/Terminal.tsx`, extend the existing `attachCustomKeyEventHandler` (the one that already handles Shift+Enter) with a second branch:
  - Match: `key === 'v'` (case-insensitive) with `ctrlKey` true, `altKey`/`shiftKey` false. Leave `metaKey` (Cmd+V on macOS) untouched for now, per the task's note — do not generalize to Cmd+V without deciding that separately.
  - On `keydown` for a match: `e.preventDefault()`, send `'\x16'` via `TerminalInput`, return `false`.
  - Return `false` for `keypress`/`keyup` too, same pattern used for Shift+Enter, so xterm's own paste handler and the browser's native paste never also fire for this combination.
  - Name the byte as a constant next to `SHIFT_ENTER_INPUT` (e.g. `CTRL_V_INPUT = '\x16'`), not inline, for readability.
- [x] `npm run build` in `frontend` passes.

### Phase 2: verify against `claude`

- [ ] `wails dev` on Linux. Open a terminal tab, run `claude`.
- [ ] Take a screenshot (or otherwise put an image only in the OS clipboard, not saved to a file).
- [ ] Press Ctrl+V inside the `claude` prompt. Record what happens: does `claude` pick up the image, show nothing, print `^V` literally, or error?
- [ ] Repeat with only text on the clipboard (Ctrl+V should paste text normally through whatever `claude` does with `0x16` plus its own input handling, or fall through to typed text if `claude` doesn't intercept `^V` — record actual behavior).
- [ ] Note the OS clipboard tool available in this sandbox (`xclip`/`wl-paste`) so a negative result can be attributed correctly (missing tool vs. `claude` not implementing this).

### Phase 3: verify against `codex`

- [ ] Same steps as phase 2, with `codex` instead of `claude`.

### Phase 4: decide and update docs

- [ ] If both criteria 1 and 2 from the task pass: update `.specs/modules/terminal.md` (drop "Planned"), update ADR-0008 status line from "verification pending" to "Verified" with the date and what was tested, `bsdd finish` the task.
- [ ] If either fails: do not mark the task done. Update ADR-0008's status to record the negative finding (which OS, which CLI, what was observed) and propose returning to `bsdd new`/`bsdd plan` for the temp-file fallback documented as the rejected alternative in ADR-0008. Ask the user before starting that fallback.
- [ ] Either way, update `docs/frontend.md` with the final Ctrl+V behavior (or its removal, if the fallback replaces it).

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `claude`/`codex` don't read `0x16` from stdin for clipboard image | Feature does nothing, criteria 1/2 fail | Phase 2/3 catches this before `bsdd finish`; fallback documented in ADR-0008 |
| No clipboard image tool installed in the test environment (`xclip`/`wl-paste`) | False negative, looks like the CLI doesn't support it when the OS/sandbox does | Note the tool's presence explicitly during verification |
| Generalizing to Cmd+V on macOS without checking native paste conventions | Breaks the OS-level Edit > Paste shortcut users expect on macOS | Task explicitly scopes phase 1 to Ctrl+V only, macOS decided separately |
| A plain shell (no `claude`/`codex` running) receives literal `^V` | Minor surprise typing `^V` in bash | Accepted in ADR-0008 as a known limitation, not blocking |

## Definition of Done

Per `.specs/tasks/terminal-image-paste.md`. The task cannot be marked done without phase 2 and 3 results, even if the code change itself is trivial.
