---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-10-02
version: 6
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: [0003, 0004, 0008]
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: terminal

## Purpose

Run interactive shell sessions in a pseudo terminal and stream them to xterm.js.

## Boundaries

- Owns: live PTY sessions (memory), terminal tab names (localStorage `bcode.termtabs.*`), and (`planned`) each terminal tab's own dock assignment (`bottom` | `right`)
- Does NOT own: workspace persistence, the dock *regions'* layout (height/width, collapse-when-empty) — that stays `shell`'s

## Public Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| StartTerminal | workdir | id | Starts `$SHELL` (fallback `/bin/zsh`) in a PTY |
| TerminalInput | id, data | error | Write to PTY |
| TerminalResize | id, rows, cols | error | Resize |
| CloseTerminal | id | error | Kill and close |

## Events Published

| Event | Payload | When |
|-------|---------|------|
| terminal:data:{id} | base64 bytes | PTY output |
| terminal:exit:{id} | none | Shell exited |

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| creack/pty | library | `pty.Start` |

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local |

## Security

- Runs arbitrary commands as the OS user by design.

## Notes

- Frontend: `Terminal.tsx` (docks bottom or right, mounted once and hidden with `display:none`).
- **Shipped 2026-10-01, user request — per-tab dock, drag to move, both docks open together.** Replaces the single global dock toggle (`terminalDock` button, one dock for the whole panel) with a per-terminal-tab dock: each terminal independently lives in the bottom panel or the right sidebar, moved by dragging its tab (same mouse-based drag convention as `EditorTabBar.tsx`, not HTML5 DnD) onto the destination zone and dropping. Both docks can hold terminals at the same time — `Terminal.tsx`'s single internal tab list splits into two groups (bottom tabs, right tabs), each rendered by its own dock region. The dock-toggle icon button (`terminal-dock-btn`, `onToggleDock`) is removed entirely. Layout consequence (owned by `shell`, see `shell.md`): the right dock is now a true full-height sidebar region, sibling to the left Explorer/Git sidebar and the editor area — not nested inside the editor area's row as before — so bottom-docked terminals naturally stop short of it instead of running underneath. Implementation: `Terminal.tsx` renders both dock panels via `createPortal` into two container `<div>`s App.tsx always keeps mounted (so the xterm divs can be moved between docks — `wrapper.appendChild(div)` — without ever recreating the terminal); each dock tracks its own `activeId`; cross-dock drop detection hit-tests the dragged pointer against the *other* dock's panel bounding rect (not just its tab bar) during the same mouse-based drag already used for in-dock reordering. An empty dock is revealed as a temporary min-size "ghost" drop zone (dashed outline + placeholder text) for the duration of any terminal drag, otherwise there'd be no way to populate an empty dock in the first place. Task: `.specs/tasks/terminal-drag-to-dock.md`.
- **Fixed 2026-10-02, user report (screenshot) — scroll travado ao redimensionar a janela.** Resizing the app window (not the terminal panel's own drag handle) never called `fitAddon.fit()` — only the explicit `bottomHeight`/`rightWidth` prop changes (from dragging the terminal's own resize handle) did. xterm.js kept thinking it had the old size, so its internal scroll stayed pinned to the old row count, cutting off the most recent lines (reported with a `claude` CLI session running in the right-docked terminal, long enough output to need scrolling). Fixed with a `ResizeObserver` on each dock's content wrapper, refitting that dock's active tab on any size change regardless of cause — covers window resize and any other layout change (e.g. the left sidebar being resized), not just the two already-handled cases.
- Planned: the panel creates plain terminals only. The "Claude" chat tab option is removed. Claude and Codex run as CLIs in a normal terminal. Task: `.specs/tasks/terminal-plain-only.md`.
- Planned: Shift+Enter sends one `\n` and xterm must not also send `\r`. Today the key handler blocks only `keydown`, so `keypress` still sends `\r`. Task: `.specs/tasks/terminal-shift-enter.md`.
- Gap: Windows needs a different shell and PTY (ConPTY). Not verified.
- Ctrl+V for image paste is intentionally left untouched (ADR-0008, resolved 2026-09-25). xterm.js's default key handling already sends `0x16` for Ctrl+V when no custom handler intercepts it; `claude`/`codex` read the OS clipboard themselves from that byte, exactly like in a native terminal. Two custom implementations (an explicit `0x16` sender, then a browser-`paste`-event temp-file writer) were built and removed — neither was needed, and the second one's DOM `paste` event never even fired in this app's WebKitGTK build. **Do not re-add custom Ctrl+V handling** without first checking whether the real cause of a report is a missing system clipboard tool (`wl-clipboard`/`xclip` on Linux). **Confirmed working** on Linux once `wl-clipboard` is installed. Bundling `wl-paste`/`xclip` inside BCode to avoid that manual install was found technically workable but rejected — `xclip` (GPLv2) and `wl-clipboard` (GPLv3) would obligate BCode to ship their license texts and source availability. Task: `.specs/tasks/terminal-image-paste.md`.
- **Implementado 2026-10-14, pedido do usuário — links clicáveis (Ctrl/Cmd+click) na saída do terminal.** `Terminal.tsx` ganhou `registerTerminalLinkProvider` (um `xterm.registerLinkProvider` por instância de `XTerm`, chamado dentro de `createTerminal` — todo dock/aba nova já herda, sem código extra por dock). `provideLinks` roda duas regex por linha do buffer (`TERMINAL_URL_REGEX` pra `http(s)://`, `TERMINAL_ABS_PATH_REGEX` pra caminho absoluto `/...`/`~/...`/`C:\...`) — um match de URL exclui o mesmo trecho de virar link de arquivo também (a barra depois de `http:` bate nas duas regex). `ILink.activate` só age se `event.ctrlKey`/`event.metaKey` (via `platformRef` já existente) estiver pressionado — sem o modificador, não faz nada, preserva a seleção normal de texto do xterm. Link `http(s)://` chama `BrowserOpenURL`; caminho de arquivo chama `ReadFile`+`openOrFocusTab` (`openFilePathAsTab`, mesmos campos do `openFile` da sidebar), falha silenciosa se o arquivo não existir. **Não** revela no gerenciador de arquivos do SO (`RevealInFinder` é outra coisa, só funciona no macOS hoje, gap já documentado em `files.md`). Confirmado com o usuário: caminho **relativo** fica fora de escopo — `workdirRef` só guarda a pasta em que o terminal foi aberto, não acompanha o cwd ao vivo depois de um `cd`. Task: `.specs/tasks/terminal-clickable-links.md`.
