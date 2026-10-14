---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-14
version: 3
connections:
  parent: .specs/modules/database.md
  children: []
  related_adrs: [0009]
  sync_triggers:
    - Status change
---

# Task: Túnel SSH opcional pra conexões MySQL + modal de conexão com abas

## Status

`in-progress` — todas as 7 fases implementadas 2026-10-14 (ver `.specs/tasks/mysql-ssh-tunnel-and-connection-modal-plan.md`); não marcada `done` só porque a verificação interativa (testar com túnel SSH e MySQL de verdade) precisa do usuário — sem ferramenta de automação de GUI nem servidor SSH/MySQL de teste disponível neste ambiente.

## Objetivo

Duas mudanças relacionadas na feature de conexões MySQL:

1. Suporte a túnel SSH **opcional por conexão** — algumas conexões do usuário precisam passar por um túnel SSH pra alcançar o MySQL, outras não (continuam direto, como hoje).
2. O formulário de criar/editar conexão vira um **modal com abas** (hoje é inline, dentro da árvore da sidebar) — inspirado no padrão do DBeaver (imagem anexada pelo usuário mostra a aba "Driver properties" dele, só como referência de *layout*, não de nomes de parâmetro — ver Critérios de Aceite). Uma aba ganha uma lista de parâmetros extras **chave/valor**, que vêm pré-preenchidos com defaults, e se o usuário mudar um valor, essa mudança passa a valer como default pras próximas conexões novas (não retroage nas já existentes).

## Contexto

Pedido do usuário, 2026-10-14, com uma imagem de referência (UI do DBeaver: tabela de "Driver properties" com coluna Nome/Valor, várias linhas tipo `allowPublicKeyRetrieval = TRUE`).

**Decisões já confirmadas com o usuário:**
- **Auth do túnel SSH**: só senha por enquanto (usuário/senha SSH) — chave privada fica de fora desta task, pode ser pedida depois se precisar.
- **Modelo do túnel**: campos separados — host/porta do **servidor SSH** (bastion) + usuário/senha SSH, e host/porta do **MySQL como visto de dentro do túnel** (tipicamente `127.0.0.1:3306`, já que é comum o MySQL só aceitar conexão local na própria máquina do servidor remoto). Os campos do túnel só aparecem/ficam habilitados quando o usuário liga um toggle "usar túnel SSH" — e isso tudo fica numa aba própria do modal (não misturado com os campos gerais).
- **Estrutura do modal, confirmada pelo pedido original**: pelo menos duas abas — "Geral" (nome, host, porta, usuário, senha, banco travado, pasta — os campos que já existem hoje no formulário inline) e "Extra Params" (parâmetros chave/valor). O túnel SSH, por ter campos próprios e um toggle de liga/desliga, fica melhor como uma **terceira aba** ("Túnel SSH") — mais perto do próprio DBeaver (que separa "Main" / "SSH" / "Driver properties" em abas distintas) do que espremer tudo em duas.

**Decisões técnicas (minha leitura do código, não perguntei — mas documentando o porquê):**
- **"Extra Params" não são os nomes do MySQL Connector/J (a imagem do DBeaver)** — o backend usa `github.com/go-sql-driver/mysql` (driver Go puro, ver ADR-0009), que tem seu próprio conjunto de parâmetros de DSN (`parseTime`, `loc`, `charset`, `allowNativePasswords`, `tls`, etc. — nomes e semântica diferentes dos parâmetros JDBC da imagem, tipo `allowPublicKeyRetrieval`). A imagem é referência só de **layout** (tabela chave/valor numa aba própria do modal de conexão), não uma lista de parâmetros a copiar literalmente.
- **DSN hoje é fixo**: `openConn` (`database.go`) monta `"%s:%s@tcp(%s:%d)/%s?parseTime=true"` — só `parseTime=true` hardcoded, nenhum parâmetro configurável. Os "Extra Params" viram pares chave/valor anexados na query string do DSN; `parseTime=true` migra de hardcoded pra um default pré-preenchido do novo sistema (continua valendo pra conexões já existentes — ver Critérios de Aceite sobre migração).
- **Túnel SSH via `golang.org/x/crypto/ssh`**: já é dependência indireta hoje (`go.sum`), passaria a direta. Padrão idiomático com `go-sql-driver/mysql`: abrir um `*ssh.Client`, registrar um dialer customizado via `mysql.RegisterDialContext` que usa `sshClient.DialContext` em vez do dial TCP direto, e referenciar esse network name customizado na DSN da conexão (`user:pass@<network-customizado>(host:port)/db`) — isso faz toda query passar pelo túnel sem reimplementar nada do protocolo MySQL.
- **Senha do túnel SSH**: mesmo esquema de criptografia já usado pra senha do MySQL (AES-256-GCM, mesma chave em `~/.bcode/db/key` — ADR-0009), não um esquema novo.
- **Persistência do default de Extra Params**: um novo arquivo pequeno (ex: `~/.bcode/db/default_extra_params.json`), seguindo o mesmo padrão dos outros arquivos de preferência já existentes nesse diretório. Qualquer save de conexão (nova ou edição) que altere os Extra Params atualiza esse default global — não é por conexão, é um "último valor usado vira o próximo padrão sugerido", como pedido.

## Critérios de Aceite

### Túnel SSH
- [x] `DBConnection`/`DBConnectionInput`/`storedConnection` (`database.go`) ganharam: `UseSSHTunnel bool`, `SSHHost string`, `SSHPort int`, `SSHUser string`, `SSHPassword string` (`storedConnection.SSHPasswordEnc`, criptografada com o mesmo esquema AES-256-GCM da senha do MySQL — nunca volta pro frontend em texto plano).
- [x] Quando `UseSSHTunnel` é `true`, `openConn` chama `sshTunnelDialFunc(sc)` registrado via `mysql.RegisterDialContext` num network name único por conexão (`sshTunnelNetwork(sc.ID)` → `"sshtunnel-"+id`, evita colisão entre conexões diferentes com túnel ao mesmo tempo) — cada dial abre um `*ssh.Client` novo (senha SSH), evitando ter que coordenar o ciclo de vida de um client compartilhado com `*sql.DB.Close()` (este app sempre faz `db, _, err := openConn(...); defer db.Close()` logo após o uso, nunca um pool de longa duração). O host/porta do MySQL nesse caso são resolvidos **de dentro do túnel**.
- [x] Quando `UseSSHTunnel` é `false` (ou ausente, conexões antigas), comportamento idêntico ao de hoje — `buildDSN` usa `network: "tcp"`, dial direto, sem exigir nenhum campo SSH preenchido.
- [x] `TestDBConnection` passa pelo túnel quando configurado — reusa `openConn` sem nenhuma mudança própria.
- [x] Falha no túnel retorna erro prefixado `"ssh tunnel: ..."`, distinto de um erro de MySQL em si — verificado com um teste Go descartável (SSH host inalcançável).

### Modal de conexão com abas
- [x] Criar/editar conexão abre `ConnectionModal.tsx` (reaproveita `.modal-overlay`/`.modal-dialog-wide`, mesmo padrão do `SettingsModal.tsx`) com 3 abas: **Geral**, **Túnel SSH** ("connectionModal.tabSSH"), **Extra Params**. O formulário inline antigo (dentro de `git-section-content`) foi removido de `DatabasePanel.tsx`.
- [x] Aba Geral: os mesmos campos de antes, comportamento idêntico, só o contêiner mudou.
- [x] Aba Túnel SSH: toggle "Usar túnel SSH"; campos de host/porta/usuário/senha do túnel desabilitados (`disabled`) quando o toggle está desligado; dica de texto explicando que o host/porta da aba Geral são resolvidos de dentro do túnel.
- [x] Aba Extra Params: tabela de pares chave/valor (`paramRows`, estado local da lista — não editado direto como `Record`, pra uma chave sendo renomeada no meio não colidir/sumir), com adicionar/remover linha. Pré-preenche via `GetDefaultExtraParams()` (novo método Go exposto) só quando é uma conexão nova E ainda sem Extra Params (não sobrescreve o que o usuário já digitou numa reabertura da mesma sessão do modal); ao editar uma existente, usa `c.extraParams` dela.
- [x] `SaveDBConnection` (Go) atualiza `default_extra_params.json` sempre que os Extra Params salvos diferem do default atual (`sameExtraParams`) — last-write-wins, qualquer conexão.
- [x] Migração implícita: `effectiveExtraParams` (Go) cai pro default global (`loadDefaultExtraParams`, seed `{"parseTime":"true"}`) quando a conexão não tem Extra Params salvos — nunca escreve isso de volta sozinho no load, só resolve o valor efetivo a usar (DSN building).
- [x] Botão "Testar" migrado pro modal, mesmo texto/ícone, continua funcionando (inclui o túnel SSH quando configurado, via `openConn`).
- [x] Verificação: `go build ./...`, `go vet ./...`, `gofmt -l .` limpos; `tsc --noEmit`, `vite build` limpos; dois testes Go descartáveis (DSN com network de túnel, falha rápida num SSH host inalcançável) passaram e foram removidos depois.
**Não verificado por mim** (sem ferramenta de automação de GUI, sem servidor SSH/MySQL de teste neste ambiente): testar uma conexão de verdade com e sem túnel SSH, editar Extra Params na UI de verdade, confirmar a persistência do default entre duas conexões novas abertas em sequência.

## Módulos Afetados

- `database` (principal — `database.go`'s struct de conexão, `openConn`, novo arquivo de default de Extra Params; `DatabasePanel.tsx`'s formulário inline vira um novo `ConnectionModal.tsx`)

## Fora de Escopo

- Autenticação do túnel SSH por chave privada (só senha por enquanto — confirmado com o usuário).
- Suporte a túnel SSH pra outros engines além de MySQL (não existe outro engine hoje).
- Validação/autocomplete de quais chaves de Extra Params existem no `go-sql-driver/mysql` (o usuário digita chave/valor livremente — sem uma lista fixa de opções válidas, pelo menos nesta versão).
- Agent SSH (`ssh-agent`)/`known_hosts` verification — a conexão SSH usa `ssh.InsecureIgnoreHostKey()` ou equivalente por padrão nesta versão; validação de host key fica pra uma iteração futura se o usuário pedir.

## Próximo Passo

Rodar `bsdd plan` pra transformar isso num plano de implementação — dado o tamanho (dependência SSH nova, mudança de schema de dados persistidos, redesign de UI de inline pra modal com 3 abas), é uma boa candidata a várias fases.
