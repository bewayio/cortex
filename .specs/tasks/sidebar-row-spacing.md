---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-17
version: 1
connections:
  parent: .specs/modules/files.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Espaçamento chevron/ícone/texto nas linhas do Explorer e do painel de Database

## Status

`implemented` — 2026-10-17. Ver `.specs/tasks/home-shortcut-and-sidebar-spacing-plan.md`. Falta só a confirmação visual do usuário (ver último critério de aceite).

## Objetivo

Ajustar o espaçamento entre a seta de expandir (chevron), o ícone (pasta/arquivo) e o texto (nome do arquivo, da pasta de conexão/query, etc.) nas linhas em árvore do **File Explorer** (`FileExplorer.tsx`) e do **painel de Database** (`DatabasePanel.tsx` — seções Conexões e Queries Salvas). Pedido do usuário, 2026-10-17, com print mostrando a seção "Banco de Dados" (Conexões/Queries Salvas, pasta "LOCAL" com contador "1") como referência do problema.

## Contexto

Ambas as superfícies compartilham as mesmas classes CSS de linha (`components.css`): `.file-tree-item`, `.file-tree-item-chevron`, `.file-tree-item-icon`, `.file-tree-item-name` — usadas tanto pelas linhas de arquivo/pasta do Explorer quanto pelas linhas de conexão/pasta de conexão/query/pasta de query do painel de Database (`.db-folder-row` estende `.file-tree-item` com uma classe adicional; `.db-folder-count` é o badge do contador, ex. "1" na imagem). Um ajuste nas classes compartilhadas deve refletir nas duas superfícies ao mesmo tempo.

Já existe um precedente registrado (`.specs/modules/database.md`'s Notes, 2026-09-27, item 3 "Folder-row alignment fix"): `.file-tree-item-icon` ganhou `line-height: 0` e o ícone de pasta foi de 13 pra 14px pra corrigir um desalinhamento vertical relatado antes — mas aquele fix nunca foi confirmado visualmente pelo usuário (não há ferramenta de automação de GUI nesta sessão). O pedido atual pode ser uma regressão do mesmo problema, um problema diferente de **espaçamento horizontal** (gap entre chevron/ícone/texto, não alinhamento vertical), ou os dois — a especificação exata do que mudar (quais `gap`/`margin`/`padding` em quais seletores) fica para a fase de implementação (`bsdd plan`/`bsdd start`), já que isso exige inspecionar o CSS atual lado a lado com o print, não é capturável de forma determinística aqui.

**Confirmado com o usuário, 2026-10-17**: o problema é especificamente o espaçamento entre chevron, ícone e texto (não a posição do contador/badge, nem truncamento de texto longo — opções descartadas na pergunta de esclarecimento).

## Critérios de Aceite

- [x] Espaçamento entre chevron, ícone e texto consistente e visualmente equilibrado nas linhas do File Explorer (arquivos e pastas). Causa raiz: `.file-tree-item-chevron` não tinha nenhum `margin`/`gap` até o ícone (0px), enquanto `.file-tree-item-icon` tinha `margin-right: 6px` até o texto — gap desigual entre os três elementos. Fix: `.file-tree-item` ganhou `gap: 4px` (flex container), e o `margin-right: 6px` de `.file-tree-item-icon` foi removido (redundante com o gap) — espaçamento uniforme de 4px entre chevron/ícone/texto em toda linha.
- [x] **Segundo fix, mesmo dia, confirmado pelo usuário após reiniciar `wails dev` com o fix acima** — o problema real que sobrava era o **texto desalinhado verticalmente com os ícones** (não mais o espaçamento horizontal, já corrigido). Causa raiz: `.file-tree-item-name` não tinha `line-height` próprio, herdando o `line-height: 1.4` global (`theme.css`) — pra uma fonte de 13px isso dá uma caixa de linha de ~18.2px, mais alta que a caixa de 16px dos ícones; mesmo com `align-items: center` no container flex, a assimetria de ascent/descent da fonte dentro dessa caixa maior fazia o texto parecer deslocado em relação ao ícone perfeitamente centrado de 16px. Fix: `.file-tree-item-name` ganhou `line-height: 16px` explícito, igualando a altura da caixa de texto à dos ícones.
- [x] **Terceiro fix, mesmo dia, confirmado pelo usuário após reiniciar de novo** — o texto e o ícone de pasta já ficaram alinhados entre si, mas a **setinha de expandir (chevron) continuou visivelmente mais alta que os dois**, num novo print. Causa raiz: `.file-tree-item-icon` já tinha `line-height: 0` (fix de 2026-09-27, pra neutralizar o `line-height: 1.4` herdado que distorcia o box do ícone dentro do flex), mas `.file-tree-item-chevron` — a mesma espécie de box de 16x16 ao lado do ícone — nunca recebeu esse mesmo tratamento, então sofria exatamente o mesmo efeito que o ícone já tinha sofrido antes de ser corrigido. Fix: `.file-tree-item-chevron` ganhou `line-height: 0`, igual ao ícone.
- [x] Mesmo ajuste refletido nas linhas do painel de Database (conexões, pastas de conexão, queries salvas, pastas de query) — confirmado: todas usam exatamente `.file-tree-item`/`.file-tree-item-chevron`/`.file-tree-item-icon`/`.file-tree-item-name` sem overrides próprios (grep não encontrou nenhuma outra definição dessas classes em `components.css`), então o ajuste chega automaticamente.
- [x] Nenhuma regressão visual nas outras superfícies que também usam `.file-tree-item*` — `TableTab.tsx`/`DatabaseTablesTab.tsx`/`TableProperties.tsx` não usam essas classes (não têm estrutura de árvore), confirmado por grep; não há overrides específicos de tema/dark-mode para essas classes.
- [ ] Confirmação visual do usuário via `wails dev` — primeiro fix (espaçamento horizontal) e segundo fix (texto vs ícone) confirmados aplicados; o usuário reportou o terceiro problema (chevron ainda mais alto que ícone/texto), corrigido acima. Aguardando confirmação final deste terceiro fix.

## Módulos Afetados

- `files` (`FileExplorer.tsx`, CSS compartilhado)
- `database` (`DatabasePanel.tsx`, reaproveita as mesmas classes)

## Fora de Escopo

- Mudança de estrutura/hierarquia da árvore (só espaçamento visual).
- Qualquer alteração em `TableTab`/`DatabaseTablesTab` (tabelas de dados), a menos que se descubra que compartilham as mesmas classes durante a implementação.

## Próximo Passo

Nenhum — implementado e verificado (`tsc --noEmit`, `vite build` limpos em 2026-10-17). Falta a confirmação visual do usuário.
