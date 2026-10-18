---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-18
version: 4
connections:
  parent: .specs/modules/shell.md
  children: []
  related_adrs: [0007]
  sync_triggers:
    - Status change
    - Acceptance criteria changes
---

# Task: Title bar menu bar — "Terminal" and "Chats com IA" menus

## Status

`in-progress` — implementado (ver `.specs/tasks/system-menu-terminal-and-ai-chats-plan.md`); falta só verificação manual do usuário (sem ferramenta de automação de GUI nesta sessão, inclusive pra testar as 3 combinações de engines instalados).

## Goal

Turn the title bar's single "Configurações" button into a real menu bar with two new top-level menus, **Terminal** and **Chats com IA**, alongside the existing Configurações entry.

- **Terminal** menu: top item "Novo terminal" (opens a new plain terminal), a separator, then one row per terminal tab currently open in the project — clicking a row focuses that terminal (switches to its dock's active tab, reveals the dock if it's currently collapsed, and focuses the xterm instance).
- **Chats com IA** menu: same shape, but for AI engine sessions (the `claude`/`codex`-tagged terminals from `.specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md`) — **confirmed with the user**:
  - If only one engine (`claude` or `codex`) is installed, the menu's root shows a single direct "Abrir chat" item (no engine submenu — nothing to choose between).
  - If both are installed, the menu's root shows a "Nova sessão" submenu with two entries, "Claude" and "Codex".
  - Either way: separator, then one row per AI-tagged terminal tab currently open in the project, same click-to-focus behavior as the Terminal menu.
  - If neither engine is installed, this entire top-level menu is hidden (consistent with the AI sidebar panel's existing buttons, which already hide per-engine the same way).

## Background

User request, 2026-10-18. Supersedes the explicit scope note in `.specs/tasks/window-menu-and-settings-modal.md` ("Escopo do menu agora: só uma entrada... Outras entradas ficam pra quando houver necessidade real") — that necessity has now arrived. Confirmed with the user: this expands the existing custom title-bar menu button (`TitleBar.tsx`), not a native OS menu or a new location — same ADR-0007 rationale (one consistent custom chrome across Linux/Windows/macOS) that justified the original Configurações-only button.

## Acceptance Criteria

- [x] `TitleBar.tsx` shows three top-level menu entries: **Terminal**, **Chats com IA** (hidden entirely if neither `claude` nor `codex` is installed — reuse `GetInstalledAiEngines`), and the existing **Configurações** (unchanged behavior, still opens `SettingsModal.tsx` directly, no dropdown).
- [x] **Terminal** menu, in order: "Novo terminal" → separator → one row per currently open terminal tab (any dock, including AI-tagged ones — this is the broader/generic terminal list, deliberately overlapping with Chats com IA's narrower AI-only list), each row showing the tab's title ("Terminal N", "Claude", "Codex", or a user-renamed title).
- [x] Clicking "Novo terminal" opens a new plain terminal in the configured default dock (see `.specs/tasks/settings-default-terminal-chat-location.md`).
- [x] Clicking a terminal row: makes that tab active within its own dock (reveal relies on the dock already having ≥1 tab — the clicked tab itself — which `App.tsx`'s existing count-based `display` logic already handles; `setShowTerminal(true)` ensures the whole panel is shown), and moves keyboard focus into that terminal's xterm instance.
- [x] **Chats com IA** menu root:
  - One engine installed → "Chats com IA" isn't a dropdown at all; the menu bar shows a direct "Abrir chat" button at the same first level as Terminal/Configurações (one click starts a fresh session, same "always new, never resume" behavior as the sidebar's new-session buttons) — **amended 2026-10-18 after user feedback on the first version**, which nested "Abrir chat" one level inside a "Chats com IA" dropdown trigger; see "Second Round of Fixes" below. No separator/list in this case (traded off with the user — see that section).
  - Two engines installed → a "Nova sessão" submenu with "Claude" and "Codex" entries, each starting a fresh session for that engine.
- [x] Below that (either case): separator, then one row per terminal tab currently tagged with an `engine` (claude/codex) in this project — same click-to-focus behavior as the Terminal menu's rows.
- [x] Both menus' lists are scoped to the **currently open project/workspace** only (terminals themselves are already workspace-scoped — `Terminal.tsx` only ever holds the current workspace's tabs), and update live since `listTabs()` is called fresh on every `TitleBar` render rather than cached — no stale list possible.
- [x] `Terminal.tsx` exposes the new data/action via the existing `actionRef`/`TerminalHandle` pattern (`listTabs()`, `focusTab(id)`, plus `newTerminal(dock?)`), without duplicating tab state in a second place.
- [x] Verified: `tsc --noEmit`, `vite build`, `go build`/`go vet`/`gofmt` clean (no backend touch needed — `GetInstalledAiEngines` already existed from the previous task). **Manual verification in `wails dev` pending the user** — no GUI-automation tool available here, including testing the 0/1/2-installed-engines variants of the Chats com IA menu.

## Implementation Notes

- `TerminalHandle` (`Terminal.tsx`) gained `listTabs()` (`{id,title,dock,engine?}[]`, called fresh on every render that needs it — no mirrored array) and `focusTab(id)` (sets the tab's dock's active id, then calls `.focus()` on the xterm after the same `[30,120,350]ms` retry delays `scheduleFit` already uses, since the div only becomes `display:block` after the `activeBottomId`/`activeRightId` effect runs). Also added `newTerminal(dock?)` for the Terminal menu's "Novo terminal" item (reuses `addTerminalTab`, defaults to `getDefaultTerminalDock()` if no dock given).
- New generic `frontend/src/components/MenuDropdown.tsx`: flat action list + separator + one level of **inline-expanding** submenu (no floating flyout — simpler to get right in WebKitGTK than nested absolute positioning), closes on outside click or Escape. `TitleBar.tsx` composes it twice (Terminal, Chats com IA) with different `MenuItem[]` data built from `getTerminalTabs()`/`installedAiEngines` props threaded down from `App.tsx`.
- `App.tsx` gained its own `GetInstalledAiEngines()` call (mirroring `AiSessionsPanel.tsx`'s existing one) — judged not worth lifting into shared state for one cheap `PATH` check consumed by two independent components.
- "Reveal the dock if collapsed" ended up not needing new logic: `App.tsx`'s existing `showTerminal && (count > 0 || isDraggingTerminal)` display condition already reveals a dock the moment it has ≥1 tab, and the tab being focused necessarily already exists in that dock — `setShowTerminal(true)` (to reveal the whole panel if it was toggled off) was the only piece actually needed.
- Extracted the `Dock` type (previously private to `Terminal.tsx`) into shared `frontend/src/utils/dock.ts`, consumed by the new `frontend/src/utils/defaultDock.ts` (see `.specs/tasks/settings-default-terminal-chat-location.md`) and by `TitleBar.tsx`/`App.tsx` for the new props' types.
- Verified clean: `tsc --noEmit`, `vite build`, `go build`/`go vet`/`gofmt -l .` (no Go changes needed — `GetInstalledAiEngines` already shipped in the prior task).
- **Not verified by this assistant**: actually opening each menu in `wails dev`, confirming the Chats com IA menu's root shape with 0/1/2 engines really installed, confirming click-to-focus visually reveals/switches/focuses correctly. No GUI-automation tool available in this session.

## Fixes After User Review (2026-10-18, same day)

User reported 3 issues after trying the above:

1. **"A engrenagem deve ser o primeiro item do menu, sempre"** — fixed: reordered `TitleBar.tsx`'s JSX so Configurações renders first, then Terminal, then Chats com IA (was Terminal/Chats-IA/Configurações, just an artifact of write order, not a deliberate choice).
2. **"O abrir chat não ficou na raiz, mesmo tendo apenas claude"** — investigated, code not changed: `installedAiEngines.length === 1` → direct "Abrir chat" item is the existing, correct logic. Confirmed on this machine that `which claude` resolves (`/home/carlos/.local/bin/claude`) and `which codex` does not — so `GetInstalledAiEngines` should return exactly `["claude"]` and the direct-item branch should fire. Likely explanation: a stale `wails dev`/Vite HMR state after the structural `TitleBar.tsx`/`MenuDropdown.tsx` changes (new component, not just an edit to existing JSX — Fast Refresh doesn't always recover cleanly from that). **Needs the user to fully restart `wails dev`** (not just save-triggered reload) and recheck; if it still shows the submenu after a clean restart, that's a real signal the PATH the running Cortex process sees differs from this shell's, worth investigating separately.
3. **"Os terminais abertos não são listados quando a app abre com eles já abertos"** — **real bug found, not cosmetic, and it retroactively explains the earlier "Claude session doesn't seem to resume on reopen" report too**: `App.tsx`'s `showTerminal` state has initialized to a hardcoded `false` since the project's very first commit, even though `bcode.terminalVisible` was already being written to `localStorage` on every change — nothing ever read it back. Since `Terminal.tsx` only mounts (`terminalMounted`) once `showTerminal` becomes `true` for the first time, it never mounted automatically on a fresh launch — so `listTabs()` had nothing to list, and (more importantly) the whole restore-on-mount chain from `.specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md` (including AI session auto-resume) never got a chance to run until the user manually opened the terminal panel each session. Fixed: `showTerminal` now initializes from `localStorage.getItem('bcode.terminalVisible') === '1'`. If the panel was visible when the app last closed, it reopens visible automatically, which mounts `Terminal.tsx` and runs the full restore chain without waiting for a click.

Verified clean again after these 3 fixes: `tsc --noEmit`, `vite build`. Fix #3 in particular needs the user's confirmation with a real close/reopen cycle (while the panel was left open) — still no GUI-automation tool available here.

## Second Round of Fixes (2026-10-18, same day — screenshot)

User sent a screenshot showing "Abrir chat" rendered *inside* the "Chats com IA" dropdown (one extra click to reveal it) and clarified: with only one AI engine installed, "Abrir chat" must be at the **first level of the menu bar itself** — a direct, one-click button, not nested behind a dropdown trigger at all. **Confirmed trade-off with the user**: this means dropping the separator+list-of-open-chats display for the single-engine case (there's no dropdown left to put it in) — acceptable, since the Terminal menu's own list already includes every AI-tagged terminal tab too (deliberately overlapping, see this task's original acceptance criteria).

- **One engine installed**: "Chats com IA" dropdown trigger is gone entirely. In its place, a plain `app-titlebar-menu-btn` labeled "Abrir chat" (same style as the Terminal/Chats com IA dropdown triggers, but a direct action — `onClick={() => onNewAiChat(installedAiEngines[0])}`, no `MenuDropdown` wrapper).
- **Two engines installed**: unchanged — `MenuDropdown` with a "Nova sessão" submenu (Claude/Codex) + separator + list of AI-tagged tabs.
- **Zero engines**: unchanged, nothing renders.

Verified clean: `tsc --noEmit`, `vite build`.

## Affected Modules

- `shell` (primary — `TitleBar.tsx` menu bar, new dropdown/submenu component)
- `terminal` (primary — expose tab list + focus action beyond today's count-only reporting)
- `ai-sessions` (installed-engines check already exists, `GetInstalledAiEngines`; new-session command-building already exists, `frontend/src/utils/aiEngines.ts`)

## Out of Scope

- Any other menu entries (File/Edit/View/Help) — still not a full menu bar, just these two plus Configurações.
- Reordering/renaming terminal tabs from the menu (that already exists via the terminal panel's own right-click, unaffected).
- The AI sidebar panel's own new-session buttons and "Abrir" — unchanged, this task adds a second, equivalent entry point in the title bar, not a replacement.

## Next Step

Run `bsdd plan` (can bundle with `.specs/tasks/activity-bar-terminal-icon-footer.md` and `.specs/tasks/settings-default-terminal-chat-location.md`, filed the same day from the same user request, or plan separately — execution-model question for `bsdd plan`).
