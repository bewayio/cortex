---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-18
version: 2
connections:
  parent: .specs/tasks/system-menu-terminal-and-ai-chats.md
  children: []
  related_adrs: [0007]
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: ActivityBar footer icon + title bar menu bar (Terminal / Chats com IA) + default-dock preset

## Linked Tasks

Bundled into one plan (shared "default dock" surface, same user request, 2026-10-18):

- `.specs/tasks/activity-bar-terminal-icon-footer.md` → `planned`
- `.specs/tasks/system-menu-terminal-and-ai-chats.md` → `planned`
- `.specs/tasks/settings-default-terminal-chat-location.md` → `planned`

## Execution Model

**Single agent.** Confirmed with the user. Concentrated in a known set of frontend files (`ActivityBar.tsx`, `SettingsModal.tsx`, `TitleBar.tsx`, `Terminal.tsx`, `AiSessionsPanel.tsx`, `App.tsx`) — no independent parallel surface.

## Definition of Ready — confirmed

- Project DNA, architecture overview, `.specs/modules/shell.md`, `.specs/modules/terminal.md`, `.specs/modules/ai-sessions.md` read.
- All three tasks linked and testable; the shared dependency (default-dock preference must exist before the title bar menu's "new" actions can use it) is sequenced below, not left ambiguous.
- No blocking tasks pending.

## Current State (read from code)

- `ActivityBar.tsx`: one flat top-aligned flex column, 5 buttons in order: AI Sessions, Explorer, Git, Database, Terminal. `.activity-bar` / `.activity-bar-btn` in `components.css`.
- `SettingsModal.tsx`: two-column layout (`settings-modal-nav` / `settings-modal-content`), one section today (`language`, a `SectionId` union type + `sections` array + radio-style `.settings-modal-option` rows). Adding a section is additive — extend the union, push to the array, add a content branch.
- `TitleBar.tsx`: single direct-action button (`onOpenSettings`), no dropdown/menu mechanics exist anywhere in this app's custom chrome yet — this plan introduces the first one.
- `Terminal.tsx`: reports only per-dock **counts** upward (`onTabCountChange(dock, n)`); `TerminalHandle` only has `openWithCommand`. No way today for `App.tsx`/`TitleBar.tsx` to read the actual tab list (id/title/dock/engine) or to focus a specific tab by id.
- Default dock is hardcoded per call site today: `Terminal.tsx`'s own "+" button → `'bottom'` (via `addTerminalTab`'s default param); `AiSessionsPanel.tsx`'s new-session buttons and "Abrir", wired through `App.tsx`'s `openSessionTerminal` → `'right'` (shipped in `.specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md`).
- `App.tsx` already tracks `bottomTermCount`/`rightTermCount` and the dock-revealing logic (`showTerminal && (count > 0 || isDraggingTerminal)`) — focusing a tab in a currently-collapsed dock can reuse this existing reveal mechanism once that dock's count is ≥1 (it already is, if the tab exists).

## Phases

### Phase 1 — ActivityBar: Terminal icon to the footer (S)

- `ActivityBar.tsx`: wrap AI Sessions/Explorer/Git/Database in one group, Terminal in a second group; CSS: either `margin-top: auto` on the Terminal button alone, or `justify-content: space-between` on `.activity-bar` with two inner flex groups — pick whichever is the smaller diff.
- No behavior change (`onToggleTerminal` unchanged).
- Independent of every other phase — can land first and separately verified.
- Dependency: none.

### Phase 2 — Settings: default-dock preset preference (S)

- New `localStorage` key, e.g. `bcode.defaultDockPreset` (`'terminal-bottom-chat-right' | 'terminal-right-chat-bottom'`), default `'terminal-bottom-chat-right'` (matches today's de facto behavior — plain terminals already default bottom, AI chats already default right).
- Small shared helper (e.g. `frontend/src/utils/defaultDock.ts`): `getDefaultDockPreset()`, `setDefaultDockPreset(preset)`, `getDefaultTerminalDock()`, `getDefaultChatDock()` — same shape as `i18n.ts`'s `getCurrentLanguage`/`setLanguage` pair, so `SettingsModal.tsx`'s new section can follow the exact same read/write/re-render pattern as the existing Idioma section.
- `SettingsModal.tsx`: extend `SectionId`, push a new nav entry, add a content branch with the two presets as radio-style options (reuse `.settings-modal-option`/`.settings-modal-option-radio`, no new CSS needed beyond perhaps a short description line per option).
- Dependency: none (can run in parallel with Phase 1, before Phase 3).

### Phase 3 — Centralize default-dock usage across existing call sites (S/M)

- `Terminal.tsx`'s own "+" button: reads `getDefaultTerminalDock()` instead of the hardcoded `'bottom'` default on `addTerminalTab`.
- `App.tsx`'s `openSessionTerminal` (AI sidebar's new-session/"Abrir" flow): reads `getDefaultChatDock()` instead of the hardcoded `'right'`.
- No change to per-tab drag-to-dock (`terminal-drag-to-dock.md`) — this only changes the *initial* dock of a freshly created tab, confirmed scope.
- Dependency: Phase 2 (the helper must exist).

### Phase 4 — Terminal.tsx: expose full tab list + focus-by-id action (M)

- Widen what `Terminal.tsx` reports upward: either broaden `onTabCountChange` into a richer `onTabsChange(dock, tabs: {id, title, engine?}[])`-style callback, or add a `listTabs(): {id, title, dock, engine?}[]` method to `TerminalHandle` that `App.tsx`/`TitleBar.tsx` can call when building the menu (called on menu open, not held in duplicated state — avoids a second source of truth per the task's explicit requirement).
- Add `focusTab(id: string)` to `TerminalHandle`: finds the tab, sets that dock's `activeBottomId`/`activeRightId`, ensures `terminalMounted`/`showTerminal` are true (same pending-command pattern already used for `openWithCommand` when the terminal isn't mounted yet — see `App.tsx`'s `pendingTerminalCommandRef`), and calls `.focus()` on the tab's `xterm` instance after its div is shown.
- Dependency: none technically (independent of Phases 1–3), but needed before Phases 6–7 can wire real menu contents.

### Phase 5 — TitleBar: generic menu-bar / dropdown + nested-submenu component (M)

- No existing component to extend — build a small, generic dropdown primitive (open on click, close on outside-click or Escape, basic arrow-key navigation optional/nice-to-have) that supports: a flat list of action items, a separator, and one level of nested submenu (needed for "Nova sessão" → Claude/Codex). Keep it generic/reusable rather than hardcoding Terminal/Chats-specific markup into one giant component — `TitleBar.tsx` composes it twice with different data.
- Visual style consistent with existing overlay/menu patterns in the app (`CommandPalette.tsx`'s overlay for broad visual language; this is a smaller anchored dropdown, not a full-screen overlay).
- Dependency: none technically, but no reason to build it before deciding what it needs to render — sequenced after Phase 4 so its data shape is already known.

### Phase 6 — Wire the "Terminal" menu (S)

- Root: "Novo terminal" (calls the same action as the panel's "+", using Phase 3's default-dock preference) → separator → one row per tab from Phase 4's `listTabs()` (any dock, any engine) → click calls `focusTab(id)`.
- Hidden/disabled state: none needed — always show "Novo terminal"; the list section is simply empty if no terminals are open (no empty-state copy specified by the user — default to omitting the separator and list entirely when there are zero terminals, matching the "Chats com IA" menu's analogous empty case in Phase 7).
- Dependency: Phases 3, 4, 5.

### Phase 7 — Wire the "Chats com IA" menu (S/M)

- Entire top-level menu hidden if `GetInstalledAiEngines()` (already exists, `ai-sessions.md`) returns empty.
- Root, per the user's confirmed structure: one engine installed → direct "Abrir chat" item; two installed → "Nova sessão" submenu with "Claude"/"Codex" entries. Both start a fresh session (`buildAiCommand(engine)`, no `sessionId` — same "always new" semantics as the sidebar buttons), using Phase 3's default **chat** dock.
- Separator, then one row per tab from Phase 4's `listTabs()` filtered to `engine` set (claude/codex) → click calls `focusTab(id)` (same action as Phase 6, just a filtered list).
- Dependency: Phases 3, 4, 5.

### Phase 8 — Manual verification (S)

- No automated UI test harness in this project — verify by hand in `wails dev`:
  - ActivityBar: Terminal icon at the bottom, others grouped at top, same click behavior.
  - Settings: pick each preset, open a new plain terminal and a new AI chat after each, confirm docks match the preset; confirm already-open tabs don't move; confirm dragging a tab still works regardless of preset.
  - Terminal menu: "Novo terminal" opens in the preset's terminal dock; list shows every open terminal (plain and AI); clicking one reveals its dock if collapsed and focuses it.
  - Chats com IA menu: test with only `claude` on `PATH`, only `codex`, and both (if feasible) — confirm the root item/submenu shape matches each case; confirm the menu disappears entirely with neither installed; list shows only engine-tagged tabs; click-to-focus works.
- Dependency: Phases 1–7.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1 — ActivityBar footer icon | S |
| 2 — Default-dock preset preference | S |
| 3 — Centralize default-dock usage | S/M |
| 4 — Terminal.tsx tab list + focus action | M |
| 5 — Generic menu-bar/dropdown component | M |
| 6 — Wire Terminal menu | S |
| 7 — Wire Chats com IA menu | S/M |
| 8 — Manual verification | S |

## Risks / Open Items Carried Into Implementation

- Phase 5's dropdown component is new UI infrastructure with no existing pattern in this codebase to copy — expect some judgment calls on exact interaction details (hover vs. click to open submenu, keyboard nav depth) not pinned down by the user; default to the simplest click-based interaction unless it feels wrong once built.
- Phase 6's empty-state choice (omit separator+list when zero terminals exist) is this plan's own default, not explicitly specified by the user — flagged for confirmation during/after implementation.
- No automated test harness for this desktop app; Phase 8 is manual and needs the user, same limitation already documented on every other UI task in this project.

## Execution Log

- Phases 1–7 implemented 2026-10-18 (single agent, as planned), in the order written. Phase 5's dropdown ended up as a click-to-open, inline-expanding submenu (no floating flyout) — the simplest option, as anticipated in Risks above; not revisited, felt right once built.
- Phase 6's empty-state default (omit separator+list with zero terminals) was kept as the plan's own call — not separately re-confirmed with the user.
- "Reveal the dock if collapsed" (part of Phase 6/7's acceptance criteria) needed no new code: `App.tsx`'s existing count-based `display` logic already reveals a dock the instant it has ≥1 tab, and a focused tab always already exists in its dock — only `setShowTerminal(true)` was needed to reveal the whole panel.
- Phase 8 (manual verification) not run by this assistant — no GUI-automation tool available, and this phase specifically needs testing 3 engine-installed variants (0/1/2) that depend on the user's actual machine. `gofmt`, `go vet`, `tsc --noEmit`, and `vite build` all pass clean across every phase.
- **Post-review fixes, same day**: user caught 3 issues after trying the build. Gear-first ordering and the real `showTerminal`-never-reads-localStorage bug (which also explains the prior session's "Claude doesn't resume on reopen" report) are fixed — see `.specs/tasks/system-menu-terminal-and-ai-chats.md`'s "Fixes After User Review" section for full detail. The third ("abrir chat" not at root with 1 engine) was investigated but the code was left as-is since the logic is already correct for this machine's actual PATH (`claude` found, `codex` not) — flagged back to the user to confirm after a full `wails dev` restart rather than guessed at.
