---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-14
version: 2
connections:
  parent: .specs/tasks/connection-context-menu-edit.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Menu de contexto da conexão ganha "Editar"

## Task vinculada

`.specs/tasks/connection-context-menu-edit.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** Fase única — um item de menu chamando uma função já existente (`startEdit`).

## Definição de Pronto — confirmado

- `.specs/modules/database.md` lido.
- Causa raiz já confirmada por leitura de código na própria task: `ctxMenu` em `DatabasePanel.tsx` só tem "Rename"/"Reconnect" pra `kind === 'connection'`; `startEdit(conn)` já existe e já é usado pelo ícone de lápis da linha.
- Sem tasks bloqueantes.

## Fases

### Fase 1 — Item de menu "Editar" (S) ✅ feita 2026-10-14

- `DatabasePanel.tsx`'s bloco `{ctxMenu.kind === 'connection' && (...)}` (hoje só com "Reconnect") ganha uma entrada "Editar" (ícone `Pencil`, mesmo já usado no botão da linha), chamando `startEdit(connections.find(c => c.id === ctxMenu.id))` e fechando o menu.
- Nova chave de tradução (`database:panel.edit`, já existe — reaproveitada, usada hoje só no `title` do botão de lápis).
- Dependência: nenhuma (fase única).

### Fase 2 — Verificação (S) ✅ feita 2026-10-14

- `tsc --noEmit`, `vite build`.
- Dependência: Fase 1.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Item de menu "Editar" | S |
| 2. Verificação | S |

## Fora de Escopo

Igual à task vinculada.

## Status

Todas as 2 fases implementadas 2026-10-14.
