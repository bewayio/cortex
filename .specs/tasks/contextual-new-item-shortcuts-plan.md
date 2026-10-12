---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 2
connections:
  parent: .specs/tasks/contextual-new-item-shortcuts.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Criar item respeitando seleção + atalhos Ctrl/Cmd+N contextuais

## Task vinculada

`.specs/tasks/contextual-new-item-shortcuts.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** Mudança pequena e coesa, sem dependência externa.

## Definição de Pronto — confirmado

- Project DNA, architecture overview, `.specs/modules/files.md`, `.specs/modules/shell.md`, `.specs/modules/database.md` lidos.
- Causa raiz do bug do botão já confirmada por leitura de `FileExplorer.tsx`'s `triggerCreate` (exige a pasta estar expandida pra usá-la como alvo).
- Confirmado por leitura: `explorerActionsRef` hoje vive dentro de `Sidebar.tsx` (não em `App.tsx`), criado localmente via `useRef` e passado pro `actionRef` do `FileExplorer`. `DatabasePanel.tsx` não expõe nenhum handle equivalente — `startCreate()`/`openNewFolderPrompt('connection')` só são chamados internamente, a partir dos próprios botões do painel.
- Sem tasks bloqueantes.

## Fases

### Fase 1 — Corrige o alvo do botão Novo Arquivo/Nova Pasta (S)

- `FileExplorer.tsx`'s `triggerCreate`: usa a pasta selecionada/focada como `parentDir` sempre que ela for um diretório (`node?.isDir`), independente de `expandedPaths.has(node.path)` — remove essa condição do `if`.
- Depois de criar (`commitCreate`), expande a pasta-alvo automaticamente (`setExpandedPaths` incluindo o path) se ela não estava expandida, pro item novo ficar visível sem um clique extra.
- Dependência: nenhuma (primeira fase).

### Fase 2 — `DatabasePanel.tsx` expõe um handle de ações (S)

- Mesmo padrão de `FileExplorerHandle`/`actionRef`: `DatabasePanel.tsx` ganha um `actionRef` prop opcional, populado (via `useEffect`, mesmo jeito que `FileExplorer.tsx` já faz) com `{ newConnection: () => startCreate(), newConnectionFolder: () => openNewFolderPrompt('connection') }`.
- Dependência: nenhuma — pode rodar em paralelo com a Fase 1.

### Fase 3 — Eleva os refs de ação pra `App.tsx` e liga o atalho global (M)

- `Sidebar.tsx` vira (ou ganha) um jeito de expor os dois handles (explorer + database) pro pai — mais simples: `Sidebar.tsx` recebe os dois `actionRef`s como props vindos de `App.tsx` (que os cria via `useRef`) e só repassa pro `FileExplorer`/`DatabasePanel` internamente, em vez de criar o `explorerActionsRef` localmente como hoje.
- `App.tsx` ganha um novo handler de teclado (pode reaproveitar o efeito de atalhos existente, ou um novo dedicado — implementação decide) pra `Ctrl/Cmd+N` e `Ctrl/Cmd+Shift+N`, lendo `activePanel`:
  - `explorer`: `explorerActionsRef.current?.addFile()` / `addFolder()`.
  - `database`: `dbActionsRef.current?.newConnection()` / `newConnectionFolder()`.
  - qualquer outro painel: não faz nada.
- Dependência: Fases 1–2 (as ações precisam existir e estar corretas antes de ligar o atalho a elas).

### Fase 4 — Verificação (S)

- `tsc --noEmit`, `vite build`, `go build ./...` (sem mudança de backend aqui, só confirma que nada quebrou).
- Verificação manual em `wails dev` sinalizada como necessária do usuário (selecionar uma pasta colapsada e clicar Novo Arquivo, testar os atalhos nos dois painéis) — não tenho ferramenta de automação de GUI aqui.
- Dependência: Fases 1–3.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Corrige alvo do botão | S |
| 2. Handle de ações no DatabasePanel | S |
| 3. Eleva refs + atalho global | M |
| 4. Verificação | S |

## Fora de Escopo

Igual à task vinculada: atalho de criação pro painel Git, caso especial pra seleção múltipla.

## Status

Todas as 4 fases implementadas 2026-10-11. Ver `.specs/tasks/contextual-new-item-shortcuts.md` pros critérios de aceite verificados vs. pendentes.

## Próximo Passo

Rodar `bsdd finish` quando o usuário confirmar o comportamento interativo no `wails dev`.
