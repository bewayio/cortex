# ADR-0009: MySQL client feature — global connections, locally encrypted credentials

## Status

Accepted (decisions confirmed with the user during `bsdd new` on 2026-09-26; sizing and remaining engineering defaults documented here, to be revisited if implementation surfaces a problem)

## Date

2026-09-26

## Context

The user wants BCode to work as a lightweight database client: configure MySQL connections (more engines later), browse a connection's databases and tables in a sidebar tree, and run SQL in tabs with results, CSV export, clipboard copy, and autocomplete.

This does not change ADR-0002 ("no database" for BCode's own storage — recent workspaces, chat history, etc. stay in local JSON). This ADR is about BCode acting as a *client* to the user's own external MySQL servers, which is a different concern: user data and credentials for servers BCode does not own or run.

Three things needed an explicit decision, asked directly rather than assumed, because guessing wrong here means rework of a large feature:

1. **Connection scope** — one global list, or per-workspace.
2. **Credential storage** — BCode has never stored a secret before (the existing Anthropic API key lives only in the browser's `localStorage`, never written by the Go backend). A database password is a new category of risk.
3. Everything else (driver choice, tree shape, tab persistence, autocomplete data source) is an implementation default, decided here and open to correction during `bsdd plan`/`bsdd start`.

## Decision

### Scope: global connections

Connections are configured once and available regardless of which project folder is open, stored outside any per-workspace file. Matches how a DB client is normally used — a database is not tied to one specific codebase.

### Credential storage: encrypted local file, backend-only key

The user asked how DBeaver does it and suggested "an encrypted config JSON only the backend can read." That is exactly what we do, and it is close to DBeaver's own default (DBeaver's out-of-the-box local storage is likewise an encrypted-at-rest local file, not the OS keychain unless the user turns that on):

- Connections (host, port, user, database-lock, display name) live in `~/.bcode/db/connections.json`, plaintext except the password field.
- The password field is encrypted with AES-256-GCM. The key is a random 32-byte value generated on first use and stored in `~/.bcode/db/key`, file mode `0600` (owner read/write only).
- The frontend never receives a decrypted password. Bound methods that need to actually connect (test, run query) decrypt in Go, use it, and never send it back over the Wails bridge. Editing a saved connection re-prompts for the password rather than round-tripping it to the UI.
- **Explicit limit, stated plainly so it is never oversold**: this protects the password from casual exposure (accidental screenshot of the JSON, syncing `~/.bcode` to cloud storage, a dotfiles backup) but **not** from another process running as the same OS user — that process can read `~/.bcode/db/key` exactly as BCode does. This is the same limit DBeaver's own default has. Real protection against a same-user attacker requires OS keychain integration (`libsecret` on Linux, Keychain on macOS, Credential Manager on Windows), which is a real per-OS-isolated undertaking (restriction 5) and explicitly deferred — see Alternatives.

### Driver and other engines

`github.com/go-sql-driver/mysql` (pure Go, MIT, no cgo — fits ADR-0001's "small binary, Go for system work" and needs no platform-specific build step, unlike a cgo driver). The connection config's "type" field is `mysql` today; other engines (Postgres, SQLite, etc., "no futuro" per the user) are a later ADR when actually requested, not speculatively built now.

## Consequences

### Positive

- One connection list works the same no matter what folder is open — matches how the user actually uses a database client
- No plaintext password on disk; casual exposure (screenshots, cloud-synced dotfiles, `cat`-ing a config file) doesn't leak it
- `go-sql-driver/mysql` needs no cgo, no per-OS build changes, keeps `wails build` as simple as it is today

### Negative

- Not secure against another process running as the same OS user (states its own key's location); OS keychain integration would close this gap but is out of scope for this version
- New Go dependency and a new "Database" entry in `project-dna.md`'s Technology Stack — a real, if small, addition to what BCode ships
- Global scope means one leaked/misconfigured connection is visible from every project, including ones where it is irrelevant — acceptable per the user's explicit choice, but worth remembering if a "hide this connection for this workspace" request comes up later

### Neutral

- The encryption key itself is unencrypted on disk (`0600` permissions is the only protection) — this is a deliberate, disclosed trade-off, not an oversight

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Per-workspace connections (saved in `~/.bcode/workspaces/{id}.json`) | Isolation between projects | Re-enter the same connection for every folder you open; does not match how the user described wanting to use it | Rejected by the user 2026-09-26 |
| Plaintext password in `connections.json` | Simplest | A password sitting in a plain file, easy to leak by accident | Rejected — this is a new class of secret BCode has never stored; the user asked for encryption |
| OS keychain (`libsecret`/Keychain/Credential Manager) | Real protection against a same-user attacker | Three separate platform integrations, extra dependency (`libsecret-dev` on Linux at build time), only two of three OS are verifiable from this machine | Deferred, not rejected — revisit as its own ADR if the encrypted-file approach turns out insufficient for the user's threat model |
| cgo MySQL driver | None material over the pure-Go one | Needs a C toolchain per platform at build time, complicates `wails build` | Rejected, `go-sql-driver/mysql` covers the need with none of the cost |

## References

- `.specs/adrs/0002-local-json-persistence.md` (BCode's own storage — unaffected)
- `.specs/adrs/0006-single-user-local-scope.md` (why OS keychain's added complexity isn't taken on lightly)
- Module: `.specs/modules/database.md`
- Task: `.specs/tasks/mysql-query-tabs.md`
