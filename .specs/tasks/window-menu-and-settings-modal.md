---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-12
version: 4
connections:
  parent: .specs/modules/shell.md
  children: []
  related_adrs: [0007]
  sync_triggers:
    - Status change
---

# Task: Menu de janela + modal de configurações (Idioma)

## Status

`in-progress` — Fases 1–3 implementadas 2026-10-12 (botão, modal, seção Idioma funcional); falta só a Fase 4 (verificação manual do usuário). Ver `.specs/tasks/window-menu-and-settings-modal-plan.md`.

## Objetivo

Adicionar um botão de menu na title bar própria do app, que abre um modal de configurações no estilo "lista de opções à esquerda, conteúdo ao centro" (mesmo espírito do settings do VS Code). Primeira seção do modal: **Idioma**, com pt-BR, Español e English.

## Contexto

Pedido do usuário, 2026-10-12, junto com o pedido de i18n completo (ver `.specs/tasks/i18n-full-app.md` — a seção de Idioma deste modal depende da infraestrutura de i18n daquela task; a estrutura do modal em si não depende).

**Decisões já confirmadas com o usuário:**
- **Estilo do menu**: botão/dropdown dentro da title bar própria do app (`TitleBar.tsx`), **não** um menu nativo do SO. Motivo: o app já usa uma title bar única e sem moldura nativa em todo sistema (ADR-0007 — mesma aparência em Linux, Windows e macOS). Um menu nativo do Wails (`menu.NewMenu()`) teria aparência diferente por sistema (barra do macOS no topo da tela vs. menu nativo do Windows/Linux) e pode nem renderizar direito numa janela sem moldura no Linux/Windows — contrariaria a razão de ser do ADR-0007. A entrada de menu customizada mantém a consistência visual.
- **Escopo do menu agora**: só uma entrada ("Configurações"), não uma estrutura completa de File/Edit/View/Help. Outras entradas ficam pra quando houver necessidade real.

## Critérios de Aceite

- [x] `TitleBar.tsx` ganha um botão de menu (ícone `Settings`/engrenagem, `lucide-react`), mesmo lugar/estilo em Linux, Windows e macOS — à esquerda, via `margin-right: auto` (`.app-titlebar-menu`), não conflita com os botões de janela (que ficam à direita, só em Linux/Windows) nem com os traffic lights nativos do macOS (que já reservam os 80px à esquerda).
- [x] Clicar no botão abre o modal de configurações diretamente, sem dropdown intermediário.
- [x] Novo componente `SettingsModal.tsx`: overlay full-screen (`.modal-overlay`, reaproveitado) com um diálogo mais largo (`.modal-dialog-wide`, nova variante de `components.css`) com:
  - Coluna esquerda (`.settings-modal-nav`): lista de seções — só "Idioma" por enquanto, array de `{ id, label }` já comporta novas seções sem redesenho.
  - Coluna central (`.settings-modal-content`): conteúdo da seção selecionada.
- [x] Seção "Idioma": 3 opções (Português (Brasil), Español, English) — selecionar uma chama `setLanguage` (infra de i18n) imediatamente, sem reload, e persiste a escolha; a opção atual vem marcada ao abrir (`getCurrentLanguage()`).
- [x] Modal fecha via botão de fechar explícito (`X`), clique fora (no overlay) ou Escape.
- [x] Verificação: `tsc --noEmit`, `vite build` limpos. **Verificação manual pendente do usuário** (abrir o menu, trocar idioma, conferir leiaute de duas colunas) — sem ferramenta de automação de GUI aqui.

## Módulos Afetados

- `shell` (title bar, novo modal de configurações, menu)

## Fora de Escopo

- Outras configurações além de idioma (tema, tamanho de fonte do editor etc. — já existem como preferências separadas hoje, não entram neste modal agora).
- Menu nativo do SO.
- Estrutura completa de menu (File/Edit/View/Help).

## Próximo Passo

Rodar `bsdd plan` pra transformar isso num plano de implementação, junto com `.specs/tasks/i18n-full-app.md`.
