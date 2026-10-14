---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-14
version: 3
connections:
  parent: .specs/modules/terminal.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Links clicáveis (Ctrl/Cmd+click) na saída do terminal

## Status

`in-progress` — todas as 3 fases implementadas 2026-10-14 (ver `.specs/tasks/terminal-clickable-links-plan.md`); não marcada `done` só porque a verificação interativa (clicar um link e um caminho de verdade) precisa do usuário — sem ferramenta de automação de GUI aqui.

## Objetivo

Na saída do terminal, Ctrl+click (Cmd+click no macOS) num link `http(s)://` abre no navegador padrão do sistema; num caminho de arquivo absoluto, abre o arquivo numa aba do editor do próprio Cortex (mesmo fluxo de abrir pela sidebar).

## Contexto

Pedido do usuário, 2026-10-14.

**Decisões já confirmadas com o usuário:**
- **"Abrir o arquivo" significa abrir uma aba no editor do Cortex**, não revelar no gerenciador de arquivos do SO (`RevealInFinder` já existe mas só funciona no macOS hoje — gap conhecido, documentado em `files.md`, não é o que esta task resolve).
- **Só caminhos ABSOLUTOS viram link clicável nesta versão.** O Cortex não acompanha o cwd ao vivo do shell dentro do terminal (`workdirRef` em `Terminal.tsx` só guarda a pasta em que o terminal foi aberto, não atualiza depois de um `cd` do usuário) — resolver caminho relativo contra essa pasta inicial arriscaria abrir o arquivo errado (ou nenhum) depois que o usuário muda de diretório. Um caminho relativo digitado cru (ex: `app.go`, `./src/main.go`) não vira link clicável por enquanto.

## Critérios de Aceite

- [x] Link `http://` ou `https://` na saída do terminal: Ctrl+click (Cmd+click no macOS) abre no navegador padrão do SO (`BrowserOpenURL`).
- [x] Caminho de arquivo absoluto (`/...`, `~/...` no Linux/macOS, `C:\...` no Windows) na saída do terminal: Ctrl/Cmd+click abre numa aba do editor (`ReadFile` + `openOrFocusTab`, mesmos campos do `openFile` da sidebar) — falha silenciosa se o arquivo não existir (`.catch(() => {})`, sem mensagem intrusiva).
- [x] Sem o modificador, `activate()` retorna sem fazer nada — não interfere na seleção/copiar-colar normal do xterm.
- [x] Cursor/hover: comportamento padrão do `ILinkProvider` do xterm.js (não customizado, não precisava).
- [x] Implementado em `registerTerminalLinkProvider`, chamado em `createTerminal` — um provider por instância de `XTerm`, então os dois docks (`bottom`/`right`) e qualquer aba nova já herdam automaticamente, sem código extra por dock.
- [x] Verificação: `tsc --noEmit`, `vite build` limpos.
**Não verificado por mim** (sem ferramenta de automação de GUI aqui): clicar um link http de verdade, clicar um caminho de arquivo absoluto de verdade, confirmar que a seleção de texto normal continua funcionando sem o modificador.

## Módulos Afetados

- `terminal` (principal — `Terminal.tsx`, novo link provider do xterm.js)
- `files`/`shell` (consumido, não modificado — reusa `ReadFile`/`openOrFocusTab` já existentes)

## Fora de Escopo

- Caminho de arquivo relativo (confirmado com o usuário — só absoluto por enquanto).
- Revelar no gerenciador de arquivos do SO (já existe outro gap aberto sobre isso em `files.md`, não é o que esta task resolve).
- Outros protocolos de link além de `http`/`https` (ex: `mailto:`, `ssh://`).

## Próximo Passo

Rodar `bsdd plan` pra transformar isso num plano de implementação.
