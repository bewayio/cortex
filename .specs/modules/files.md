---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-10-12
version: 7
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: [0002]
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: files

## Purpose

Read, write and manage files and folders inside a workspace, and show them in the editor.

## Boundaries

- Owns: files on disk, editor tabs state (frontend)
- Does NOT own: workspace list, git state

## Public Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| GetFileTree | root | FileNode | Recursive tree |
| ReadFile / WriteFile | path, content | string / error | Content access |
| GetFileInfo | path | FileInfo | Size, mtime |
| CreateFile / CreateDirectory / RenameFile / DeleteFile | paths | error | Mutations |
| RevealInFinder | path | error | Runs `open -R`, macOS only (gap) |
| WatchWorkspace | root | error | Inicia um watcher recursivo (fsnotify) na pasta do workspace; eventos de mudança publicados via Wails event, ver Notes 2026-10-11 |

## Events Published

- `files:changed` — disparado pelo watcher (`WatchWorkspace`) quando algo muda dentro do workspace observado. Ver Notes 2026-10-11.

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| git | public-service | diff views ask git for original content |

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local |

## Security

- Full user filesystem access. DeleteFile is destructive and needs UI confirmation (needs verification).

## Notes

- Frontend: `FileExplorer`, `FileSearch`, `EditorPane`, `EditorTabBar`, `MonacoEditor`, `MarkdownPreview`, `editorStore`. Mermaid via `utils/diagrams.ts`.
- Gap: reveal-in-file-manager needs Linux (`xdg-open`) and Windows (`explorer /select`) branches.
- **Shipped 2026-09-27, user request**: drag-and-drop move in `FileExplorer.tsx` — dragging a file or folder row onto a directory row, or onto the tree's empty background (the workspace root, via a `min-height: 100%` on `.file-tree` so the empty space below the last row is actually reachable), moves it there. No new backend method: this is the existing `RenameFile(oldPath, newPath)` with a new destination path, same as the existing inline-rename path. A dedicated `isPathInsideOrEqual` helper (not the existing `ancestorPaths`, which serves a different purpose — auto-expanding ancestors of the active file, not descendant-checking against an arbitrary target) rejects dropping a folder into itself or one of its own children; dropping onto its current parent is a silent no-op. Row-level drop handlers call `stopPropagation()` so a drop on a nested directory row doesn't also trigger the root-level handler. Task: `.specs/tasks/db-tree-rename-and-dragdrop.md` (covers the file-tree side of this drag-and-drop work alongside the database-panel side).
- **Shipped 2026-09-27, user follow-up — Ctrl/Cmd+Shift+Tab losing focus after one press**: see `.specs/modules/shell.md`'s shortcuts entry and `.specs/tasks/tab-focus-and-persistence-fixes.md` for the fix (a tab switch could leave nothing focused in the DOM when the new tab isn't a Monaco instance).
- **Planned 2026-09-27, user follow-up — pinned tabs**: `editorStore.ts` gains a `pinned?: boolean` field on `EditorTab` and `pinTab`/`unpinTab` actions; `EditorTabBar.tsx` renders pinned tabs in a fixed-left group (plus a new, workspace-independent `globalTabs` for Home specifically, which is always pinned and never part of any per-workspace cache). Full design, including why Home needs to be pulled out of the existing per-workspace `switchWorkspace` cache instead of just adding `pinned: true` to it: `.specs/tasks/pinned-tabs.md`.
- **Implementado 2026-10-11, pedido do usuário — observar mudanças externas no disco (arquivo editado fora do app, arquivo novo criado por fora).** Novo `watcher.go`: `WatchWorkspace(root)` inicia um watcher recursivo (`fsnotify`, andando a árvore à mão, já que fsnotify não observa subpastas sozinho — e pastas criadas depois são adicionadas dinamicamente ao loop de eventos), com debounce de 300ms (`watchLoop`), publicando `files:changed` (lista de paths) por rajada de mudanças. Chamado de `App.tsx` ao abrir/trocar de workspace e na restauração de startup — `WatchWorkspace` já fecha o watcher anterior sozinho, sem precisar de uma chamada de "parar" separada. Dois efeitos no frontend, mesmo handler de evento em `App.tsx`:
  1. **Abas abertas**: se o arquivo de uma aba aberta mudou no disco e a aba **não tem alteração local não salva**, recarrega o conteúdo sozinho (`reloadTabContent`, novo action em `editorStore.ts` — decisão do usuário, 2026-10-11). Se a aba **tem** alteração não salva, não mexe no conteúdo — só marca `externallyChanged: true` (novo campo em `EditorTab`), mostrado como um indicador `⟳` discreto na aba (`EditorTabBar.tsx`), limpo ao salvar.
  2. **Árvore do explorer**: reconsulta `GetFileTree` por completo a cada evento — mais simples pra v1, não otimizado por diretório.
  - Verificado com um teste Go descartável: rajada de 5 escritas em sequência vira exatamente 1 evento debounced; um arquivo criado dentro de uma pasta criada depois do `WatchWorkspace` inicial também é observado.
  - Task: `.specs/tasks/file-watching-auto-reload.md`.
- **Corrigido 2026-10-11, pedido do usuário — botão "Novo Arquivo"/"Nova Pasta" ignorando a pasta selecionada quando ela está colapsada.** Causa raiz lida em `FileExplorer.tsx`'s `triggerCreate`: hoje só usa o nó focado/ativo como pasta-alvo se ele for uma pasta **E já estiver expandida** (`node?.isDir && expandedPaths.has(node.path)`) — se o usuário seleciona uma pasta colapsada e clica em "Novo Arquivo", o código cai no `else` e cria o item como **irmão** da pasta selecionada (no pai dela), não dentro dela. Fix: usar a pasta selecionada como alvo sempre que ela for um diretório, independente de estar expandida ou não — e expandi-la automaticamente após a criação, pra o item novo ficar visível sem um clique extra. Sem pasta selecionada, continua criando na raiz do workspace (comportamento já correto hoje). Task: `.specs/tasks/contextual-new-item-shortcuts.md`.
- **Corrigido 2026-10-12, pedido do usuário — dois bugs reportados após o shipping dos itens acima.** (1) O fix de 2026-10-11 ainda falhava quando a pasta selecionada tinha um **ancestral colapsado**: `triggerCreate` procurava o nó em `flatList`, que só contém nós **visíveis** (filhos de pastas colapsadas são excluídos) — se o ancestral estava colapsado, `flatList.find` não achava o nó, caía no `else` e criava como irmã de novo. Fix: nova `findNodeByPath`, que busca na árvore inteira (`fileTree.children`), não só nos nós visíveis. (2) Collapse All (ou qualquer collapse manual de pastas de topo) não era preservado: o `useEffect` que auto-expande as pastas de primeiro nível rodava a **cada mudança de `fileTree`**, inclusive quando o watcher de arquivos (`files:changed`, ver entrada acima) reconsultava a árvore por causa de uma mudança externa no disco — isso reexpandia tudo que o usuário tinha acabado de colapsar. Fix: um ref (`expandedWorkspaceRef`) guarda o path do workspace já auto-expandido; o auto-expand de pastas de topo só roda na primeira carga de cada workspace, nunca mais depois, mesmo que a árvore seja reconsultada várias vezes. Task: `.specs/tasks/file-watching-auto-reload.md` (regressão descoberta durante a verificação do usuário).
- **Corrigido 2026-10-12, pedido do usuário — input de criação inline aparecia sempre no topo da árvore, mesmo criando dentro de uma subpasta.** O arquivo era criado no lugar certo (parentDir correto, ver entrada acima), mas o input de nome ficava fixo antes de `renderNodes(fileTree.children, 0)`, sem relação visual com a pasta-alvo — confuso quando a pasta selecionada não é de topo. Fix: `renderCreatingRow` virou uma função posicional, chamada no lugar certo — na raiz (antes dos nós de topo) só quando `creating.parentDir` é a raiz do workspace, e dentro de `renderDir` (depois do próprio nó da pasta, antes de `renderNodes` dos filhos) quando `creating.parentDir` é aquela pasta — com a indentação (`paddingLeft`) da profundidade real. `triggerCreate` agora também expande a pasta-alvo imediatamente ao abrir o input (não só depois de `commitCreate`), senão a linha ficaria escondida numa pasta colapsada.
- **Implementado 2026-10-12, pedido do usuário — modal de confirmação ao salvar por cima de uma mudança externa.** Antes, salvar (`Cmd/Ctrl+S`) uma aba com `tab.externallyChanged: true` sobrescrevia o disco direto, sem avisar, descartando a mudança externa silenciosamente (só o indicador `⟳` na aba sinalizava o conflito antes do save). Agora `EditorPane.tsx` separa a escrita em disco (`performSave(tabId)`, relê a aba da store pelo id na hora de salvar, não um snapshot capturado no keydown) do próprio atalho: se `tab.externallyChanged`, abre um modal (`overwriteConfirm`, novas classes `.modal-overlay`/`.modal-dialog-*` em `components.css` — um modal de verdade, centralizado na tela, diferente do `.ft-confirm-overlay` sticky já existente pro delete do explorer) avisando que o arquivo mudou por fora e que salvar agora sobrescreve essa mudança; só grava no disco e limpa `externallyChanged` se o usuário confirmar ("Salvar mesmo assim"). Cancelar fecha o modal sem tocar no disco nem no estado da aba. Ainda fora de escopo: diff/merge entre a versão local e a externa — só o aviso binário salvar-ou-não.
