---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-16
version: 4
connections:
  parent: .specs/modules/ai-sessions.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Painel "AI Sessions" — sessões do Claude Code e Codex do projeto aberto

## Status

`implemented` — versão inicial (aba) implementada e verificada em 2026-10-16; **redesenhada no mesmo dia**, pedido do usuário, pra um painel de sidebar com filtro por projeto, paginação e correção do bug de exclusão (ver Contexto). Redesign também verificado (`go build`/`go vet`/`gofmt`/`tsc`/`vite build` limpos), incluindo um teste Go descartável reproduzindo e confirmando o fix do bug de delete. Falta só a verificação manual de GUI pelo usuário (ver nota no final dos Critérios de Aceite).

## Objetivo

Ícone na `ActivityBar` ("AI Sessions") alterna um painel na sidebar (mesmo grupo de Explorer/Git/Database) listando as sessões do Claude Code e do Codex **do projeto atualmente aberto em Cortex**, mais recentes primeiro, com as últimas 5 visíveis e um botão "carregar mais". Cada card mostra engine, título, indicador de "rodando agora", data de criação e de última edição, com ações de **abrir** (sobe um terminal novo já rodando o resume dessa sessão) e **excluir**.

## Contexto

Pedido do usuário, 2026-10-14.

**Pesquisa feita durante a captura** (sem implementar nada ainda): instalei `@openai/codex` localmente (num diretório isolado, `HOME` fake, sem login, sem criar nenhuma sessão de verdade) especificamente pra descobrir o formato de armazenamento do Codex, já que não era óbvio por fora. Achados completos em `.specs/modules/ai-sessions.md`'s Notes — resumo:

- **Claude Code**: `~/.claude/sessions/<pid>.json` é o registro de processos `claude` interativos rodando agora (`pid`, `sessionId`, `cwd`, `name`) — confirmado como a fonte certa pra "sessão ainda aberta" (todos os pids encontrados nesta máquina correspondiam a processos de fato vivos). Metadata/título de cada sessão (`ai-title`) vem de `~/.claude/projects/<cwd-codificado>/<sessionId>.jsonl`. Resume: `claude --resume <sessionId>`.
- **Codex**: formato bem mais complexo — SQLite interno, sem arquivo simples por sessão. A forma sancionada de consultar é o protocolo JSON-RPC `codex app-server`, que a própria OpenAI marca **`[experimental]`**. O método `thread/loadedList` dá exatamente "sessões carregadas na memória agora"; `thread/list` dá o histórico completo (paginado, filtrável por `cwd`). Resume: `codex resume <threadId>`. Delete: `thread/delete`.

**Decisões já confirmadas com o usuário:**
- **Codex entra nesta mesma task, não numa separada** — apesar do protocolo experimental ser um risco técnico real (pode mudar de versão pra versão do Codex sem aviso), com uma condição: **fallback silencioso**. Se `codex app-server` falhar por qualquer motivo (binário não instalado, handshake incompatível, timeout, schema mudou numa versão futura), a seção Codex da aba fica vazia — nunca trava a aba inteira nem quebra a seção Claude por causa disso.
- **"Ainda abertas" por padrão = processo rodando agora** (pid vivo pro Claude, `thread/loadedList` pro Codex) — não o histórico completo de toda sessão já tida. Um controle na UI revela também as mais antigas (resumíveis, sem processo rodando agora) — exato widget (toggle, botão "mostrar mais", etc.) é detalhe de implementação.
- **Ação "Abrir"** (v1): se o projeto da sessão (`cwd`) já é o workspace ativo em Cortex, só abre um terminal novo já rodando o resume; senão, primeiro troca/abre esse workspace, depois abre o terminal com o resume.
- **Ação "Excluir"**: remove o registro resumível (arquivo `.jsonl` do Claude / `thread/delete` do Codex) — **nunca mata um processo vivo**. Se a sessão excluída ainda tiver um processo escrevendo nela, ele continua rodando normalmente, só perde a resumibilidade depois que esse processo também terminar. Precisa de confirmação (mesmo padrão de diálogo de delete já usado em outros lugares do app).

**Redesign pedido pelo usuário, 2026-10-16 (mesmo dia, depois de ver a v1 rodando):**
- **Não quer mais uma aba.** Quer um painel na sidebar, no mesmo grupo de Explorer/Git/Database, trocado pelo mesmo ícone da `ActivityBar`.
- **Mostrar só as sessões do projeto aberto** — sem agrupamento por projeto nem busca (deixam de fazer sentido com um único projeto visível por vez). A ação "Abrir" simplifica: nunca mais precisa trocar de workspace primeiro, já que a sessão mostrada é sempre do projeto já aberto.
- **"Mostre as últimas 5 usadas e tenha um botão para carregar mais"** — substitui o toggle "mostrar mais antigos" da v1. Implementado como paginação client-side: a lista completa (`includeOlder=true` sempre) vem ordenada por `updatedAt` desc, o painel mostra as primeiras 5 e "carregar mais" revela mais 5 por clique.
- **Mais informações no card**: data de criação e de última edição (campos novos `createdAt`/`updatedAt` em `AiSession`, v1 só tinha `startedAt`). "Se a sessão tiver assunto, coloque também" — já coberto pelo título (prioriza `custom-title` > `ai-title` > id curto); `readClaudeSessionMeta` passou a reconhecer `custom-title` também, não só `ai-title`.
- **Bug relatado: "a exclusão não está excluindo a sessão"** — causa raiz: para sessões com processo `claude` vivo, a listagem decide visibilidade pelo registro de pid (`~/.claude/sessions/*.json`), independente do `.jsonl` que o delete remove — a sessão reaparecia (só com título trocado pelo id curto). Fix: hidden-set local (`~/.bcode/ai_sessions_hidden.json`) que as duas `List*` agora consultam — uma sessão excluída nunca mais reaparece nesta UI. Reproduzido e confirmado corrigido com um teste Go descartável antes de implementar o fix de verdade.

## Critérios de Aceite

### Ícone e painel
- [x] Ícone na `ActivityBar` (`Bot` do `lucide-react`) alterna um painel de sidebar (`Panel = 'explorer'|'git'|'database'|'aiSessions'`), mesmo grupo de Explorer/Git — não mais uma aba.
- [x] Painel mostra só as sessões do projeto aberto no momento (filtro por `cwd` exato, feito no backend).
- [x] Sem agrupamento por projeto nem busca (não fazem mais sentido com um único projeto visível) — superado pelo redesign.
- [x] Lista ordenada por uso mais recente (`updatedAt` desc), mostrando as últimas 5 com botão "carregar mais" (paginação client-side, +5 por clique).
- [x] Card mostra engine (badge colorido, `.claude` azul / `.codex` verde), título, indicador de "rodando agora", data de criação e data de última edição.

### Backend — Claude Code
- [x] `ListClaudeSessions(cwd string, includeOlder bool)` (`ai_sessions.go`): lê `~/.claude/sessions/*.json`, filtra por pid vivo via `/proc/<pid>` (`isPidAlive`) e por `cwd`, cruza com `~/.claude/projects/<cwd-codificado>/<sessionId>.jsonl` pro título (`custom-title` > `ai-title` > id curto) e pras datas (`createdAt` = timestamp do primeiro registro escaneado, `updatedAt` = mtime do arquivo). `includeOlder=true` escaneia só o diretório do projeto quando a codificação de `cwd` bate (fast path), com fallback de busca na árvore inteira + filtro por `cwd` lido de dentro do arquivo. Filtra qualquer id presente no hidden-set.
- [x] `DeleteClaudeSession(sessionId)`: remove o `.jsonl` correspondente (se encontrado) e sempre registra o id no hidden-set, mesmo se o arquivo não existir ou a remoção falhar por outro motivo — "excluir" tem que fazer a sessão sumir da UI independente do estado do arquivo.

### Backend — Codex
- [x] `ListCodexSessions(cwd string, includeOlder bool)`: mesmo contrato `(cwd, includeOlder)`. Spawna `codex app-server` como subprocesso por chamada (não daemon), handshake `initialize` + `thread/loaded/list` + `thread/list` (passando `cwd` pro app-server e reconferindo localmente), timeout de 5s. Qualquer falha retorna lista vazia, nunca erro — fallback silencioso confirmado com o usuário. Filtra pelo hidden-set.
- [x] `DeleteCodexSession(threadId)`: chama `thread/delete` via o mesmo app-server e sempre registra o id no hidden-set, mesmo se a chamada falhar (ex.: thread atualmente ativo/carregado recusando o delete) — ainda assim retorna o erro real, pra uma UI futura poder distinguir "escondido localmente" de "delete remoto confirmado".

### Abrir, excluir e fix do bug de exclusão
- [x] Card "Abrir": sempre abre terminal novo rodando `claude --resume <id>` / `codex resume <id>` (via `TerminalHandle.openWithCommand`) — não precisa mais trocar de workspace, já que o painel só mostra sessões do projeto já aberto.
- [x] Card "Excluir": modal de confirmação (reaproveita `.modal-overlay`/`.modal-dialog`), depois chama `DeleteClaudeSession`/`DeleteCodexSession` conforme o engine do card, recarrega a lista.
- [x] Bug "exclusão não excluindo" corrigido via hidden-set local (`~/.bcode/ai_sessions_hidden.json`) — reproduzido e confirmado corrigido com um teste Go descartável (sessão com pid vivo simulado, delete, relistagem) antes de ser removido.
- [x] Verificação: `go build ./...`, `go vet ./...`, `gofmt -l .` limpos; `tsc --noEmit`, `vite build` limpos (2026-10-16, após o redesign).

**Não verificado por mim**: comportamento real de GUI (clicar no ícone, ver o painel de verdade, clicar Abrir/Excluir num card de verdade) — sem ferramenta de automação de GUI disponível nesta sessão, precisa de uma passada interativa do usuário (`wails dev`). Em especial, o fluxo Codex nunca foi testado de ponta a ponta contra uma sessão real autenticada — só o handshake do protocolo e o caminho de lista vazia (sem login) foram verificados contra o binário real. O campo `createdAt` do Codex (`codexThread.CreatedAt`) é otimista — nunca confirmado que o schema real do `app-server` tem esse campo (só `updatedAt` foi confirmado na pesquisa original); se não existir, cai pra 0 e o fallback usa `updatedAt` no lugar, sem quebrar nada, mas o valor exibido pode estar errado até alguém confirmar contra uma sessão Codex real.

## Módulos Afetados

- `ai-sessions` (módulo — ver `.specs/modules/ai-sessions.md`)
- `shell` (ícone na `ActivityBar`, painel na sidebar)
- `terminal` (consumido — abrir um terminal já com um comando de start específico, não um shell em branco)

## Fora de Escopo

- Matar um processo `claude`/`codex` vivo (delete só remove o registro resumível).
- Autenticação por chave privada/qualquer coisa relacionada a login do Codex (Cortex nunca lida com credenciais do Codex diretamente — o `app-server` cuida disso sozinho).
- Suporte a outros agentes de IA além de Claude Code e Codex.
- Windows: a pesquisa desta captura foi feita só em Linux — `~/.claude`/`~/.codex` e a forma de checar pid vivo (`/proc/<pid>` no Linux) variam por SO; comportamento em Windows/macOS não verificado, fica como gap conhecido até alguém testar lá.

## Próximo Passo

Nenhum — implementado e verificado (v1 + redesign). Pendente apenas a verificação manual de GUI pelo usuário, listada nos Critérios de Aceite acima.
