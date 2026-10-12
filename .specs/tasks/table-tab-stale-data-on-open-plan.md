---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-12
version: 2
connections:
  parent: .specs/tasks/table-tab-stale-data-on-open.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Aba de tabela mostra dados da tabela anterior

## Task vinculada

`.specs/tasks/table-tab-stale-data-on-open.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** Fix pequeno (uma linha) com causa raiz já diagnosticada na captura da task — não há fases paralelizáveis que valham a pena.

## Definição de Pronto — confirmado

- `.specs/modules/database.md` lido.
- Causa raiz já confirmada por leitura de código na própria task: `EditorPane.tsx` renderiza `<TableTab tab={activeTab} />` sem `key`, e `TableTab.tsx`'s `useEffect` de carga inicial (guardado por `initDoneRef`, deps vazias) só roda uma vez por instância — instância reaproveitada entre abas de tabela sem `key` nunca recarrega.
- Sem tasks bloqueantes.

## Decisão de planejamento

- **Fix**: adicionar `key={activeTab.id}` em `<TableTab tab={activeTab} />` (`EditorPane.tsx`), mesmo padrão já usado pelo `MonacoEditor` logo abaixo na mesma função. Força remount completo por aba — reseta `initDoneRef`, `result`, `filterInput`, `subTab`, `pendingQuery`/`pendingEstimate` de uma vez, sem precisar tocar na lógica interna de `TableTab.tsx`.
- **Por que não ajustar os deps do `useEffect` em vez de usar `key`**: trocar `initDoneRef`/deps vazias por `[tab.dbConnectionId, tab.dbDatabase, tab.dbTable]` teria o mesmo efeito prático, mas não reseta o resto do estado da aba (filtro digitado, sub-aba ativa) — o usuário trocando de tabela esperaria uma aba "nova", não uma que preserva filtro de uma tabela diferente. `key` é a correção mais completa e mais barata.

## Fases

### Fase 1 — Fix + verificação (S) ✅ feita 2026-10-12

- `EditorPane.tsx`: `<TableTab key={activeTab.id} tab={activeTab} />`.
- Teste manual mental/por leitura: confirmar que `TableTab.tsx` não guarda nenhum estado em um nível acima do componente (ex: módulo, store) que sobreviveria ao remount e continuaria vazando — revisão rápida do arquivo confirma que todo estado relevante (`result`, `filterInput`, `subTab`, `pendingQuery`, `initDoneRef`) é local ao componente via `useState`/`useRef`, então o remount resolve sozinho.
- Confirmar que `QueryTab`/`CommitDiffView`/`DatabaseTablesTab` não regridem — nenhuma mudança foi feita nessas linhas, risco é zero, mas vale conferir visualmente no `wails dev`.
- `tsc --noEmit`, `vite build`.
- Dependência: nenhuma (única fase).

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Fix + verificação | S |

## Fora de Escopo

Igual à task vinculada.

## Status

Fase única implementada 2026-10-12. Ver `.specs/tasks/table-tab-stale-data-on-open.md` pros critérios de aceite verificados.
