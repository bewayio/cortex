---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-13
version: 4
connections:
  parent: .specs/modules/shell.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Renomear o app para "Cortex" + novo logo

## Status

`in-progress` — todas as 3 fases implementadas 2026-10-13 (ver `.specs/tasks/rename-to-cortex-plan.md`); não marcada `done` só porque a verificação interativa (ver o nome/ícone novos na janela de verdade, no launcher do SO) precisa do usuário (sem ferramenta de automação de GUI aqui).

## Objetivo

Trocar o nome exibido do app de "BCode" para "Cortex" em tudo que o usuário vê e em tudo que afeta como ele encontra/busca o app já instalado (título da janela, nome na lista de apps/launcher do SO, nome do pacote/bundle), e criar um novo ícone/logo pro app.

## Contexto

Pedido do usuário, 2026-10-13.

**Decisão já confirmada com o usuário — escopo do rename**: "o que o usuário vê e como ele busca nos apps instalados". Ou seja:
- **Dentro do escopo**: título da janela (`main.go`), texto "BCode" na title bar (`TitleBar.tsx`), nome do produto/bundle em `wails.json` (usado pelo `.app` no macOS, pelo `.desktop`/binário no Linux, pelo executável no Windows), arquivo `.desktop` do Linux (`Name=`, `Icon=`, `Exec=`), metadata do bundle macOS (`CFBundleName` via `wails.json`'s `info.productName`), e o ícone/logo em si.
- **Fora do escopo** (confirmado): nome do módulo Go (`go.mod`, imports em todo `.go` — fica `bcode`), nome do pacote npm (`frontend/package.json` continua `bcode-frontend`), e a pasta de dados do usuário `~/.bcode` (workspaces, conexões salvas, histórico de chat — não é visível ao usuário, e mexer nela arriscaria perder dados sem uma migração). Nenhum desses precisa mudar pra atender o pedido.
- **Zona cinzenta, fora de escopo por enquanto (precisa de confirmação separada se o usuário quiser)**: o pipeline de release (`.github/workflows/release.yml`) referencia um repositório externo `bewayio/homebrew-bcode` (tap do Homebrew), um Cask `Casks/bcode.rb`, nomes de asset (`bcode-linux-x86_64.AppImage` etc.) e um secret `BCODE_RELEASE_TOKEN` escopado a esse repositório. Renomear isso de verdade envolve criar/renomear um repositório GitHub externo e reconfigurar o token — uma ação de infraestrutura que afeta usuários existentes que já instalaram via `brew install bewayio/bcode/bcode` (quebraria o comando deles). Não mexido nesta task; listado aqui só pra não ser esquecido se o usuário quiser ir até esse nível depois.

**Decisão técnica pro logo (já que não há ferramenta de geração de imagem disponível neste ambiente)**: desenho um ícone vetorial (SVG) à mão — motivo abstrato de cérebro/circuito (confirmado com o usuário), paleta usando o accent já existente no app (`#007ACC`, mesma cor usada em abas ativas/barra de progresso/etc. — confirmado com o usuário, consistência visual entre ícone e UI). Rasterizo o SVG pra PNG 1024×1024 (convenção já documentada em `docs/frontend.md` pro `build/appicon.png`) usando uma lib Node sem dependência de sistema (ex: `@resvg/resvg-js`) — nenhuma ferramenta de conversão (`rsvg-convert`/`imagemagick`/etc.) está instalada neste ambiente.

## Critérios de Aceite

- [x] `main.go`: `Title: "BCode"` → `Title: "Cortex"`; `--version`/`-v` também passou a imprimir `cortex <versão>` (mesmo motivo — texto que o usuário vê ao rodar o binário no terminal).
- [x] `TitleBar.tsx`: texto "BCode" → "Cortex". `EditorPane.tsx`'s logo no estado vazio do editor ("BCode" grande, acima de "Open a file to start editing") também → "Cortex" — achado durante a implementação, não estava listado originalmente mas é claramente texto visível.
- [x] `wails.json`: `name`/`outputfilename` → `cortex`; novo campo `info.productName: "Cortex"` (alimenta o `CFBundleName` no macOS via `build/darwin/Info.dev.plist`, que já usa `{{.Info.ProductName}}`).
- [x] `build/linux/bcode.desktop` → renomeado `build/linux/cortex.desktop` (`git mv`), `Name=Cortex`, `Icon=cortex`, `Exec=cortex`.
- [x] Novo ícone: `build/appicon.svg` (fonte vetorial, novo arquivo — motivo cérebro/circuito feito de círculos sobrepostos formando os dois hemisférios, "pinos" de chip embaixo, uma rede de nós/linhas de circuito por cima, paleta `#007ACC`/`#EAF6FF`), rasterizado pra `build/appicon.png` (1024×1024, RGBA com canal alfa confirmado transparente) via `@resvg/resvg-js` (instalado com `--no-save`, só usado pontualmente — não é dependência do app, removido depois de gerar o PNG).
- [x] `wails build` gerou o binário/bundle com o novo nome: `Built '.../build/bin/cortex'` — confirmado rodando o build de verdade (Linux/amd64), sem abrir a janela.
- [x] Verificação: `go build ./...`, `go vet ./...`, `gofmt -l .` limpos; `tsc --noEmit`, `vite build` limpos; `wails build` completo e limpo.
**Não verificado por mim** (sem ferramenta de automação de GUI aqui): abrir a janela de verdade e ver o título/logo "Cortex" e o ícone novo; verificar o app instalado aparecendo como "Cortex" no launcher do SO (Linux `.desktop`, bundle macOS).

**Bug encontrado e corrigido no mesmo dia, relatado pelo usuário após o rename**: a janela abria com uma engrenagem genérica em vez do logo novo, no Linux — `build/appicon.png` só alimenta os ícones de *empacotamento* (`wails build`), a janela GTK rodando precisa de `options.App.Linux.Icon` setado explicitamente, o que `main.go` nunca fazia. Corrigido com `//go:embed build/appicon.png` + `Linux: &linux.Options{Icon: icon}`. Detalhe completo: `.specs/modules/shell.md`'s Notes de 2026-10-13.

## Módulos Afetados

- `shell` (title bar, janela nativa, branding)
- `release` (`wails.json`, assets de build — não o pipeline do GitHub Actions em si, ver "zona cinzenta" acima)

## Fora de Escopo

- Módulo Go, pacote npm, pasta de dados `~/.bcode` (confirmado com o usuário).
- Pipeline de release / tap do Homebrew / repositório `bewayio/homebrew-bcode` (infraestrutura externa — precisa de confirmação separada).
- Ícone/logo em outros formatos além do PNG de app (ex: favicon de alguma futura página web, material de marketing) — não existe hoje, não é pedido.

## Próximo Passo

Rodar `bsdd plan` pra transformar isso num plano de implementação.
