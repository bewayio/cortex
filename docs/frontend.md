# Frontend

Padrões visuais e de frontend do BCode. Fonte: `.specs/ui/design-direction.md`.

## Tokens

Definidos em `frontend/src/styles/theme.css`. Fundo `#1e1e1e`, sidebar `#252526`, accent `#007ACC`, linha de 28px, fonte do sistema 13px.

## Title bar (ADR-0007)

- Uma barra só, igual no Linux, Windows e macOS. Componente `components/TitleBar.tsx`, classe `app-titlebar`.
- Altura pelo token `--titlebar-height` (44px), fundo `#161616`, borda inferior `--divider`.
- Linux e Windows: janela sem moldura (`useFramelessWindow()` em `window_options.go`). A barra desenha minimizar, maximizar/restaurar e fechar à direita.
- macOS: botões nativos (`TitleBarHiddenInset`). A barra reserva 80px à esquerda.
- Arrastar: `--wails-draggable: drag` na barra, `no-drag` nos botões. Não usar `-webkit-app-region`.
- Plataforma: ler só por `utils/platform.ts` (`data-platform` em `<html>`). Componentes não checam o sistema por conta própria.
- Não adicionar outra barra acima do conteúdo.

## Ícone do app

- Fonte única: `build/appicon.png` (1024×1024, fundo transparente). Trocado em 2026-09-25.
- O `wails build` gera o ícone por sistema a partir desse arquivo, no próprio sistema. Um build feito no Linux não atualiza o `.icns` de um `.app` do macOS já existente em `build/bin` — refazer o build no macOS quando o ícone mudar.

## Aba de uso / Home (editor, não sidebar)

- Primeiro botão da `ActivityBar`, ícone `Home` (era `BarChart2`, terceiro, até o rename/reorder de 2026-09-26). Não abre painel de sidebar — abre/foca uma aba no editor (`components/UsageTab.tsx`), estilo página de boas-vindas do VS Code. Mesmo padrão de aba única já usado pelo Git Graph (`isGraphTab`), agora com `isUsageTab` em `EditorTab`. Identificadores internos (`isUsageTab`, nome do arquivo) mantidos como estão — só o rótulo/ícone visível mudou.
- `Panel` da sidebar é `'explorer' | 'git' | 'database'`. Não recriar um painel de sidebar para a Home — já foi tentado e revertido a pedido do usuário (2026-09-26).
- Gráfico de barras feito à mão (sem biblioteca nova), uma métrica só (total de tokens) por barra, cor `--accent`. Agrupamento dia/semana/mês trocado no cliente a partir dos dados diários vindos do backend.
- Nunca usar tooltip flutuante sobre o gráfico — usar uma caixa de detalhe de altura fixa acima dele (mostra o total geral parado, ou o detalhamento do item sob o mouse). Isso valeu tanto na versão de sidebar (descartada) quanto na aba atual.
- Projetos recentes reaproveita `WorkspaceList.tsx` sem alterações; abrir um projeto por ali é uma ação normal de aba, sem precisar trocar painel nenhum.

## Aba de query MySQL (editor, não singleton)

- Quinto ícone da `ActivityBar` (`Database`) abre o painel `'database'` na sidebar (`components/DatabasePanel.tsx`) — árvore Conexão → Base → Tabelas, sem a seção de `WorkspaceList` compartilhada (conexões são globais, não ligadas a workspace).
- Clicar numa tabela abre uma aba de query (`isQueryTab` em `EditorTab`, `components/QueryTab.tsx`). Diferente das abas singleton (Home, Git Graph), várias abas de query coexistem — `editorStore.openOrFocusTab` só foca uma já aberta quando ela vem da mesma `savedQueryId` (reabertura pela lista de queries salvas), senão sempre cria uma nova.
- Renomear: duplo clique no nome da aba, mesmo padrão do rename de aba de terminal. Só habilitado para `isQueryTab`.
- Autocomplete SQL: `frontend/src/utils/sqlAutocomplete.ts`, um só `registerCompletionItemProvider('sql', ...)` no Monaco, registrado uma vez (não por instância de aba) — lê o contexto (conexão/base) da aba de query **focada no momento**, não da aba que a registrou.
- CSV e "copiar como TSV" são só frontend, a partir do `QueryResult` já em memória na aba — sem chamada nova ao backend. CSV segue RFC 4180 (aspas em valor com vírgula/aspas/quebra de linha).
- **Achado real ao verificar contra um MySQL de verdade**: `RunQuery` decide `Query` ou `Exec` pela palavra inicial do SQL (`statementReturnsRows`, `database.go`), não tentando um e caindo para o outro — o driver do MySQL não dá erro em `Query` para `INSERT`/`UPDATE`/`DELETE`, então tentar-e-cair não funciona, e arriscaria rodar o comando duas vezes.
- **Salvar é sempre ação explícita** (botão ou Cmd/Ctrl+S), nunca automático a cada tecla — um autosave debounced já criou queries salvas sem pedido. Reaproveita `EditorTab.isModified`/`markTabSaved`, o mesmo mecanismo das abas de arquivo.
- **Atalho de teclado dentro do Monaco**: nunca prender num `keydown` de um elemento pai — o Monaco consome boa parte dos eventos antes de borbulhar. Usar `editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.X, ...)` no `onMount` do editor (`MonacoEditor.tsx` tem a prop `onEditorMount` para isso). `KeyMod.CtrlCmd` já é Cmd no mac e Ctrl no Linux/Windows por convenção do próprio Monaco.
- **Executar por cursor/seleção**: `frontend/src/utils/sqlStatements.ts` divide por `;` e acha o statement sob um offset (ou o mais próximo). Sem seleção, roda só o statement do cursor. Com seleção, roda exatamente o texto selecionado — só roda mais de um junto quando a própria seleção contém mais de um separado por `;`.

## Convenções

- Classes CSS em kebab-case com prefixo da área (`app-`, `cc-`). Estilos em `frontend/src/styles`.
- Stores em `frontend/src/stores/xxxStore.ts`.
- Nunca editar `frontend/wailsjs` à mão.
