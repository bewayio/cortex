---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-17
version: 1
connections:
  parent: .specs/tasks/home-project-switcher-shortcut-hint.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Atalho de trocar de projeto na Home + espaçamento chevron/ícone/texto

## Tasks vinculadas

- `.specs/tasks/home-project-switcher-shortcut-hint.md` → status vira `planned`.
- `.specs/tasks/sidebar-row-spacing.md` → status vira `planned`.

Duas tasks pequenas e independentes, capturadas na mesma sessão de `bsdd new` (2026-10-17) — um plano combinado em vez de dois, já que nenhuma delas sozinha justifica fases próprias.

## Modelo de execução

**Single agent.** Confirmado com o usuário. Nenhuma dependência real entre as duas tasks nem necessidade de papéis especializados — mudanças pequenas e bem localizadas (uma lista estática + CSS compartilhado).

## Definição de Pronto — confirmado

- Specs lidas: `.specs/modules/usage.md`, `.specs/modules/files.md`, `.specs/modules/database.md`.
- Ambas as tasks já têm objetivo, contexto e critérios de aceite capturados, sem blockers.
- Escopo do fix de espaçamento já confirmado com o usuário (pergunta de esclarecimento, `bsdd new`): é especificamente o espaçamento chevron/ícone/texto, não a posição do contador nem truncamento de texto.

## Fases

### Fase 1 — Home: atalho de trocar de projeto na lista de atalhos (S) ✅ feita 2026-10-17

- `UsageTab.tsx`'s `SHORTCUTS`: nova entrada `{ combo: 'Mod+↑/↓', descKey: 'switchProject' }`, posicionada logo depois de `nextTab`/`previousTab` (mesma família — navegação de abas/projetos) ou onde fizer mais sentido visualmente na lista atual.
- `usage.json` (pt-BR, es, en-US): nova chave `shortcuts.switchProject`, texto curto e consistente com as outras entradas (ex. pt-BR: "Trocar de projeto").
- Dependência: nenhuma.

### Fase 2 — Explorer/Database: espaçamento chevron/ícone/texto (S) ✅ feita 2026-10-17

- Inspecionar o CSS atual de `.file-tree-item`, `.file-tree-item-chevron`, `.file-tree-item-icon`, `.file-tree-item-name` em `components.css` lado a lado com o print do usuário, pra identificar exatamente qual `gap`/`margin`/`padding` está desproporcional.
- Ajustar o(s) valor(es) nas classes compartilhadas — afeta `FileExplorer.tsx` (arquivos/pastas) e `DatabasePanel.tsx` (`.db-folder-row` estende as mesmas classes: conexões, pastas de conexão, queries salvas, pastas de query) ao mesmo tempo, já que são a mesma classe base.
- Checar se há outras superfícies usando `.file-tree-item*` além dessas duas (grep antes de mudar, pra não quebrar algo não previsto — ex. alguma árvore dentro de `TableProperties.tsx` ou `DatabaseTablesTab.tsx`).
- Dependência: nenhuma (independente da Fase 1).

### Fase 3 — Verificação (S) ✅ feita 2026-10-17

- `go build ./...`, `go vet ./...`, `gofmt -l .` (sem mudanças Go esperadas nesta task, mas roda por segurança/consistência com o resto do projeto).
- `tsc --noEmit`, `vite build`.
- Dependência: Fases 1–2.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Atalho na Home | S |
| 2. Espaçamento chevron/ícone/texto | S |
| 3. Verificação | S |

## Fora de Escopo

Igual às tasks vinculadas: nenhuma mudança de comportamento do atalho de troca de projeto em si (só a entrada na lista), nenhuma mudança de hierarquia/estrutura da árvore (só espaçamento visual).

## Status

`done` — as 3 fases implementadas e verificadas (`go build`/`go vet`/`gofmt`/`tsc`/`vite build` limpos) em 2026-10-17.
