---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-10-22
version: 11
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

- Owns: live PTY sessions (memory), terminal tab names (localStorage `bcode.termtabs.*`), each terminal tab's own dock assignment (`bottom` | `right`), and (since 2026-10-17) an optional `engine`/`sessionId` tag per tab used to auto-resume AI terminals on relaunch
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
- **Implementado 2026-10-18, pedido do usuário — `TerminalHandle` exposto pra fora ganha mais 3 ações, consumidas pela nova barra de menus da title bar (ver `shell.md`'s Notes 2026-10-18).** `newTerminal(dock?)` cria um terminal comum, caindo no dock padrão configurável (`getDefaultTerminalDock()`, novo `frontend/src/utils/defaultDock.ts`) se nenhum for passado — mesma função usada pelos dois lugares que antes criavam um terminal "padrão" com `'bottom'` fixo (a criação automática quando não há config salva, nas duas rotinas de restore). `listTabs()` retorna `{id,title,dock,engine?}` de toda aba, consultado sob demanda (não espelhado em outro componente) — primeira vez que algo além da contagem por dock (`onTabCountChange`) sai deste componente. `focusTab(id)` ativa a aba no dock certo e chama `.focus()` no xterm correspondente, reusando a mesma janela de retries (`[30,120,350]ms`) de `scheduleFit`, já que o div só fica `display:block` depois do efeito de `activeBottomId`/`activeRightId` rodar. Nenhuma dessas três precisou do pending-ref que `openWithCommand` já tinha (se não há terminal montado ainda, não há aba pra listar/focar, e `newTerminal` sem terminal montado é coberto pelo chamador simplesmente revelando o painel — a montagem já cria um terminal padrão por conta própria).
- **Implementado 2026-10-17, pedido do usuário — terminais de IA sobrevivem a um fechar/reabrir do app.** `TermTab` (frontend, `Terminal.tsx`) ganhou `engine?: 'claude'|'codex'` e `sessionId?: string`, persistidos junto com `id`/`title`/`dock` no mesmo `localStorage` por workspace (`bcode.termtabs.{workspaceId}`) que já guardava a config de abas — **decisão de implementação**: em vez de duplicar isso em `WorkspaceState` (Go, `app.go`), que já não guarda nada por-terminal hoje (só `TerminalCount`, legado), manteve-se uma única fonte de verdade para configuração de aba, a mesma que já sobrevive a um restart. `TerminalHandle.openWithCommand(command, dock?, ai?)` (usado pelo painel AI Sessions — ver `ai-sessions.md`) agora aceita esse terceiro parâmetro; quando presente, a aba criada já nasce nomeada "Claude"/"Codex" (em vez de `Terminal N`) e marcada para resume futuro. **O default de `dock` em `openWithCommand` mudou de `'bottom'` para `'right'`** (decisão tomada durante a implementação, não estava fixada na task original — ver `.specs/tasks/ai-terminal-session-persistence-and-new-session-buttons-plan.md`, Fase 3b: deixar o "Abrir" existente e os novos botões de nova sessão consistentes entre si, já que ambos passam pelo mesmo `openWithCommand`). Nos dois pontos onde uma aba salva é recriada no mount (troca de workspace e inicialização), uma aba com `engine` salvo roda `TerminalInput(tab.id, <comando de resume> + '\n')` assim que o shell sobe, exatamente como o fluxo normal de "abrir sessão" já fazia — uma sessão inválida/expirada só mostra o erro do próprio `claude`/`codex` dentro do terminal, não interrompe o restore das outras abas. Uma aba onde o usuário digitou `claude`/`codex` manualmente num shell comum nunca tem `engine` setado, então nunca é auto-resumida (fora de escopo, documentado na task). Task: `.specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md`.
- **Implementado 2026-10-22, pedido do usuário — nenhum processo pode ficar órfão.** `CloseTerminal`/`shutdown()` matavam só o processo do shell (`term.cancel()`/`ptmx.Close()`); qualquer filho que ele tivesse gerado (um `claude`/`codex` em primeiro plano, ou um job em background com `&`) sobrevivia, reparentado pro init — reproduzível rodando `sleep 999 &` num terminal integrado e fechando a aba. **Correção de rota durante a implementação**: a ideia original era um kill de *grupo* de processos (`Setsid`+`syscall.Kill(-pid,...)`) — descartada depois de confirmar que `pty.Start` já chama `Setsid`/`Setctty` por conta própria (`creack/pty`'s `start.go`) e que, mesmo assim, o controle de jobs do shell interativo põe cada `&` em background no SEU PRÓPRIO grupo de processos dentro da mesma sessão — um kill de grupo correto, testado isoladamente, não alcançava o `sleep 999 &`. Fix real: `killProcessTree(pid)` (novo `terminal_unix.go`, `//go:build !windows`) percorre `ps -A -o pid,ppid` recursivamente a partir do pid do shell e mata cada descendente de baixo pra cima, depois o próprio shell — mesmas colunas em Linux e macOS, ao contrário de ler `/proc` direto (só Linux). `terminal_windows.go` é um no-op (gap de PTY no Windows já documentado, ADR-0004 — não é escopo desta task). Chamado em `CloseTerminal` e `shutdown()`, logo depois de `term.cancel()`. `StartTerminal` não mudou — o bug nunca foi em como o processo nasce, só em como ele morre. Fechar um projeto (`CloseWorkspace`/`RemoveWorkspace`, ver `workspace.md`) agora também mata os terminais dele via o novo `closeWorkspaceTerminals` (frontend, `Terminal.tsx`) — chamado antes do backend, nunca apaga a config salva (`bcode.termtabs.{workspaceId}`), só o live/`wsCache`. Verificado: `go build`/`go vet`/`gofmt` limpos (Linux nativo + cross-compile `GOOS=windows`/`GOOS=darwin`), `tsc`/`vite build` limpos, algoritmo de kill validado num repro isolado fora do runtime do Wails (chamar `StartTerminal`/`CloseTerminal` de dentro de um `go test` falha — `runtime.EventsEmit` exige um contexto real do Wails já inicializado). **Verificação manual pendente do usuário** (sem GUI neste ambiente pra rodar `wails dev` de ponta a ponta). Task: `.specs/tasks/terminal-process-cleanup.md`.
- Gap: Windows needs a different shell and PTY (ConPTY). Not verified.
- Ctrl+V for image paste is intentionally left untouched (ADR-0008, resolved 2026-09-25). xterm.js's default key handling already sends `0x16` for Ctrl+V when no custom handler intercepts it; `claude`/`codex` read the OS clipboard themselves from that byte, exactly like in a native terminal. Two custom implementations (an explicit `0x16` sender, then a browser-`paste`-event temp-file writer) were built and removed — neither was needed, and the second one's DOM `paste` event never even fired in this app's WebKitGTK build. **Do not re-add custom Ctrl+V handling** without first checking whether the real cause of a report is a missing system clipboard tool (`wl-clipboard`/`xclip` on Linux). **Confirmed working** on Linux once `wl-clipboard` is installed. Bundling `wl-paste`/`xclip` inside BCode to avoid that manual install was found technically workable but rejected — `xclip` (GPLv2) and `wl-clipboard` (GPLv3) would obligate BCode to ship their license texts and source availability. Task: `.specs/tasks/terminal-image-paste.md`.
- **Corrigido 2026-10-17, pedido do usuário — terminal integrado herdava `LD_LIBRARY_PATH`/`APPDIR`/`APPIMAGE`/`OWD` do AppImage Linux, quebrando builds (go/gcc/npm) rodados dentro dele.** Causa raiz: `StartTerminal` (`app.go`) passava `cmd.Env = append(os.Environ(), "TERM=xterm-256color")` direto — como o processo principal roda dentro do mount do AppImage, `AppRun` já tinha setado `LD_LIBRARY_PATH=$APPDIR/usr/lib` nele, e isso vazava pra todo processo filho, incluindo o shell do terminal integrado. Reproduzido ao vivo: `wails dev` executado *dentro* do terminal do Cortex falhava no link (`ld: libwebkit2gtk-4.1.so: referência não definida para gst_video_dma_drm_fourcc_from_format`) porque `ldd` resolvia as libs GStreamer contra as empacotadas no AppImage (`/tmp/.mount_cortex*/usr/lib`) em vez das do sistema — mesmo mecanismo da causa raiz do diálogo de abrir pasta em `.specs/tasks/file-open-infinite-loading.md`, mas afetando qualquer ferramenta de build, não só o diálogo nativo. Fix: nova `terminalEnv()` filtra essas 4 variáveis de `os.Environ()` antes de montar `cmd.Env` do `pty.Start` — o terminal integrado agora se comporta como um terminal normal do host. Ver `.specs/tasks/file-open-infinite-loading-plan.md` (fase adicionada pra esse escopo) e `.specs/modules/release.md`.
- **Implementado 2026-10-14, pedido do usuário — links clicáveis (Ctrl/Cmd+click) na saída do terminal.** `Terminal.tsx` ganhou `registerTerminalLinkProvider` (um `xterm.registerLinkProvider` por instância de `XTerm`, chamado dentro de `createTerminal` — todo dock/aba nova já herda, sem código extra por dock). `provideLinks` roda duas regex por linha do buffer (`TERMINAL_URL_REGEX` pra `http(s)://`, `TERMINAL_ABS_PATH_REGEX` pra caminho absoluto `/...`/`~/...`/`C:\...`) — um match de URL exclui o mesmo trecho de virar link de arquivo também (a barra depois de `http:` bate nas duas regex). `ILink.activate` só age se `event.ctrlKey`/`event.metaKey` (via `platformRef` já existente) estiver pressionado — sem o modificador, não faz nada, preserva a seleção normal de texto do xterm. Link `http(s)://` chama `BrowserOpenURL`; caminho de arquivo chama `ReadFile`+`openOrFocusTab` (`openFilePathAsTab`, mesmos campos do `openFile` da sidebar), falha silenciosa se o arquivo não existir. **Não** revela no gerenciador de arquivos do SO (`RevealInFinder` é outra coisa, só funciona no macOS hoje, gap já documentado em `files.md`). Confirmado com o usuário: caminho **relativo** fica fora de escopo — `workdirRef` só guarda a pasta em que o terminal foi aberto, não acompanha o cwd ao vivo depois de um `cd`. Task: `.specs/tasks/terminal-clickable-links.md`.
