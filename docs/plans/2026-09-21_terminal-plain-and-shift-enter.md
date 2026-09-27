# Plan: Plain terminal only and Shift+Enter

- Tasks: `.specs/tasks/terminal-plain-only.md`, `.specs/tasks/terminal-shift-enter.md`
- ADRs: 0003, 0004 (no new ADR)
- Execution model: **single agent**, phases in sequence
- Status: in-progress

## Goal

The terminal panel creates only plain terminals. Shift+Enter inserts a newline in Claude and Codex without submitting.

## Definition of Ready

- [x] Both tasks have specs, criteria and reviewed ADRs
- [x] Only the terminal frontend is touched
- [x] No security impact

## Phases

| # | Phase | Task | Size | Depends on |
|---|-------|------|------|------------|
| 1 | Confirm the Shift+Enter cause | shift-enter | S | none |
| 2 | Fix the key handler | shift-enter | S | 1 |
| 3 | Remove the Claude option and chat tabs | plain-only | M | none |
| 4 | Verify | both | M | 2, 3 |
| 5 | Docs and finish | both | S | 4 |

Phases 2 and 3 edit the same file. Do 3 first if a merge is a concern, otherwise in order.

### Phase 1: confirm the cause

- [x] (skipped, cause confirmed from xterm 5.5 source `_keyPress`) Temporarily log each `TerminalInput` payload for Shift+Enter with `console.log` (JSON of the string).
- [ ] Run `wails dev`, press Shift+Enter in `claude`. Expect `"\n"` followed by `"\r"`.
- [ ] If the second payload is not there, stop and re-diagnose (the CLI may not read `\n` as newline). Try `ESC` + `\r` for Claude.
- [ ] Remove the logging.

### Phase 2: fix the key handler

- [x] In `Terminal.tsx`, `attachCustomKeyEventHandler`: match Enter with `shiftKey` and no `ctrlKey`, `altKey`, `metaKey`.
- [x] For a match, return `false` on `keydown`, `keypress` and `keyup`. Send the newline only on `keydown`, through one named constant.
- [x] All other keys return `true` as before.

### Phase 3: remove the Claude option

- [x] Keep the existing `+` button that calls `addTerminalTab()`. Remove the dropdown arrow button next to it and the split wrapper if it has no other use.
- [x] Delete `addChatTab`, the menu state (`showAddMenu`, `menuAnchor`), the global mousedown closer that only served the menu, and the menu markup.
- [x] Delete the chat panel render, the `ClaudeChatPanel` import, `updateChatMessages`, `saveChatTitle` and the Sparkles and chat tab styling in the tab bar.
- [x] Restore paths (both places): skip saved tabs of type `chat`. If none remains, create one plain terminal. Keep tolerating the old `type` field in stored JSON.
- [x] Narrow `TermTab.type` only if nothing else needs `'chat'`. Otherwise keep the stored type for parsing.
- [x] Remove `.terminal-add-menu*`, `.terminal-add-arrow*`, `.terminal-add-split` (if unused) and `.terminal-tab.chat*` CSS. Drop the `Sparkles` and `TerminalSquare` imports if unused.
- [x] Do not touch `ClaudeChatPanel.tsx`, backend chat methods, `~/.bcode/chats`, or `frontend/wailsjs`.

### Phase 4: verify

- [x] `npm run build` in `frontend` passes (includes type check). Fix unused import or variable errors.
- [ ] Manual, `wails dev` on Linux:
  - add button creates a terminal at once, no menu
  - restart with an old saved config that has a chat tab: app opens, chat tab is gone, terminals restore
  - Shift+Enter in `claude`: newline, no submit
  - Shift+Enter in `codex`: newline, no submit
  - Enter submits in both and runs commands in a plain shell
  - closing, renaming and dragging tabs still work
- [ ] Windows and macOS: same checks if a machine is available, otherwise report as not verified.

### Phase 5: docs and finish

- [ ] `.specs/modules/terminal.md`: drop "Planned" notes, describe the handler and the single tab type.
- [ ] `.specs/modules/chat.md` and `.specs/areas/desktop-window.md`: state that there is no UI entry point.
- [ ] `docs/frontend.md`: add the terminal key handling rule (block all event types for handled keys).
- [ ] `bsdd finish` for both tasks. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| CLI ignores `\n` | Shift+Enter still submits or does nothing | Phase 1 test, fall back to `ESC` + `\r` |
| Old saved tabs with `chat` type | Crash or blank tab on restore | Skip them, covered by phase 4 check |
| Editing one large file in two tasks | Merge slips | Sequential phases, build after each |
| Unused chat code left behind | Dead code | Recorded in `chat.md`, removal is a separate task |
| No automated frontend tests | Regressions unseen | Manual checklist, keep the change small |

## Definition of Done

Per each task file, plus the manual checklist recorded before `done`.
