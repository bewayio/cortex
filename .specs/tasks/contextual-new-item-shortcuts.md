---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 4
connections:
  parent: .specs/modules/shell.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Criar arquivo/pasta/conexão respeitando seleção + atalhos Ctrl/Cmd+N contextuais

## Status

`in-progress` — todas as 4 fases implementadas (ver `.specs/tasks/contextual-new-item-shortcuts-plan.md`); não marcada `done` só porque a verificação interativa em `wails dev` precisa do usuário (sem ferramenta de automação de GUI aqui).

## Objetivo

O botão "Novo Arquivo"/"Nova Pasta" do Explorer deve criar dentro da pasta selecionada (mesmo que ela esteja colapsada), ou na raiz do workspace se nada estiver selecionado. Ctrl/Cmd+N e Ctrl/Cmd+Shift+N viram atalhos globais contextuais: com o Explorer ativo, criam arquivo/pasta (mesma regra de alvo do botão); com o painel de Database ativo, criam uma nova conexão/pasta de conexões.

## Contexto

Pedido do usuário, 2026-10-11. Dois bugs/lacunas distintos, mesma task por estarem ligados (ambos sobre "criar item novo no painel certo"):

1. **Bug de alvo do botão Novo Arquivo/Pasta** — causa raiz lida em `FileExplorer.tsx`'s `triggerCreate`: só usa a pasta selecionada como alvo se ela **já estiver expandida** (`node?.isDir && expandedPaths.has(node.path)`); senão cria como irmã da pasta, não dentro dela. Precisa usar a pasta selecionada sempre que for um diretório, expandida ou não, e expandi-la depois de criar.
2. **Atalhos Ctrl/Cmd+N / Ctrl/Cmd+Shift+N não existem hoje.** Precisam ser globais (nível de `App.tsx`, mesmo padrão dos outros atalhos já existentes) mas com comportamento diferente dependendo do painel ativo (`activePanel` em `App.tsx` / `ActivityBar.tsx`): Explorer → arquivo/pasta; Database → conexão/pasta de conexões.

Ver `.specs/modules/files.md`, `.specs/modules/shell.md` e `.specs/modules/database.md`, notas de 2026-10-11, para o racional completo.

## Critérios de Aceite

- [x] Clicar "Novo Arquivo" ou "Nova Pasta" com uma pasta selecionada cria o item **dentro** dela, mesmo que a pasta esteja colapsada no momento do clique (`triggerCreate` não exige mais `expandedPaths.has`) — a pasta já era expandida automaticamente depois pelo `commitCreate` existente, sem mudança necessária ali.
- [x] Sem nenhuma pasta selecionada, continua criando na raiz do workspace (comportamento preservado, não mudou).
- [x] Com o painel Explorer ativo, Ctrl/Cmd+N cria um arquivo novo (mesmo alvo/regra do botão); Ctrl/Cmd+Shift+N cria uma pasta nova.
- [x] Com o painel Database ativo, Ctrl/Cmd+N abre o formulário de nova conexão; Ctrl/Cmd+Shift+N abre o prompt de nova pasta de conexões.
- [x] Com qualquer outro painel ativo (Git), os atalhos não fazem nada (`handleNewItemShortcut` só trata `explorer`/`database`).
- [x] `DatabasePanel.tsx` expõe suas ações de criar conexão/pasta via um novo `actionRef`/`DatabasePanelHandle`, mesmo padrão de `FileExplorerHandle`.

**Verificado:** `tsc --noEmit`, `vite build`, `go build ./...` limpos. O atalho também foi registrado como comando global do Monaco (`globalEditorShortcuts.ts`), não só como listener de `window` — lição da task anterior (project switcher): sem isso, não dispararia com o foco dentro de um arquivo aberto.
**Não verificado por mim** (sem ferramenta de automação de GUI aqui): clicar de verdade numa pasta colapsada e confirmar que o item nasce dentro dela; os atalhos nos dois painéis, inclusive com um arquivo aberto e o foco no Monaco.

## Módulos Afetados

- `files` (botão Novo Arquivo/Pasta, `FileExplorer.tsx`)
- `shell` (atalho global Ctrl/Cmd+N / Ctrl/Cmd+Shift+N, roteado por painel ativo)
- `database` (`DatabasePanel.tsx` expõe handle equivalente, ações de nova conexão/pasta)

## Fora de Escopo

- Qualquer atalho de criação para o painel Git.
- Mudar o comportamento de criação quando múltiplos itens estão selecionados (`selectedPaths` com mais de um item) — usa o mesmo item focado/âncora de hoje, sem necessidade de um caso especial novo.

## Próximo Passo

Rodar `bsdd plan` pra transformar isso num plano de implementação.
