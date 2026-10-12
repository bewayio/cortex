---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-12
version: 5
connections:
  parent: .specs/modules/shell.md
  children: []
  related_adrs: [0007]
  sync_triggers:
    - Status change
---

# Task: i18n para todo o app (pt-BR, Español, en-US)

## Status

`in-progress` — todas as 8 fases implementadas 2026-10-12 (ver `.specs/tasks/i18n-full-app-plan.md`); não marcada `done` só porque a verificação interativa em `wails dev` (trocar idioma e conferir a troca visual em cada área) precisa do usuário (sem ferramenta de automação de GUI aqui).

## Objetivo

Adicionar suporte a múltiplos idiomas (pt-BR, Español, en-US) ao app inteiro: biblioteca de i18n, arquivos de tradução pros 3 idiomas, detecção de idioma na primeira abertura, e todo texto solto e visível ao usuário no frontend passando a vir do i18n em vez de string fixa no código.

## Contexto

Pedido do usuário, 2026-10-12, junto com o pedido de um menu de janela com modal de configurações (ver `.specs/tasks/window-menu-and-settings-modal.md` — a seção "Idioma" desse modal depende desta task existir). Hoje o app não tem nenhuma infraestrutura de i18n — todo texto (pt-br e inglês misturados, conforme o autor de cada trecho) está hardcoded nos componentes.

**Decisões já confirmadas com o usuário:**
- **Idioma padrão na primeira abertura** (sem preferência salva ainda): detecta do sistema operacional (via `navigator.language` no WebView — não precisa de chamada ao backend Go, o WebView já reflete o locale do SO); cai para **en-US** se o locale detectado não bater com nenhum dos 3 suportados. Depois que o usuário troca manualmente nas configurações, a escolha dele sempre vale (persistida, nunca mais recalculada pela detecção).
- Local de persistência: `localStorage`, mesma convenção das outras preferências de UI já existentes (`bcode.*`, módulo `shell` — ver `.specs/modules/shell.md`'s Boundaries). Chave sugerida: `bcode.language`.

**Decisão técnica (minha recomendação, não perguntei — biblioteca de i18n):** `react-i18next` + `i18next`. É o padrão de facto pra i18n em React, suporta interpolação, namespaces/organização por seção, e troca de idioma em tempo real sem reload (`i18next.changeLanguage`). Nenhuma outra lib de i18n foi cogitada — se o usuário preferir uma alternativa mais leve (ex: solução própria baseada só em um dicionário + hook), avisar antes de implementar.

## Critérios de Aceite

- [x] `react-i18next`/`i18next` adicionados como dependência; inicialização uma vez, perto da raiz do app (`frontend/src/i18n.ts`, importado em `main.tsx`).
- [x] Arquivos de recursos de tradução — pt-BR, es, en-US — organizados por namespace/seção (`frontend/src/locales/{pt-BR,es,en-US}/{common,shell}.json` criados na Fase 1; demais namespaces — `explorer`, `database`, `terminal`, `git`, `usage` — criados conforme cada fase de migração precisar), não um arquivo monolítico único.
- [x] Detecção de idioma na primeira abertura (sem preferência salva): lê `navigator.language` (`i18n.ts`'s `detectLanguage`), mapeia pro mais próximo dos 3 idiomas suportados, cai pra en-US sem match. Preferência salva (`localStorage`, `bcode.language`) sempre tem prioridade sobre detecção, em qualquer abertura seguinte.
- [x] Trocar o idioma nas configurações (modal de settings, task irmã) atualiza todo texto visível imediatamente, sem precisar recarregar o app (`i18next.changeLanguage`, sem estado próprio pra re-render — os componentes usam `useTranslation()`, que já se inscreve no evento de troca).
- [x] **Auditoria completa de texto solto**: todo texto visível ao usuário no frontend passa a vir do i18n (`t('...')`). Componentes migrados, por namespace de tradução (`frontend/src/locales/{pt-BR,es,en-US}/*.json`):
  - `shell`: `TitleBar.tsx`, `ActivityBar.tsx`, `Sidebar.tsx`, `StatusBar.tsx`, `WorkspaceList.tsx` (`ProjectSwitcher.tsx` já não tinha texto solto — só dados).
  - `editor`: `EditorPane.tsx` (inclui o modal de "arquivo alterado por fora", 2026-10-12), `EditorTabBar.tsx`, `MarkdownPreview.tsx`, `utils/diagrams.ts` (Mermaid/PlantUML — achado na varredura final, fora da lista original do plano). `DiffViewer.tsx` não tinha texto solto.
  - `explorer`: `FileExplorer.tsx` (menus de contexto, confirmação de delete, placeholders de criação), `FileSearch.tsx`.
  - `git`: `GitPanel.tsx`, `CommitDiffView.tsx`, `CommitGraphTab.tsx` (`CommitGraph.tsx` não tinha texto solto, só dados).
  - `database`: `DatabasePanel.tsx` (933 linhas, a maior superfície — menus de contexto, formulário de conexão, pastas, confirmações), `TableProperties.tsx` (seções/colunas/estatísticas viraram chaves de tradução, antes eram um array `const` no módulo — precisou mover pra dentro do componente), `TableTab.tsx`, `QueryTab.tsx`, `QueryResultsGrid.tsx` (com pluralização real via `_one`/`_other` do i18next pra "row(s)"/"match(es)"), `QuerySearch.tsx` (`DatabaseTablesTab.tsx` não tinha texto solto).
  - `terminal`: `Terminal.tsx` (só 2 strings soltas — o resto já não tinha).
  - `usage`: `UsageTab.tsx` (cabeçalho, gráfico, atalhos).
  - `commandPalette`: `CommandPalette.tsx` + `utils/commands.ts` (lista de comandos, antes um array `const` com labels fixos — `buildCommands` agora chama `i18n.t` direto, já que não é um componente React).
  - **Decisão de escopo durante a implementação**: nomes de aba internos (`EditorTab.name`, ex: "Home", "Git Graph", "New Query", "Untitled query" usado como fallback de nome) ficaram de fora — são identificadores de dados (persistidos, usados em lookups), não só rótulos de UI; traduzi-los exigiria um refactor maior (guardar uma chave de tradução em vez do texto final) fora do escopo pedido. O que É puramente visual (tooltips, botões, menus, mensagens) foi todo migrado.
  - **`ClaudeChatPanel.tsx` pulado deliberadamente**: confirmado via busca por import que não é referenciado em nenhum lugar do app (`App.tsx` nem em nenhum outro componente) — código morto, nunca renderizado. Traduzir texto que ninguém vê não tem valor; mantido como está.
- [x] **Fora do escopo da auditoria** (não precisou i18n): mensagens de `console.error`/`console.log`, comentários de código, nomes de arquivo/variável, nomes de classe CSS, texto que vem de dados do usuário (nome de arquivo, conteúdo de query, etc.), palavras-chave SQL (`sqlAutocomplete.ts` — universais, não se traduzem).
- [x] Verificação: `tsc --noEmit`, `vite build`, `go build ./...`, `go vet ./...`, `gofmt` todos limpos (sem mudança no backend Go nesta task). Varredura final por `grep` confirmou nenhum texto JSX solto restante fora do `ClaudeChatPanel.tsx` morto.
**Não verificado por mim** (sem ferramenta de automação de GUI aqui): trocar entre os 3 idiomas de verdade em `wails dev` e conferir a troca visual em cada área do app.

## Módulos Afetados

- `shell` (principal — dona da infraestrutura de i18n e da preferência de idioma, mesma lógica de UI prefs já existente)
- Praticamente todos os módulos com componentes de frontend (`files`, `git`, `terminal`, `chat`, `usage`, `database`) — só o texto renderizado pelos componentes muda (migra pra `t('...')`), nenhuma interface pública/contrato de backend muda.

## Fora de Escopo

- Traduzir mensagens de erro/log do backend Go.
- Idiomas RTL.
- Adicionar mais idiomas além dos 3 pedidos agora (a estrutura deve facilitar adicionar depois, mas não é requisito desta task).

## Próximo Passo

Rodar `bsdd plan` pra transformar isso num plano de implementação — dado o tamanho (auditoria de texto em praticamente todo componente do frontend), bsdd plan deve considerar quebrar em fases por área (ex: shell/title bar primeiro, depois file explorer + sidebar, depois database, depois terminal/chat, etc.).
