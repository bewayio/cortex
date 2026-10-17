---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-17
version: 1
connections:
  parent: .specs/modules/usage.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Adicionar atalho de trocar de projeto na lista de atalhos da Home

## Status

`implemented` — 2026-10-17. Ver `.specs/tasks/home-shortcut-and-sidebar-spacing-plan.md`.

## Objetivo

A aba Home (`UsageTab.tsx`) já mostra uma lista de atalhos de teclado (seção "Atalhos", `SHORTCUTS` array + `shortcuts.*` em `usage.json`). O atalho de trocar de projeto (Ctrl/Cmd+↑/↓, já implementado — ver `.specs/modules/shell.md`'s notes de 2026-10-11/12, `ProjectSwitcher.tsx`/`cycleProjectSwitcher`) não está nessa lista. Pedido do usuário, 2026-10-17: adicionar essa entrada.

## Contexto

Puramente um gap de documentação na UI — o atalho já existe e funciona (overlay de troca de projeto, `components/ProjectSwitcher.tsx`). Não há mudança de comportamento, só uma nova linha na lista existente: `{ combo: 'Mod+↑/↓', descKey: 'switchProject' }` em `UsageTab.tsx`'s `SHORTCUTS`, mais a chave `shortcuts.switchProject` nos três arquivos de locale (`pt-BR`, `es`, `en-US`) de `usage.json`.

## Critérios de Aceite

- [x] Lista de atalhos da Home inclui uma linha para "trocar de projeto" com o combo `Ctrl+↑/↓` (ou `Cmd+↑/↓` no macOS, mesmo `modLabel` já usado pelas outras entradas). Entrada `{ combo: 'Mod+↑/↓', descKey: 'switchProject' }` adicionada logo após `previousTab` em `UsageTab.tsx`'s `SHORTCUTS`.
- [x] Texto traduzido nos três idiomas suportados (`pt-BR`: "Trocar de projeto", `es`: "Cambiar de proyecto", `en-US`: "Switch project").

## Módulos Afetados

- `usage` (`UsageTab.tsx`, só essa lista — nenhuma mudança de interface pública/backend)

## Fora de Escopo

- Qualquer mudança no próprio atalho/overlay de troca de projeto (já implementado, só falta aparecer na lista).

## Próximo Passo

Nenhum — implementado e verificado (`tsc --noEmit`, `vite build` limpos em 2026-10-17).
