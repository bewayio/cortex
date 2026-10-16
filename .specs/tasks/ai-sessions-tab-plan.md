---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-16
version: 1
connections:
  parent: .specs/tasks/ai-sessions-tab.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Aba "AI Sessions" — sessões abertas do Claude Code e Codex por projeto

## Task vinculada

`.specs/tasks/ai-sessions-tab.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** Dependência sequencial real: Claude (mais simples) antes do Codex (protocolo experimental, mais arriscado) antes da UI, que consome os dois. Pouco a ganhar paralelizando.

## Definição de Pronto — confirmado

- `.specs/modules/ai-sessions.md`, `.specs/modules/terminal.md`, `.specs/modules/shell.md` lidos.
- Pesquisa de formato já feita na captura (`~/.claude/sessions/*.json`, `~/.claude/projects/**/*.jsonl`, protocolo `codex app-server` — ver Notes de `ai-sessions.md`).
- **Achado adicional durante o planejamento**: `StartTerminal(workdir)` (`app.go`) só abre um shell em branco, sem jeito de passar um comando inicial — mas não precisa de mudança de assinatura no backend. Mais simples: depois de `StartTerminal` retornar o `id`, chamar `TerminalInput(id, "claude --resume <id>\n")` (ou `codex resume <id>\n`) — equivale a "digitar" o comando no shell recém-aberto, sem precisar plumbing novo no Go.
- **Achado adicional**: `Terminal.tsx`'s `addTerminalTab(dock)` é interno, não exposto a `App.tsx` — precisa de um `actionRef`/`TerminalHandle` (mesmo padrão já usado por `FileExplorerHandle`/`DatabasePanelHandle`) pra `AiSessionsTab` conseguir pedir "abre um terminal novo com este comando". `App.tsx`'s `showTerminal` (dock visível ou não) também precisa ser ligado pelo mesmo fluxo, senão o terminal abre escondido.
- Sem tasks bloqueantes.

## Fases

### Fase 1 — Backend: descoberta e delete de sessões Claude Code (M) ✅ feita 2026-10-16

- Novo tipo `AiSession` (Go): `{id, engine: "claude"|"codex", title, cwd, startedAt, isRunning}` (campos exatos a ajustar durante a implementação).
- `ListClaudeSessions(includeOlder bool) []AiSession`: lê `~/.claude/sessions/*.json`, filtra por pid vivo (`syscall`/checagem cross-platform — Linux via `/proc/<pid>`, ver gap de macOS/Windows já documentado como fora de escopo verificado). Cruza com `~/.claude/projects/<cwd-codificado>/<sessionId>.jsonl` pro `ai-title` (scan só da primeira(s) linha(s), não o arquivo inteiro — performance). `includeOlder=true` também varre `~/.claude/projects/**/*.jsonl` por sessões sem pid vivo correspondente (reaproveita o padrão de scan já usado em `GetClaudeTokenUsage`).
- `DeleteClaudeSession(sessionId string) error`: localiza e remove o `.jsonl` correspondente dentro de `~/.claude/projects/**/`.
- Teste Go descartável: fixture de diretório temporário simulando `~/.claude/sessions/` e `~/.claude/projects/`, confirma parsing e filtro de liveness.
- Dependência: nenhuma (primeira fase).

### Fase 2 — Backend: cliente JSON-RPC do Codex app-server (L) ✅ feita 2026-10-16

- Novo cliente interno (`codexAppServer` ou similar): spawna `codex app-server` (`exec.Command`, stdin/stdout pipes), faz o handshake inicial (`initialize`), chama `thread/loadedList` (caso padrão) ou `thread/list` (`includeOlder=true`), encerra o subprocesso ao final de cada chamada (não um daemon de longa duração — mais simples e evita gerenciar ciclo de vida de processo em background).
- `ListCodexSessions(includeOlder bool) []AiSession`: usa o cliente acima; qualquer erro (binário `codex` não encontrado no PATH, timeout, erro de protocolo/schema) retorna slice vazio — nunca propaga erro pro frontend, conforme já decidido na task.
- `DeleteCodexSession(threadId string) error`: mesma spawn-connect-call-close, chamando `thread/delete`.
- Timeout curto (ex: 5s) em toda chamada ao `codex app-server` — não travar a UI esperando um subprocesso que não responde.
- Teste Go descartável: se o binário `codex` não existir no `PATH` do ambiente de teste, `ListCodexSessions` deve retornar `[]` sem erro (cobre o caso de fallback silencioso sem precisar de um Codex de verdade instalado).
- Dependência: nenhuma (paralela à Fase 1 em teoria, mas sequenciada aqui por ser single-agent).

### Fase 3 — Frontend: abrir terminal com comando de start (S) ✅ feita 2026-10-16

- `Terminal.tsx` ganha `TerminalHandle`/`actionRef` (mesmo padrão de `FileExplorerHandle`), expondo algo como `openWithCommand(command: string, dock?: Dock)`: chama `createTerminal`/`addTerminalTab` e, assim que o `id` existe, `TerminalInput(id, command + '\n')`.
- `App.tsx`: novo `terminalActionsRef`, passado pro `<Terminal>`; garante `showTerminal`/`terminalMounted` ligados antes de chamar `openWithCommand` (mesmo gatilho que `onToggleTerminal` já usa).
- Dependência: nenhuma (independente dos backends, pode ser feita em paralelo na prática, sequenciada aqui).

### Fase 4 — Frontend: casca da aba AI Sessions (M) ✅ feita 2026-10-16

- Novo ícone na `ActivityBar` (`lucide-react`, `Bot`), abre/foca uma aba singleton (`isAiSessionsTab` em `EditorTab`, mesmo padrão de `isUsageTab`).
- Novo `AiSessionsTab.tsx`: busca no topo (filtra por nome de projeto/título), carrega `ListClaudeSessions`/`ListCodexSessions` (padrão `includeOlder=false`), agrupa por `cwd` (projeto), ordena grupos alfabeticamente, renderiza cards por sessão dentro de cada grupo. Toggle `showOlder` recarrega com `includeOlder=true`.
- Dependência: Fases 1–2 (precisa dos métodos existirem, mesmo que só com dados de teste/mock no início).

### Fase 5 — Frontend: ações Abrir/Excluir nos cards (M) ✅ feita 2026-10-16

- "Abrir": se `cwd` da sessão já é `currentWorkspace.path`, só chama `onOpenSessionTerminal(...)` (via `terminalActionsRef.current?.openWithCommand`); senão, troca de workspace primeiro (`onOpenWorkspace`), depois abre o terminal com o comando de resume pendente (`pendingTerminalCommandRef` + `useEffect` em `terminalMounted`, resolve a race de montagem do Terminal).
- "Excluir": modal de confirmação (reaproveita `.modal-overlay`/`.modal-dialog` já existentes), depois `DeleteClaudeSession`/`DeleteCodexSession` conforme o engine do card, recarrega a lista.
- Dependência: Fases 1–4.

### Fase 6 — Verificação (S) ✅ feita 2026-10-16

- `go build ./...`, `go vet ./...`, `gofmt -l .` — limpos.
- `tsc --noEmit`, `vite build` — limpos.
- Dependência: Fases 1–5.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Backend Claude | M |
| 2. Backend Codex (app-server) | L |
| 3. Terminal com comando de start | S |
| 4. Casca da aba | M |
| 5. Ações Abrir/Excluir | M |
| 6. Verificação | S |

## Fora de Escopo

Igual à task vinculada: matar processo vivo, auth do Codex, outros agentes de IA, verificação em Windows/macOS.

## Status

`done` — todas as 6 fases implementadas e verificadas em 2026-10-16. Ver `.specs/tasks/ai-sessions-tab.md` pro status da task e o que falta de verificação manual (GUI).

**Nota pós-plano (2026-10-16)**: as Fases 4-5 abaixo descrevem a v1 (aba singleton no editor, agrupada por projeto, com busca). No mesmo dia, o usuário pediu pra mudar de estratégia — painel de sidebar em vez de aba, filtrado só pelo projeto aberto, com paginação (últimas 5 + "carregar mais") em vez do toggle de sessões antigas, mais datas de criação/edição no card, e um fix pro bug de exclusão não funcionar. O código final reflete o redesign, não a descrição literal das fases abaixo — ver `.specs/modules/ai-sessions.md`'s Notes pro relato completo do redesign.
