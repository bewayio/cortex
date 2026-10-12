---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-12
version: 4
connections:
  parent: .specs/tasks/i18n-full-app.md
  children: []
  related_adrs: [0007]
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: i18n para todo o app (pt-BR, Español, en-US)

## Task vinculada

`.specs/tasks/i18n-full-app.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** As fases têm uma dependência de infraestrutura clara (nada migra texto sem `t()` existir primeiro) e o volume por fase, embora grande no total, não exige paralelização — cada área é tratada em sequência pelo mesmo agente, reduzindo risco de divergência de convenção entre áreas (nome de namespace, estilo de chave, etc.).

## Definição de Pronto — confirmado

- Project DNA, architecture overview, `.specs/modules/shell.md` lidos.
- ADR-0007 revisado (title bar única, mesma aparência em todo sistema — relevante pro texto do menu/modal, tratado na task irmã).
- Confirmado por leitura: nenhuma dependência de i18n existe hoje (`frontend/package.json`); todo texto está hardcoded nos componentes.
- Sem tasks bloqueantes.

## Decisões de planejamento

- **Biblioteca**: `react-i18next` + `i18next` (recomendação do assistente, não pedido explícito do usuário — padrão de facto em React, suporta namespaces e troca de idioma em tempo real sem reload).
- **Organização dos arquivos de recurso**: um diretório por idioma (`frontend/src/locales/{pt-BR,es,en-US}/`), um arquivo JSON por namespace/área (`shell.json`, `explorer.json`, `database.json`, `terminal.json`, `git.json`, `usage.json`, `common.json` pra strings genéricas tipo "Cancelar"/"Salvar"/"Fechar") — não um arquivo monolítico, pra manter navegável à medida que cresce.
- **Detecção + persistência**: lê `navigator.language` só quando não há preferência salva em `localStorage` (`bcode.language`); mapeia pro mais próximo dos 3 idiomas suportados (prefixo `pt` → pt-BR, `es` → es, qualquer outro → en-US); depois que o usuário troca manualmente (via o modal de configurações da task irmã), a preferência salva sempre vale, a detecção nunca mais roda.
- **Ordem de migração por área**: shell (title bar, activity bar, sidebar, status bar, workspace list, project switcher) primeiro — é a superfície mais visível e mais simples, serve de validação do padrão de uso do `t()` antes de espalhar pras áreas maiores (database, principalmente). Database é a maior superfície (toolbar, menus de contexto, mensagens de erro de UI, grid de resultados) — fica por último entre as áreas de conteúdo antes só da verificação final.
- **Escopo explícito do que conta como "texto visível"**: labels de botão, tooltips, `aria-label`, placeholders de input, mensagens de confirmação/erro mostradas na UI, texto de estado vazio. Não inclui: `console.error`/`console.log`, comentários, nomes de arquivo/classe CSS, conteúdo vindo de dados do usuário.

## Fases

### Fase 1 — Infraestrutura de i18n (M) ✅ feita 2026-10-12

- `npm install react-i18next i18next` em `frontend/`.
- Inicialização (`frontend/src/i18n.ts` ou similar), importado uma vez perto da raiz (`main.tsx`).
- Estrutura de diretórios de recursos (`frontend/src/locales/{pt-BR,es,en-US}/common.json` pra começar — outros namespaces criados conforme cada fase de migração precisar).
- Lógica de detecção + persistência: um pequeno util (`utils/i18n-language.ts` ou dentro do próprio `i18n.ts`) que resolve o idioma inicial (preferência salva > detecção > en-US) e expõe uma função `setLanguage(lang)` que persiste em `localStorage` e chama `i18next.changeLanguage`.
- Sem UI ainda nesta fase — só a fundação que as fases seguintes (e a task irmã do menu/modal) vão consumir.
- Dependência: nenhuma (primeira fase).

### Fase 2 — Migração: área shell (L) ✅ feita 2026-10-12

- Componentes: `TitleBar.tsx`, `ActivityBar.tsx`, `Sidebar.tsx`, `StatusBar.tsx`, `WorkspaceList.tsx`, `ProjectSwitcher.tsx`.
- Todo texto visível (tooltips dos botões de janela, rótulos da activity bar, cabeçalhos de painel, mensagens do workspace list, etc.) migra pra `t('shell:...')`.
- Dependência: Fase 1.

### Fase 3 — Migração: editor e arquivos (M) ✅ feita 2026-10-12

- Componentes: `EditorPane.tsx` (inclui o modal de "arquivo alterado por fora", 2026-10-12), `EditorTabBar.tsx`, `FileExplorer.tsx` (menus de contexto, diálogo de confirmação de delete, placeholders de criação/rename), `FileSearch.tsx`, `MarkdownPreview.tsx`, `DiffViewer.tsx`.
- Dependência: Fase 1.

### Fase 4 — Migração: git (S) ✅ feita 2026-10-12

- Componentes: `GitPanel.tsx`, `CommitDiffView.tsx`, `CommitGraphTab.tsx`, `CommitGraph.tsx`.
- Dependência: Fase 1.

### Fase 5 — Migração: database (L) ✅ feita 2026-10-12

- Componentes: `DatabasePanel.tsx`, `DatabaseTablesTab.tsx`, `TableProperties.tsx`, `TableTab.tsx`, `QueryTab.tsx`, `QueryResultsGrid.tsx`, `QuerySearch.tsx`.
- Maior superfície de texto solto do app (toolbar, menus de contexto, mensagens de erro de UI, cabeçalhos de grid).
- Dependência: Fase 1.

### Fase 6 — Migração: terminal, chat e usage (M) ✅ feita 2026-10-12 (chat: `ClaudeChatPanel.tsx` confirmado morto — não importado em nenhum lugar, pulado; ver nota na task)

- Componentes: `Terminal.tsx` (rótulos/menus de aba), `ClaudeChatPanel.tsx`, `UsageTab.tsx`.
- Dependência: Fase 1.

### Fase 7 — Migração: command palette e utilitários (S) ✅ feita 2026-10-12 (inclui `utils/diagrams.ts`, achado durante a varredura final — Mermaid/PlantUML tinham texto solto não listado no plano original)

- `CommandPalette.tsx` e as definições de comando em `utils/commands.ts` (rótulos de cada comando), mais qualquer string solta remanescente em `utils/globalEditorShortcuts.ts`/`utils/newItemShortcut.ts`.
- Feita por último entre as migrações porque o command palette referencia nomes de ações de várias áreas — mais fácil garantir que as chaves já existem (criadas nas fases 2–6) do que inventar chaves novas aqui.
- Dependência: Fases 2–6.

### Fase 8 — Verificação (S) ✅ feita 2026-10-12

- `tsc --noEmit`, `vite build` limpos.
- Varredura final por `grep` de strings JSX suspeitas (texto solto entre tags) nos componentes listados acima, pra pegar qualquer coisa que escapou da migração por fase.
- Verificação manual do usuário: trocar entre os 3 idiomas (pelo modal da task irmã) e conferir a troca visual em cada área — sem ferramenta de automação de GUI aqui.
- Dependência: Fases 1–7.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Infraestrutura | M |
| 2. Shell | L |
| 3. Editor e arquivos | M |
| 4. Git | S |
| 5. Database | L |
| 6. Terminal, chat, usage | M |
| 7. Command palette e utils | S |
| 8. Verificação | S |

## Fora de Escopo

Igual à task vinculada: traduzir mensagens de erro/log do backend Go, idiomas RTL, idiomas além dos 3 pedidos agora.

## Relação com a task irmã

`.specs/tasks/window-menu-and-settings-modal-plan.md` depende da **Fase 1** deste plano (infraestrutura de i18n) pra implementar a seção "Idioma" do modal de configurações — as duas podem rodar em paralelo depois que a Fase 1 aqui terminar, mas como o modelo de execução é single-agent nas duas, a ordem prática recomendada é: Fase 1 deste plano → fases do plano do menu/modal → fases 2–8 restantes deste plano (migração de texto, que não bloqueia nem é bloqueada pelo menu/modal).

## Status

Todas as 8 fases implementadas 2026-10-12. Ver `.specs/tasks/i18n-full-app.md` pros critérios de aceite verificados.
