---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 4
connections:
  parent: .specs/modules/files.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Observar mudanças externas no disco (abas abertas + árvore de arquivos)

## Status

`in-progress` — todas as 6 fases implementadas (ver `.specs/tasks/file-watching-auto-reload-plan.md`); não marcada `done` só porque a verificação interativa em `wails dev` precisa do usuário (sem ferramenta de automação de GUI aqui).

## Objetivo

Quando um arquivo muda no disco por fora do app (outro editor, `git checkout`, um script, etc.), uma aba aberta desse arquivo deve se atualizar sozinha — mas só se não tiver alteração local não salva. Quando um arquivo é criado, removido ou renomeado no workspace por fora, a árvore do explorer deve refletir isso sem precisar de um reload manual.

## Contexto

Pedido do usuário, 2026-10-11. Hoje não existe nenhum watcher de arquivos no backend — `files.md`'s interface pública não tem nada parecido. Ver `.specs/modules/files.md`, notas de 2026-10-11, para o racional completo e a decisão já confirmada com o usuário sobre o caso de conflito (aba com alteração local não salva: não recarrega sozinho).

## Critérios de Aceite

- [x] Novo método de backend `WatchWorkspace(root)` (`watcher.go`) inicia um watcher recursivo na pasta do workspace atual (`fsnotify`, andando a árvore à mão já que fsnotify não é recursivo nativo; pastas criadas depois são adicionadas dinamicamente no loop de eventos).
- [x] O watcher publica `files:changed` (lista de paths) quando algo muda dentro do workspace observado — criação, remoção, renomeação e modificação de conteúdo (qualquer evento fsnotify entra no debounce).
- [x] Eventos em rajada são debounced (300ms) — verificado com teste: 5 escritas em sequência viram exatamente 1 evento.
- [x] Trocar de workspace para de observar o anterior (`WatchWorkspace` fecha o watcher anterior antes de abrir o novo) e passa a observar o novo — chamado tanto em `handleOpenWorkspace` quanto na restauração de startup.
- [x] Uma aba aberta cujo arquivo mudou no disco, **sem alteração local não salva**, recarrega o conteúdo automaticamente (`reloadTabContent`, novo action em `editorStore.ts`).
- [x] Uma aba aberta cujo arquivo mudou no disco, **com alteração local não salva**, não tem o conteúdo sobrescrito — `externallyChanged: true` (novo campo em `EditorTab`), indicador `⟳` discreto na aba (`EditorTabBar.tsx`), limpo ao salvar.
- [x] A árvore do explorer reflete arquivos/pastas criados, removidos ou renomeados por fora — `GetFileTree` reconsultado por completo a cada evento (simples pra v1, conforme decidido no plano).

**Verificado:** `tsc --noEmit`, `vite build`, `go build ./...`, `go vet ./...`, `gofmt`, `wails build` todos limpos. Teste Go descartável confirmou: debounce (rajada de 5 escritas → 1 evento) e detecção dinâmica de pasta criada depois do `WatchWorkspace` inicial (arquivo dentro dela também dispara).
**Não verificado por mim** (sem ferramenta de automação de GUI aqui): editar um arquivo aberto por fora de verdade e ver a aba recarregar; criar um arquivo novo por fora e ver a árvore atualizar; o indicador de conflito aparecendo quando há alteração local não salva.

## Módulos Afetados

- `files` (principal — novo método de backend, novo evento, `FileExplorer.tsx`, `editorStore.ts`/`EditorPane.tsx` pro reload de abas)

## Fora de Escopo

- Resolução de conflito mais sofisticada (diff visual, merge) para abas com alteração local — só o aviso discreto descrito acima.
- Observar pastas fora do workspace atual (ex: arquivos abertos de fora do workspace, se isso existir em algum fluxo).

## Próximo Passo

Rodar `bsdd plan` pra transformar isso num plano de implementação.
