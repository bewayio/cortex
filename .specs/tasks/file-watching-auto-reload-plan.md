---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 2
connections:
  parent: .specs/tasks/file-watching-auto-reload.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Observar mudanças externas no disco

## Task vinculada

`.specs/tasks/file-watching-auto-reload.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** Backend (watcher) precisa existir antes do frontend consumir o evento — dependência sequencial clara.

## Definição de Pronto — confirmado

- Project DNA, architecture overview, `.specs/modules/files.md` lidos.
- Confirmado por leitura: `fsnotify` não é dependência hoje (`go.mod`) — precisa ser adicionada. `*App` (app.go) não tem nenhum campo de watcher ainda.
- Sem tasks bloqueantes.

## Decisões de planejamento

- **Debounce no backend**, não no frontend — acumula paths alterados numa janela curta (ex: 300ms) antes de emitir `files:changed`, reduz ruído na ponte Wails em vez de deixar o frontend filtrar evento por evento.
- **Diretórios ignorados por padrão**: `.git`, `node_modules` (e equivalentes óbvios) não entram no watch recursivo — ruído alto, sem valor pro usuário. Lista fixa pra v1, não configurável.
- **Árvore**: refaz `GetFileTree` por completo a cada evento (já aceito como ok pra v1 no critério de aceite) — não otimizado pra atualização incremental por diretório.
- **Indicador de conflito** (aba com alteração local + arquivo mudou por fora): um `externallyChanged?: boolean` novo em `EditorTab`, mostrado como um pequeno indicador discreto na aba (estilo a reusar do `tab-modified` existente, cor diferente) — detalhe visual exato é implementação, não fixado aqui.

## Fases

### Fase 1 — Backend: watcher recursivo + evento debounced (M)

- `go get github.com/fsnotify/fsnotify`.
- `*App` ganha campos pro watcher atual (`fsWatcher *fsnotify.Watcher`, mutex, root atual).
- Novo método `WatchWorkspace(root string) error`: fecha o watcher anterior se existir, cria um novo, adiciona `root` e todas as subpastas recursivamente (fsnotify não é recursivo nativo — precisa andar a árvore manualmente), ignorando `.git`/`node_modules`.
- Goroutine de leitura dos eventos do watcher: acumula paths alterados numa janela de debounce (~300ms via timer), emite `runtime.EventsEmit(a.ctx, "files:changed", paths)` quando a janela fecha. Uma pasta nova criada (`fsnotify.Create` num diretório) é adicionada dinamicamente ao watcher, pra continuar observando o que for criado dentro dela depois.
- Dependência: nenhuma (primeira fase).

### Fase 2 — Frontend: inicia o watcher ao abrir/trocar de workspace (S)

- `App.tsx`'s `handleOpenWorkspace` chama `WatchWorkspace(ws.path)` (fire-and-forget) logo após `switchWorkspace`/`setCurrentWorkspace`.
- O mesmo na restauração de startup (`init()`), pro último workspace reaberto.
- `WatchWorkspace` já fecha o watcher anterior sozinho (Fase 1) — frontend não precisa de uma chamada de "parar" separada.
- Dependência: Fase 1.

### Fase 3 — Frontend: árvore atualiza sozinha (S)

- `App.tsx` (ou um hook dedicado) registra `EventsOn('files:changed', ...)` uma vez, com `EventsOff` no cleanup; ao disparar, rechama `GetFileTree(currentWorkspace.path)` e `setFileTree`.
- Dependência: Fase 2.

### Fase 4 — Frontend: abas abertas recarregam sozinhas (sem alteração local) (M)

- Novo `editorStore.ts` action `reloadTabContent(id, content)`: seta `content` E `originalContent` pro novo valor, `isModified: false`, `externallyChanged: false` — distinto de `updateTabContent` (que marca modificado), já que aqui o conteúdo vem do disco, não de digitação do usuário.
- No mesmo handler de `files:changed` da Fase 3: pra cada aba real (tem `path`, não é `isCommitTab`/`isGraphTab`/`isUsageTab`/`isQueryTab`/etc.) cujo path está entre os alterados — se `!tab.isModified`, `ReadFile` de novo e `reloadTabContent`; se `tab.isModified`, só seta `externallyChanged: true` (novo campo em `EditorTab`, `types.ts`), sem mexer no conteúdo.
- Dependência: Fase 3 (mesmo handler de evento).

### Fase 5 — Frontend: indicador discreto de conflito (S)

- `EditorTabBar.tsx`: pequeno indicador visual quando `tab.externallyChanged` (reusa o espírito do `.tab-modified` já existente, estilo/cor diferente pra distinguir "você mudou" de "mudou por fora enquanto você tinha alteração não salva").
- Salvar a aba (`Cmd/Ctrl+S`, já existente) limpa `externallyChanged` junto com `isModified` — o save sobrescreve o disco, o conflito deixa de existir.
- Dependência: Fase 4.

### Fase 6 — Verificação (S)

- `go build`/`vet`/`fmt`, `tsc --noEmit`, `vite build`.
- Teste Go descartável pro watcher: cria um diretório temporário, chama `WatchWorkspace`, escreve/cria/remove arquivos nele, confirma que `files:changed` dispara (via um canal/callback de teste, não via `runtime.EventsEmit` real já que não há contexto Wails em teste) com os paths esperados, debounced corretamente.
- Verificação manual em `wails dev` sinalizada como necessária do usuário (editar um arquivo aberto por fora, criar um arquivo novo por fora, confirmar reload automático e atualização da árvore) — não tenho ferramenta de automação de GUI aqui.
- Dependência: Fases 1–5.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Backend watcher + debounce | M |
| 2. Inicia watcher no frontend | S |
| 3. Árvore atualiza sozinha | S |
| 4. Abas recarregam sozinhas | M |
| 5. Indicador de conflito | S |
| 6. Verificação | S |

## Fora de Escopo

Igual à task vinculada: resolução de conflito sofisticada (diff/merge), observar pastas fora do workspace atual.

## Status

Todas as 6 fases implementadas 2026-10-11. Ver `.specs/tasks/file-watching-auto-reload.md` pros critérios de aceite verificados vs. pendentes.

## Próximo Passo

Rodar `bsdd finish` quando o usuário confirmar o comportamento interativo no `wails dev`.
