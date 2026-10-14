---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-13
version: 2
connections:
  parent: .specs/tasks/rename-to-cortex.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Renomear o app para "Cortex" + novo logo

## Task vinculada

`.specs/tasks/rename-to-cortex.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** Poucos arquivos, mudanças majoritariamente mecânicas (nome de string/arquivo) + um ícone — sem paralelismo que valha a pena. O ícone é desenhado antes do rename de config pra já existir quando `build/appicon.png` for referenciado.

## Definição de Pronto — confirmado

- `.specs/modules/shell.md` lido, Notes de 2026-10-13 revisadas.
- Escopo do rename confirmado com o usuário (só o que é visível/afeta busca nos apps instalados — não o módulo Go, não o pacote npm, não `~/.bcode`).
- Direção do logo confirmada (ícone abstrato cérebro/circuito, paleta `#007ACC`).
- Confirmado por leitura: nenhuma ferramenta de conversão SVG→PNG instalada neste ambiente (`rsvg-convert`/`imagemagick`/etc. ausentes) — vai precisar de uma lib Node (`@resvg/resvg-js`, sem dependência de sistema).
- Sem tasks bloqueantes. Pipeline de release (`bewayio/homebrew-bcode`) explicitamente fora de escopo, documentado na task vinculada.

## Fases

### Fase 1 — Logo (M) ✅ feita 2026-10-13

- Desenhar um SVG do ícone (motivo cérebro/circuito, paleta `#007ACC` sobre fundo transparente), em 1024×1024 de viewport.
- `npm install @resvg/resvg-js` (dev dependency, só usado pontualmente pra gerar o PNG — não entra no bundle do app).
- Script descartável (não committed) que rasteriza o SVG pra `build/appicon.png` (1024×1024, fundo transparente), substituindo o existente.
- Conferência visual do PNG gerado (abrir o arquivo) antes de prosseguir.
- Dependência: nenhuma.

### Fase 2 — Rename de config e metadata (S) ✅ feita 2026-10-13

- `main.go`: `Title: "BCode"` → `Title: "Cortex"`.
- `frontend/src/components/TitleBar.tsx`: texto "BCode" → "Cortex".
- `wails.json`: `name` e `outputfilename` → `cortex`; novo campo `info.productName: "Cortex"` (alimenta `CFBundleName` via `build/darwin/Info.dev.plist`, que já usa `{{.Info.ProductName}}`).
- `build/linux/bcode.desktop` → renomeado `build/linux/cortex.desktop`, com `Name=Cortex`, `Icon=cortex`, `Exec=cortex`.
- Dependência: Fase 1 (o `.desktop`/ícone já precisam existir com o nome novo).

### Fase 3 — Verificação (S) ✅ feita 2026-10-13

- `go build ./...`, `go vet ./...`, `gofmt -l .`.
- `tsc --noEmit`, `vite build`.
- `wails build` (ou ao menos confirmar que os campos de config estão coerentes) pra checar que o artefato sai com o nome/ícone novos — sem abrir a janela.
- Dependência: Fases 1–2.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Logo | M |
| 2. Rename de config/metadata | S |
| 3. Verificação | S |

## Fora de Escopo

Igual à task vinculada: módulo Go, pacote npm, pasta `~/.bcode`, pipeline de release/tap do Homebrew.

## Status

Todas as 3 fases implementadas 2026-10-13. Ver `.specs/tasks/rename-to-cortex.md` pros critérios de aceite verificados.
