---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-10-21
version: 7
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: []
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: ai-sessions

## Purpose

Discover Claude Code and Codex CLI sessions for the project currently open in Cortex (currently running, plus older resumable ones, most-recently-used first), and let the user jump back into one — opening a terminal already running the resumed session — or delete it.

## Boundaries

- Owns: the "AI Sessions" sidebar panel UI (`AiSessionsPanel.tsx`), the backend scan/listing logic for both engines, a small local hidden-set (`~/.bcode/ai_sessions_hidden.json`) that makes "excluir" actually stick
- Does NOT own: the actual session data on disk (`~/.claude/*`, `~/.codex/*` — owned by Claude Code/Codex themselves, Cortex only reads and, for delete, removes a record on the user's explicit request), terminal PTY lifecycle (`terminal` module — this module only decides *what command* a newly-opened terminal should run)

## Public Interface (`implementado` 2026-10-16)

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| ListClaudeSessions | `cwd string, includeOlder bool` | `AiSession[]` | `cwd`: filters to one project (""=no filter). `includeOlder=false`: only sessions with a live `claude` process (`~/.claude/sessions/*.json`, filtered to pids that are actually still alive). `true`: also includes every resumable session found under `~/.claude/projects/**/*.jsonl` not already covered by a live one. Sorted by `updatedAt` desc. Filters out anything in the local hidden-set |
| ListCodexSessions | `cwd string, includeOlder bool` | `AiSession[]` | Same `(cwd, includeOlder)` contract. Speaks Codex's own `app-server` JSON-RPC protocol (`codex app-server`, spawned as a short-lived subprocess) — `thread/loadedList` for live, `thread/list` (with `cwd` passed through, then re-checked locally) for the `includeOlder` case. **Explicitly OpenAI-labeled `[experimental]`** — see Notes. Returns an empty list (not an error) on any failure (binary missing, protocol mismatch, timeout) |
| DeleteClaudeSession | sessionId | error | Deletes the `~/.claude/projects/**/<sessionId>.jsonl` file if found, then always adds the id to the local hidden-set regardless of outcome. Does **not** kill a live process using it — see Notes |
| DeleteCodexSession | threadId | error | Calls Codex app-server's `thread/delete`, then always hides the id locally regardless of outcome — see Notes |
| GetInstalledAiEngines | none | `string[]` (`"claude"`/`"codex"`) | `exec.LookPath` check — drives which "new session" button(s) the sidebar shows (`implementado` 2026-10-17) |

`AiSession` fields: `id`, `engine` (`"claude"|"codex"`), `title`, `cwd`, `createdAt` (unix seconds), `updatedAt` (unix seconds), `isRunning`.

## Events Published

None.

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| `terminal` | public-service | a new terminal tab is opened with a specific startup command (`claude --resume <id>` / `codex resume <id>`), not a generic blank shell |
| Claude Code CLI | external filesystem format | `~/.claude/sessions/*.json` (live pid registry), `~/.claude/projects/**/*.jsonl` (resumable history + `ai-title`/`custom-title` metadata) — not a documented/versioned format, same risk class as this app's own `usage` module already reading the same tree |
| Codex CLI | external JSON-RPC protocol | `codex app-server`'s `[experimental]` protocol — OpenAI's own label, may change between Codex versions without notice |

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local |

## Security

- Read-only inspection of another CLI tool's local session data — no network calls, no credentials handled directly (Codex's own `app-server` process handles its own auth, Cortex never touches an API key).
- Delete actions are destructive and need a confirm dialog (same pattern as file/connection delete elsewhere in this app).

## Notes

- **Implementado 2026-10-21, pedido do usuário — habilitar/desabilitar clientes de IA em Configurações; corrigido no mesmo dia.** Um conjunto "habilitado" configurável em Configurações (`shell` module, nova seção "Clientes de IA"), persistido em `localStorage` (`bcode.aiClientEnabled`, `frontend/src/utils/aiClientSettings.ts`, novo arquivo — mesmo padrão do já existente `defaultDock.ts`, sem round-trip pro backend). `AiSessionsPanel.tsx`'s `load()` nem chama `ListClaudeSessions`/`ListCodexSessions` pra um engine desabilitado (checado via `isAiEngineEnabled` antes da chamada, não um filtro depois do fetch). Claude e Codex vêm habilitados por padrão quando não existe config salva (regra "sem chave salva → `true`", aplicada por engine — uma engine nova que apareça depois também nasce habilitada até o usuário mexer nela). Reage a toggles feitos em Configurações sem precisar reiniciar o app via um evento customizado (`ai-client-settings-changed`, disparado por `setAiEngineEnabled`) — o `storage` event nativo do browser não serve aqui porque só dispara em OUTRAS janelas/abas, nunca na mesma janela onde a mudança aconteceu, e Configurações/painel vivem na mesma janela. Não afeta sessão já aberta/retomada (excluir/desabilitar nunca mata processo vivo, mesmo espírito do "Excluir" já documentado abaixo).
  - **Correção, mesmo dia, pedido explícito do usuário**: a primeira versão combinava esse conjunto habilitado com `GetInstalledAiEngines` (instalado no PATH) por **interseção** pros botões de "nova sessão" — mantendo o comportamento antigo de só mostrar o que estivesse de fato instalado. O usuário testou num build real e só viu "Abrir chat" direto (sem poder escolher Claude/Codex); causa raiz confirmada por este assistente: `codex` realmente não está instalado nesta máquina, então a interseção nunca ia mostrar os dois — e ainda que estivesse, `GetInstalledAiEngines` já tinha uma suspeita de detecção não-confiável documentada abaixo (nota 2026-10-18). **O usuário corrigiu a decisão**: a config agora **substitui** a checagem de instalado, não intersecta com ela — os botões de nova sessão mostram um por engine habilitado em `ALL_AI_ENGINES` (`aiEngines.ts`), instalado ou não. Clicar num engine habilitado mas não instalado só abre um terminal que vai dar "command not found" — mesmo resultado de digitar o comando errado à mão, não é uma falha nova. `GetInstalledAiEngines` deixou de ser chamado por este painel (método Go intocado, só ficou sem consumidor no frontend — fora de escopo remover). Verificado: `tsc --noEmit`/`vite build`/`go build`/`go vet`/`gofmt` (incluindo `-tags webkit2_41`) limpos; verificação manual de GUI pendente do usuário. Task: `.specs/tasks/ai-client-enable-toggle.md`.
- **Reportado pelo usuário, 2026-10-18 — botão "Abrir chat" da title bar não aparece mesmo com `claude` instalado.** Suspeita: `GetInstalledAiEngines` usa só `exec.LookPath`, sem os caminhos-candidato de fallback que `findClaudeCLI` (módulo `chat`, `app.go:606`) já tem para o mesmo problema — app lançado pelo launcher gráfico/AppImage nem sempre herda o `PATH` completo do shell interativo. Startup já é não-bloqueante (chamada em `useEffect` com `.then/.catch`, `App.tsx:75-77`) — isso já atende o pedido do usuário de não travar a abertura do app por causa da detecção. Task: `.specs/tasks/open-chat-button-claude-detection.md`.
- **Implementado 2026-10-17, pedido do usuário — botões de nova sessão + auto-resume no relaunch.** O painel ganhou um botão "Claude"/"Codex" no topo (um por engine instalado, via `GetInstalledAiEngines`) que abre uma sessão **nova** (sem `--resume`) — diferente do "Abrir" já existente na lista, que continua retomando. Os dois fluxos abrem no **dock configurado como padrão de chat** em Configurações (`getDefaultChatDock()`, ver `.specs/modules/shell.md`'s Notes 2026-10-18 — antes era `'right'` fixo no código, decisão tomada em 2026-10-17 pra não deixar "Abrir" e os botões de nova sessão inconsistentes entre si; 2026-10-18 tornou esse valor configurável em vez de hardcoded). A aba de terminal criada por qualquer um dos dois fluxos é nomeada "Claude"/"Codex" em vez do nome genérico `Terminal N`. Ao fechar o app com uma dessas abas aberta e reabrir, o terminal é recriado já retomando a mesma sessão automaticamente — ver `.specs/modules/terminal.md` (owns essa parte, este módulo só fornece o comando/engine/sessionId via `TerminalHandle.openWithCommand`). Fora de escopo, mantido assim de propósito: um terminal onde o usuário digitou `claude`/`codex` manualmente num shell comum nunca é restaurado — Cortex não tem como saber que aquele terminal é de IA nem qual seria o id da sessão, já que não passou por este painel nem pelo novo botão.
- **Implementado 2026-10-16, pedido do usuário 2026-10-14; redesenhado 2026-10-16, pedido do usuário.** Primeira versão: ícone na `ActivityBar` abria uma aba singleton listando sessões de TODOS os projetos, agrupadas por projeto, com busca no topo. **O usuário pediu para mudar a estratégia** no mesmo dia, depois de ver a primeira versão: não quer mais uma aba — quer um painel na sidebar (mesmo grupo de `explorer`/`git`/`database`, trocado pelo mesmo ícone na `ActivityBar`), mostrando só as sessões do **projeto aberto no momento** (filtro por `cwd`, não mais agrupamento por projeto — não faz mais sentido com um único projeto visível), ordenadas por uso mais recente, com **paginação simples** (5 por vez, botão "carregar mais" — substituiu o toggle "mostrar mais antigos" da v1; agora `includeOlder=true` é sempre usado, a paginação é inteiramente client-side sobre a lista já ordenada por `updatedAt`). Cards ganharam **datas de criação e última edição** (`createdAt`/`updatedAt`, novos campos em `AiSession` — não existiam na v1, que só tinha `startedAt`). Ação "Abrir" simplificou: como o painel só mostra sessões do projeto já aberto, não precisa mais verificar/trocar workspace — só abre o terminal com o resume.
- **Bug relatado pelo usuário, corrigido na mesma leva**: excluir uma sessão não a fazia desaparecer da lista. Causa raiz: para sessões com processo `claude` vivo, a listagem decide visibilidade pelo registro de pid (`~/.claude/sessions/*.json`), que é totalmente independente do arquivo `.jsonl` que o delete removia — apagar o `.jsonl` não tira a sessão do pid registry, então ela reaparecia (só com o título trocado pelo id curto, já que o `.jsonl` sumiu). Pelo mesmo motivo, o `thread/delete` do Codex pode falhar silenciosamente num thread atualmente carregado/ativo (protocolo experimental). **Fix**: um hidden-set local (`~/.bcode/ai_sessions_hidden.json`, dentro dos limites deste módulo — nunca mexe nos dados do Claude/Codex além do que já fazia) registra todo id já excluído pelo usuário; as duas funções `List*` filtram por ele, então uma vez excluída, a sessão nunca mais reaparece nesta UI, não importa o estado real do processo/registro externo. Validado com um teste Go descartável reproduzindo o bug exato (pid vivo + delete + relistagem) antes e depois do fix.
- Novo arquivo de título a mais: `readClaudeSessionMeta` agora também reconhece o tipo de registro `"custom-title"` (título definido explicitamente pelo usuário dentro do Claude Code), preferido sobre `"ai-title"` quando ambos existem.
- Backend em `ai_sessions.go` (raiz, package `main`). Frontend em `AiSessionsPanel.tsx`, montado dentro de `Sidebar.tsx` (não mais `EditorPane.tsx`/abas). Verificado com `go build`/`go vet`/`gofmt`/`tsc`/`vite build` limpos; verificação manual de GUI e fluxo Codex de ponta a ponta (sessão autenticada real) ainda pendente, depende do usuário.
- **Pesquisa feita durante a captura (instalado `@openai/codex` localmente, versão livre, só para inspecionar o formato — nenhuma sessão de verdade criada, sem login)**:
  - **Claude Code**: `~/.claude/sessions/<pid>.json` — um arquivo por processo `claude` interativo rodando agora (`{pid, sessionId, cwd, startedAt, name, kind}`). Confirmado nesta máquina: todos os pids achados correspondiam a processos realmente vivos (`/proc/<pid>` existia) — mas a leitura não deve confiar cegamente nisso, precisa checar a liveness do pid (não documentado se o arquivo é sempre limpo em todo crash). Título/metadata de cada sessão vem de `~/.claude/projects/<cwd-com-"/"-trocado-por-"-">/<sessionId>.jsonl`, lendo o registro `{"type":"ai-title","aiTitle":"...","sessionId":"..."}` (nem toda sessão tem um, principalmente as muito curtas). Resume via `claude --resume <sessionId>` (ou `-r`).
  - **Codex**: muito mais complexo. A versão atual (0.162.1) não usa mais um formato de arquivo simples por sessão — é indexado num SQLite interno (`sqlite_home`, tabela `thread_turns` com migrações ativas de schema) por cima de "rollout files" legados. A forma sancionada (não reverse-engineering de arquivo) de consultar isso é o protocolo JSON-RPC `codex app-server` — mas a própria OpenAI marca `app-server` como **`[experimental]`** no `--help`. Descoberto via `codex app-server generate-json-schema --out <dir> --experimental`: `ThreadLoadedListParams`/`Response` (`data`: "Thread ids for sessions currently loaded in memory" — exatamente "sessão ainda aberta"), `ThreadListParams`/`Response` (histórico completo, paginado, filtro por `cwd`/`archived`), `Thread` (campos `id`, `cwd`, `name`, `preview`, `projectId`, `updatedAt`, `status` — enum `notLoaded | idle | systemError | active`), `ThreadDeleteParams{threadId}`, `ProjectListParams`/`Response`. Resume via `codex resume <threadId>`.
  - **Decisão confirmada com o usuário — risco do protocolo experimental do Codex**: implementado mesmo assim, mas com **fallback silencioso** — se o `app-server` falhar (binário ausente, handshake incompatível, timeout, mudança de schema numa versão futura do Codex), a seção Codex da aba simplesmente fica vazia, sem erro nem travar a seção Claude.
  - **Decisão confirmada com o usuário — "ainda abertas" por padrão**: só sessões com processo vivo agora (pid registry do Claude / `thread/loadedList` do Codex). Um controle na UI (toggle/botão, não fixado aqui qual exatamente) revela também as mais antigas (resumíveis mas sem processo rodando agora).
  - **Fora de escopo, documentado explicitamente**: "Excluir" nunca mata um processo vivo — só remove o registro resumível (`.jsonl` do Claude / `thread/delete` do Codex). Se a sessão excluída ainda tiver um processo escrevendo nela, o processo continua rodando normalmente (só perde a capacidade de ser retomada depois que esse processo também terminar).
  - Task: `.specs/tasks/ai-sessions-tab.md`.
