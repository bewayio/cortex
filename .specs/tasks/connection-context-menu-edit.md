---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-14
version: 3
connections:
  parent: .specs/modules/database.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Menu de contexto da conexão ganha "Editar"

## Status

`in-progress` — implementado 2026-10-14; não marcada `done` só porque a verificação interativa (botão direito numa conexão de verdade) precisa do usuário.

## Objetivo

O menu de contexto (botão direito) de uma conexão MySQL, na árvore da sidebar, ganha uma opção "Editar" — hoje só dá pra editar clicando no ícone de lápis na própria linha; o menu de contexto só tem "Rename" (renomeia só o nome, inline) e "Reconnect".

## Contexto

Pedido do usuário, 2026-10-14. Achado por leitura de código: `DatabasePanel.tsx`'s `ctxMenu` (botão direito numa conexão) já tem "Rename" e "Reconnect" (só pra `kind === 'connection'`), mas abrir o modal completo de edição (`ConnectionModal.tsx`, ver `.specs/tasks/mysql-ssh-tunnel-and-connection-modal.md`) só é possível pelo ícone de lápis na linha (`startEdit`) — inconsistente com o resto do app, onde o menu de contexto normalmente cobre as mesmas ações que os ícones da linha.

## Critérios de Aceite

- [x] Menu de contexto de uma conexão (`ctxMenu.kind === 'connection'`) ganhou uma entrada "Editar" (ícone de lápis, `t('panel.edit')` — mesma chave já usada no `title` do botão da linha), chamando `startEdit(conn)` — abre `ConnectionModal.tsx` com os dados da conexão.
- [x] Posição do item no menu: logo depois de "Rename" (comum às duas `kind`), antes de "Reconnect" — ordem final ficou Rename → Edit → Reconnect, não exatamente a sugerida na captura (editar antes de renomear), mas não era um requisito rígido.
- [x] Menu de contexto de uma query salva (`ctxMenu.kind === 'query'`) não ganhou essa entrada — o novo bloco está dentro do mesmo `{ctxMenu.kind === 'connection' && (...)}` já usado pelo Reconnect.
- [x] Verificação: `tsc --noEmit`, `vite build` limpos.

## Módulos Afetados

- `database` (`DatabasePanel.tsx`'s menu de contexto)

## Fora de Escopo

- Qualquer mudança no próprio `ConnectionModal.tsx` (já existe, só precisa de mais um jeito de abrir ele).

## Próximo Passo

Pelo tamanho (uma entrada de menu chamando uma função já existente), é uma boa candidata a pular direto pro `bsdd start` sem formalizar um plano — mas segue o fluxo padrão (`bsdd plan`) se preferir.
