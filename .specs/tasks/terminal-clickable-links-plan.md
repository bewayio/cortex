---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-14
version: 2
connections:
  parent: .specs/tasks/terminal-clickable-links.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Links clicáveis (Ctrl/Cmd+click) na saída do terminal

## Task vinculada

`.specs/tasks/terminal-clickable-links.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** Escopo pequeno (um link provider do xterm.js + duas ações), sem paralelismo que valha a pena.

## Definição de Pronto — confirmado

- `.specs/modules/terminal.md` lido.
- Confirmado por leitura: xterm.js expõe `Terminal.registerLinkProvider(ILinkProvider)` — `provideLinks(bufferLineNumber, callback)` por linha, `ILink.activate(event, text)` chamado no clique, independente de modificador (a checagem de Ctrl/Cmd é responsabilidade de quem implementa `activate`, não do xterm).
- `Terminal.tsx` hoje não importa `useEditorStore` nem `ReadFile` — vai precisar dos dois pra abrir a aba do arquivo clicado.
- `BrowserOpenURL` já existe em `frontend/wailsjs/runtime/runtime.d.ts`, nenhuma mudança de backend necessária.
- Decisões já confirmadas com o usuário: abrir arquivo = aba no editor do Cortex (não revelar no SO); só caminho absoluto vira link (sem tentar resolver relativo contra o cwd inicial do terminal).
- Sem tasks bloqueantes.

## Fases

### Fase 1 — Link provider (URL + caminho absoluto) (M) ✅ feita 2026-10-14

- Novo `ILinkProvider` registrado em `xterm.registerLinkProvider(...)` dentro de `createTerminal` (`Terminal.tsx`), um por instância de terminal (cada aba de terminal já cria seu próprio `XTerm`).
- `provideLinks` roda duas regex na linha do buffer: uma pra `https?:\/\/\S+`, outra pra caminho absoluto (`^\/\S+` ou `~\/\S+` no Linux/macOS, `[A-Za-z]:\\\S+` no Windows) — cada match vira um `ILink` com o `range` certo (posição de buffer, não de string — atenção às colunas 1-based do xterm).
- `activate(event, text)`: se `event.ctrlKey` (ou `event.metaKey` no macOS, via `usePlatform()` já usado em outro lugar do arquivo) não estiver pressionado, não faz nada (deixa a seleção normal de texto acontecer). Com o modificador: se o texto bate com o regex de URL, chama `BrowserOpenURL(text)`; se bate com o de caminho absoluto, segue pra Fase 2.
- Dependência: nenhuma (primeira fase).

### Fase 2 — Abrir arquivo clicado numa aba do editor (S) ✅ feita 2026-10-14

- Import de `useEditorStore` (`openOrFocusTab`) e `ReadFile` (`wailsjs/go/main/App`) em `Terminal.tsx`.
- No branch de caminho de arquivo do `activate`: `ReadFile(path)` — sucesso chama `openOrFocusTab` com os mesmos campos já usados pelo clique de arquivo na sidebar (`FileExplorer.tsx`'s `openFile`, mesmo padrão: `path`, `name` via `path.split('/').pop()`, `ext`, `content`, `originalContent: content`, `isModified: false`); falha (arquivo não existe) não faz nada, sem mensagem de erro intrusiva — conforme already decidido na task.
- Dependência: Fase 1 (precisa do link reconhecido e do modificador checado primeiro).

### Fase 3 — Verificação (S) ✅ feita 2026-10-14

- `tsc --noEmit`, `vite build`.
- Verificação manual (clicar um link http de verdade, clicar um caminho de arquivo absoluto de verdade, confirmar que sem o modificador o clique continua sendo seleção normal) precisa do usuário — sem ferramenta de automação de GUI aqui.
- Dependência: Fases 1–2.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Link provider (URL + caminho) | M |
| 2. Abrir arquivo numa aba | S |
| 3. Verificação | S |

## Fora de Escopo

Igual à task vinculada: caminho relativo, revelar no gerenciador de arquivos do SO, outros protocolos além de http/https.

## Status

Todas as 3 fases implementadas 2026-10-14. Ver `.specs/tasks/terminal-clickable-links.md` pros critérios de aceite verificados.
