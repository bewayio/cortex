---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-12
version: 3
connections:
  parent: .specs/modules/database.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Aba de tabela mostra dados da tabela anterior

## Status

`in-progress` — fix implementado 2026-10-12 (ver `.specs/tasks/table-tab-stale-data-on-open-plan.md`); não marcada `done` só porque a verificação interativa em `wails dev` precisa do usuário (sem ferramenta de automação de GUI aqui).

## Objetivo

Corrigir bug: ao abrir uma segunda (ou qualquer subsequente) aba de tabela via duplo clique na árvore do banco de dados, ela mostra os registros da **tabela aberta anteriormente**, não os dela própria — até o usuário interagir manualmente (ex: digitar um filtro).

## Contexto

Pedido do usuário, 2026-10-12: "Quando é aberta uma primeira tabela é mostrado os registros da mesma, todas as demais que são abertas, mostra os dados da anterior."

**Causa raiz identificada por leitura de código** (não implementado ainda, só diagnosticado):

- `EditorPane.tsx` renderiza `<TableTab tab={activeTab} />` **sem `key`** (linha ~123) — ao contrário do `<MonacoEditor key={activeTab.id} ... />` logo abaixo, que já tem esse `key` exatamente pra forçar remount por aba.
- Sem `key`, React reaproveita a mesma instância de `TableTab` ao trocar entre abas de tabela (mesmo tipo de componente) — só os `props` (`tab`) mudam, o componente não desmonta/remonta.
- `TableTab.tsx` carrega os dados iniciais assim:
  ```ts
  const initDoneRef = useRef(false)
  useEffect(() => {
    if (initDoneRef.current) return
    initDoneRef.current = true
    runGated('')
  }, []) // deps vazias — roda só uma vez por INSTÂNCIA do componente
  ```
  Como a instância é reaproveitada entre abas (efeito do item acima), `initDoneRef.current` já é `true` a partir da segunda tabela aberta — o carregamento inicial nunca dispara de novo, e o `result` (estado React) continua sendo o da tabela anterior, exibido até o usuário rodar alguma query manualmente (filtro, ou trocar de sub-aba Data/Properties e voltar).
- Mesmo padrão de bug já visto e corrigido para o `MonacoEditor` nesse mesmo arquivo (é por isso que ele já tem `key={activeTab.id}`) — `TableTab` e `DatabaseTablesTab`/`QueryTab`/`CommitDiffView` também são renderizados sem `key`, mas não têm o mesmo problema: `CommitDiffView` recarrega via `useEffect([hash, workspaceRoot])`, `DatabaseTablesTab` via `useEffect([connectionId, database])`, e `QueryTab` nunca dependeu de um carregamento único — só `TableTab` tem esse padrão de "efeito de montagem única" (`initDoneRef`), por isso só ele tem o bug.

## Critérios de Aceite

- [x] Abrir uma tabela qualquer mostra os dados dela mesma, não os da tabela aberta anteriormente — fix: `<TableTab key={activeTab.id} tab={activeTab} />` em `EditorPane.tsx`, força remount completo por aba (mesmo padrão já usado pelo `MonacoEditor` logo abaixo).
- [x] O filtro (`WHERE ...`) de uma aba de tabela não vaza pra outra — resolvido pelo mesmo remount (`filterInput` é `useState` local, reseta ao montar).
- [x] A sub-aba ativa (Data/Properties) não vaza de uma aba de tabela pra outra — mesmo motivo (`subTab` também é `useState` local).
- [x] Nenhuma mudança em `QueryTab`/`CommitDiffView`/`DatabaseTablesTab` — só a linha do `TableTab` foi tocada.
- [x] Verificação: `tsc --noEmit`, `vite build` limpos.
**Não verificado por mim** (sem ferramenta de automação de GUI aqui): abrir várias tabelas em sequência de verdade em `wails dev` e conferir que cada uma mostra seus próprios dados.

## Módulos Afetados

- `database` (`TableTab.tsx`, renderizado por `EditorPane.tsx` — módulo `shell`/`files` na prática, mas o bug em si é 100% da feature de tabela do `database`)

## Fora de Escopo

- Qualquer mudança no comportamento de `QueryTab`/`CommitDiffView`/`DatabaseTablesTab` (não têm o bug).

## Próximo Passo

Rodar `bsdd plan` pra transformar isso num plano de implementação — dado o tamanho (provável fix de uma linha, `key={activeTab.id}` em `EditorPane.tsx`, mais verificação de que nenhum outro estado vaza), é uma boa candidata a pular pra `bsdd start` direto se o usuário preferir não formalizar um plano pra algo desse tamanho.
