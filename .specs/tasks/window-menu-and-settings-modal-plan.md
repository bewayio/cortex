---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-12
version: 2
connections:
  parent: .specs/tasks/window-menu-and-settings-modal.md
  children: []
  related_adrs: [0007]
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Menu de janela + modal de configurações (Idioma)

## Task vinculada

`.specs/tasks/window-menu-and-settings-modal.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** Fases pequenas e sequenciais (botão → modal → seção de idioma → verificação), sem necessidade de paralelizar.

## Definição de Pronto — confirmado

- Project DNA, architecture overview, `.specs/modules/shell.md` lidos.
- ADR-0007 revisado — justifica a decisão de botão customizado na title bar em vez de menu nativo do SO.
- `TitleBar.tsx` lido (61 linhas, estrutura simples — título + botões de janela condicionais por plataforma).
- `EditorPane.tsx`'s `.modal-overlay`/`.modal-dialog-*` (2026-10-12, aviso de sobrescrita externa) identificado como o padrão de modal a reaproveitar/estender.
- **Dependência externa**: a Fase 3 (seção Idioma) depende da **Fase 1 de `.specs/tasks/i18n-full-app-plan.md`** (infraestrutura de i18n) já estar implementada. As Fases 1–2 abaixo (botão + estrutura do modal) não dependem disso.
- Sem outras tasks bloqueantes.

## Decisões de planejamento

- **Botão**: ícone de engrenagem (ou similar — refinar na implementação), mesmo lugar/estilo em Linux, Windows e macOS, dentro de `app-titlebar`.
- **Sem dropdown intermediário**: com só uma entrada hoje, o clique no botão abre o modal direto. Se mais entradas forem adicionadas no futuro, aí sim um dropdown real entra antes do modal — não construir essa camada agora (ela ficaria vazia/sem uso).
- **Modal**: novo componente `SettingsModal.tsx`, reaproveitando as classes `.modal-overlay`/`.modal-dialog-*` de `components.css` como base, mas com uma variante mais larga (duas colunas) — provavelmente uma nova classe `.modal-dialog-wide` ou props de largura, decidir na implementação conforme o que ficar mais simples de manter junto com o modal existente de `EditorPane.tsx`.
- **Estrutura de seções**: um array de seções (`{ id, label, render() }`) na própria store ou no componente — só "Idioma" agora, mas o formato já comporta novas seções sem redesenho (ex: um futuro "Aparência"/"Atalhos").

## Fases

### Fase 1 — Botão de menu na title bar (S) ✅ feita 2026-10-12

- `TitleBar.tsx` ganha um botão novo (ícone, ex: engrenagem), ao lado dos botões de janela existentes (ou do lado oposto, a definir visualmente), mesmo em todo sistema.
- Clique abre o modal (estado local em `App.tsx` ou um novo store simples, a decidir — segue o mesmo padrão já usado por outros modais globais do app).
- Dependência: nenhuma.

### Fase 2 — Estrutura do modal de configurações (M) ✅ feita 2026-10-12

- Novo `SettingsModal.tsx`: overlay full-screen, diálogo com duas colunas — lista de seções à esquerda (só "Idioma" por enquanto), conteúdo da seção selecionada ao centro.
- Fecha via botão de fechar explícito, clique no overlay, ou Escape (mesmo padrão dos outros modais/overlays do app — `ProjectSwitcher.tsx`, confirmação de delete do `FileExplorer.tsx`).
- Ainda sem lógica de troca de idioma de verdade nesta fase — a seção "Idioma" existe como UI (3 opções, radio/lista), mas selecionar uma ainda não faz nada.
- Dependência: Fase 1.

### Fase 3 — Seção Idioma funcional (S) ✅ feita 2026-10-12

- Selecionar uma das 3 opções chama a função de troca de idioma da infraestrutura de i18n (`setLanguage`, ver Fase 1 de `i18n-full-app-plan.md`), que persiste em `localStorage` (`bcode.language`) e troca o idioma visível imediatamente, sem reload.
- Opção atual destacada ao abrir o modal (reflete a preferência salva ou o idioma detectado).
- Dependência: Fase 2 deste plano + Fase 1 de `i18n-full-app-plan.md`.

### Fase 4 — Verificação (S)

- `tsc --noEmit`, `vite build` limpos.
- Verificação manual do usuário: abrir o menu, conferir o leiaute de duas colunas, trocar idioma e ver a troca refletir no resto do app (dependendo da fase de migração de texto já ter alcançado a área sendo visualizada) — sem ferramenta de automação de GUI aqui.
- Dependência: Fases 1–3.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Botão na title bar | S |
| 2. Estrutura do modal | M |
| 3. Seção Idioma funcional | S |
| 4. Verificação | S |

## Fora de Escopo

Igual à task vinculada: outras seções de configuração além de idioma, menu nativo do SO, estrutura completa de menu (File/Edit/View/Help).

## Status

`planned` — aguardando `bsdd start`. Recomenda-se rodar a Fase 1 de `i18n-full-app-plan.md` antes da Fase 3 deste plano (dependência direta).
