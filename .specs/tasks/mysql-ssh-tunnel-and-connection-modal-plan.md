---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-14
version: 2
connections:
  parent: .specs/tasks/mysql-ssh-tunnel-and-connection-modal.md
  children: []
  related_adrs: [0009]
  sync_triggers:
    - Status change
    - Phase completion
---

# Plano: Túnel SSH opcional pra conexões MySQL + modal de conexão com abas

## Task vinculada

`.specs/tasks/mysql-ssh-tunnel-and-connection-modal.md` → status vira `planned` com este plano.

## Modelo de execução

**Single agent.** O modal de verdade (salvar/testar os campos novos) depende do backend existir primeiro — a casca visual do modal poderia ser construída em paralelo, mas integrar de ponta a ponta exige que o formato dos campos já esteja definido no backend. Sem servidor SSH/MySQL de teste neste ambiente, cada fase backend é verificada por leitura + build, não por uma conexão de verdade.

## Definição de Pronto — confirmado

- `.specs/modules/database.md`, ADR-0009 lidos.
- Confirmado por leitura: `golang.org/x/crypto` já é dependência indireta (`go.sum`) — só falta importar `golang.org/x/crypto/ssh` diretamente. `openConn` (`database.go`) hoje monta a DSN com `tcp(%s:%d)` fixo e só `?parseTime=true`, sem nenhum parâmetro configurável.
- Decisões já confirmadas com o usuário (auth só senha, modelo do túnel, 3 abas) — ver a task vinculada.
- Sem tasks bloqueantes. Sem servidor SSH/MySQL de teste disponível neste ambiente — fases backend verificadas por `go build`/`go vet`/teste Go descartável onde der pra simular sem rede real; a verificação end-to-end de verdade fica para o usuário.

## Fases

### Fase 1 — Backend: schema de dados + persistência (M) ✅ feita 2026-10-14

- `DBConnection`/`DBConnectionInput`/`storedConnection` (`database.go`) ganham: `UseSSHTunnel bool`, `SSHHost string`, `SSHPort int`, `SSHUser string`, `SSHPassword string` (criptografada, mesmo esquema AES-256-GCM da senha do MySQL — `encryptPassword`/`decryptPassword` já existentes, reaproveitados), `ExtraParams map[string]string`.
- `SaveDBConnection` passa a aceitar e persistir esses campos novos; `DBConnection` (o que volta pro frontend) nunca inclui `SSHPassword` em texto plano, mesmo tratamento já dado à senha do MySQL.
- Novo arquivo `~/.bcode/db/default_extra_params.json` — funções `loadDefaultExtraParams`/`saveDefaultExtraParams`, seguindo o mesmo padrão dos outros arquivos de preferência em `~/.bcode/db/`. Seed inicial (primeira vez, arquivo não existe ainda): `{"parseTime": "true"}` — migra o que já está hardcoded hoje, não perde o comportamento atual.
- `SaveDBConnection` atualiza `default_extra_params.json` sempre que os `ExtraParams` salvos diferem do default atual (last-write-wins, não por conexão).
- Migração implícita pra conexões antigas: ao carregar uma `storedConnection` sem `ExtraParams` (campo ausente/null, arquivo de antes desta task), trata como `{"parseTime": "true"}` em memória — nunca persiste isso de volta sozinho, só no load, pra não reescrever silenciosamente o arquivo de conexões de todo mundo.
- Dependência: nenhuma (primeira fase).

### Fase 2 — Backend: DSN com Extra Params (S) ✅ feita 2026-10-14

- `openConn`: monta a query string da DSN a partir de `ExtraParams` (ordenado por chave, pra DSN determinística) em vez do `?parseTime=true` fixo.
- `ListDatabases`/`ListTables`/`RunQuery`/`TestDBConnection`/etc. não mudam — todos já passam por `openConn`, herdam o comportamento novo automaticamente.
- Teste Go descartável: conexão com `ExtraParams` customizado gera a DSN esperada (sem precisar de um MySQL de verdade, só testando a string montada).
- Dependência: Fase 1.

### Fase 3 — Backend: túnel SSH (M) ✅ feita 2026-10-14

- `go get golang.org/x/crypto/ssh` (promove de indireta pra direta).
- Nova função (ex: `dialSSHTunnel(sc storedConnection) (*ssh.Client, error)`): abre `ssh.Client` com `ssh.Password(sshPassword)` como `AuthMethod`, `HostKeyCallback: ssh.InsecureIgnoreHostKey()` (decisão já documentada como fora de escopo validar host key nesta versão).
- `openConn`: quando `UseSSHTunnel` é `true`, abre o túnel primeiro e registra um dialer customizado (`mysql.RegisterDialContext`, nome de rede único por conexão — ex: `"ssh-tunnel-" + sc.ID` — pra não colidir entre conexões diferentes que tenham túnel ao mesmo tempo) que usa `sshClient.DialContext` em vez de TCP direto; a DSN usa esse network name em vez de `tcp`.
- Erro de túnel (SSH inalcançável/auth errada) retorna uma mensagem distinta de erro de MySQL — ex: prefixo `"ssh tunnel: ..."` — pra quem usa saber onde o problema está.
- `TestDBConnection` continua só chamando `openConn` + ping, já herda o túnel sem mudança própria.
- Dependência: Fase 1 (precisa dos campos SSH existirem no struct).

### Fase 4 — Frontend: casca do modal + aba Geral (M) ✅ feita 2026-10-14

- Novo `ConnectionModal.tsx`: modal (reaproveita o padrão `.modal-overlay`/`.modal-dialog-wide` já existente, mesmo usado pelo `SettingsModal.tsx`) com 3 abas na lateral ou no topo (a decidir na implementação, seguindo o espírito da imagem de referência do usuário — linhas chave/valor n a aba de Extra Params, não necessariamente o mesmo leiaute de navegação lateral do `SettingsModal.tsx`).
- Aba Geral: migra os campos que hoje vivem no formulário inline de `DatabasePanel.tsx` (nome, host, porta, usuário, senha, banco opcional, pasta) — mesmo comportamento, só o contêiner muda de inline pra modal.
- `DatabasePanel.tsx`'s `startCreate`/`startEdit` passam a abrir o modal em vez de setar o estado do formulário inline; o formulário inline antigo é removido.
- Dependência: Fase 1 (precisa saber a forma final dos campos pra já montar o estado do formulário certo, mesmo que o teste de ponta a ponta só aconteça nas fases seguintes).

### Fase 5 — Frontend: aba Túnel SSH (S) ✅ feita 2026-10-14

- Toggle "Usar túnel SSH"; campos de host/porta/usuário/senha do túnel só visíveis/habilitados com o toggle ligado.
- Dependência: Fase 4 (modal já existe) + Fase 1 (campos do backend já existem).

### Fase 6 — Frontend: aba Extra Params (M) ✅ feita 2026-10-14

- Lista de pares chave/valor editável (adicionar/remover linha), estilo tabela — layout inspirado na imagem de referência do usuário (coluna Nome/Valor), mas com os pares vindos do backend (`go-sql-driver/mysql`), não os nomes JDBC da imagem.
- Pré-preenche com o default global (nova chamada ao backend, ex: `GetDefaultExtraParams`) ao criar uma conexão nova; ao editar uma existente, mostra os valores já salvos dela.
- `saveForm` (ou equivalente no novo modal) salva os Extra Params junto com o resto da conexão — o backend (Fase 1) já cuida de atualizar o default global sozinho.
- Dependência: Fase 4 (modal) + Fase 1 (backend de Extra Params e default).

### Fase 7 — Verificação (S) ✅ feita 2026-10-14

- `go build ./...`, `go vet ./...`, `gofmt -l .`.
- `tsc --noEmit`, `vite build`.
- Teste Go descartável cobrindo: DSN com Extra Params customizado (Fase 2), e — na medida do possível sem rede real — que o dialer SSH é registrado corretamente antes do `sql.Open` (Fase 3), sem precisar de um servidor SSH de verdade.
- Dependência: Fases 1–6.

## Resumo de complexidade

| Fase | Complexidade |
|------|--------------|
| 1. Schema + persistência | M |
| 2. DSN com Extra Params | S |
| 3. Túnel SSH | M |
| 4. Modal + aba Geral | M |
| 5. Aba Túnel SSH | S |
| 6. Aba Extra Params | M |
| 7. Verificação | S |

## Fora de Escopo

Igual à task vinculada: auth SSH por chave privada, túnel pra outros engines, validação de host key SSH, lista fixa de chaves válidas de Extra Params.

## Status

Todas as 7 fases implementadas 2026-10-14. Ver `.specs/tasks/mysql-ssh-tunnel-and-connection-modal.md` pros critérios de aceite verificados.
