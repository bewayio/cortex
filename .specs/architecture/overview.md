---
bsdd_version: "1.0"
document_type: source
domain: architecture
last_updated: 2026-09-27
version: 1
connections:
  parent: .specs/project/project-dna.md
  children:
    - .specs/areas/
    - .specs/modules/
  related_adrs: [0001, 0002, 0003, 0004, 0005, 0006, 0007, 0008, 0009]
  sync_triggers:
    - Architecture style changes
    - Module boundary changes
    - Communication pattern changes
---

# Architecture Overview

> As-implemented (brownfield, mode B). Planned items are marked `planned`.

## Architecture Style

- **Style:** desktop monolith. One Wails process, Go backend, WebView frontend.
- **Rationale:** single-user local tool, no network service needed.
- **Related ADRs:** 0001, 0002, 0006

## System Context

```
User ── WebView (React) ══ Wails bridge ══ Go App
                                            ├─ ~/.bcode (JSON files)
                                            ├─ local folders (os)
                                            ├─ git CLI
                                            ├─ shell via PTY
                                            └─ claude CLI  |  Anthropic API (fallback)
```

## Areas

| Area | Purpose | Users | Entry Points |
|------|---------|-------|--------------|
| desktop-window | The only surface: editor workbench | Individual developer | Main window (`main.go`, `App.tsx`) |

## Modules

Logical modules. Backend code lives in `app.go` (`planned`: split into one file per module, same package).

| Module | Purpose | Owns | Public Interface |
|--------|---------|------|------------------|
| workspace | Recent folders and per-workspace state | `recent.json`, `last_workspace.txt`, `workspaces/{id}.json` | `GetRecentWorkspaces`, `SaveWorkspace`, `RemoveWorkspace`, `GetLastWorkspaceID`, `SaveWorkspaceState`, `LoadWorkspaceState`, `OpenDirectoryDialog` |
| files | Read and change files in a workspace | Files on disk under the workspace | `GetFileTree`, `ReadFile`, `WriteFile`, `GetFileInfo`, `CreateFile`, `CreateDirectory`, `RenameFile`, `DeleteFile`, `RevealInFinder` |
| git | Read repository state | nothing persisted | `GitStatus`, `GitLog`, `GitGraphLog`, `GitCurrentBranch`, `GitDiff`, `GitOriginalContent`, `GitCommitMeta`, `GitCommitFileDiffs` |
| terminal | PTY sessions | live sessions in memory | `StartTerminal`, `TerminalInput`, `TerminalResize`, `CloseTerminal`; events `terminal:data:{id}`, `terminal:exit:{id}` |
| chat | Claude conversations | `chats/{ws}/{tab}.json` | `StartChatStream`, `StopChatStream`, `SaveChatMessages`, `LoadChatMessages`, `DeleteChatMessages`, `ListChatTabs`; events `chat:token:{id}`, `chat:done:{id}`, `chat:error:{id}` |
| shell (frontend) | Window chrome and layout | UI prefs in `localStorage` (`bcode.*`) | `App.tsx`, `ActivityBar`, `Sidebar`, `StatusBar`, `app-titlebar` |
| usage | Claude Code token usage from local session logs | nothing persisted, reads `~/.claude/projects` | `GetClaudeTokenUsage` |
| database | MySQL client: connections, tree, query tabs | `~/.bcode/db/`, `~/.bcode/queries/` | `ListDBConnections`, `SaveDBConnection`, `DeleteDBConnection`, `TestDBConnection`, `ListDatabases`, `ListTables`, `DescribeTable`, `RunQuery`, `ListSavedQueries`, `SaveQueryTab`, `DeleteQueryTab` |
| release (`planned`) | Build and publish desktop binaries via CI | `.github/workflows/release.yml`, the rolling release on `bewayio/bcode` | N/A — GitHub Actions pipeline, not a runtime API |

## Communication

| Source | Target | Mechanism | Contract |
|--------|--------|-----------|----------|
| Frontend | Backend | Wails bound methods (public services) | `frontend/wailsjs/go/main/App.d.ts` |
| Backend | Frontend | Wails events, streaming | names in module table |
| Backend | claude CLI | subprocess, stream-json | ADR-0003 |
| Backend | git | subprocess | ADR-0005 |

Inbox and Outbox are not used. See ADR-0006.

## Data Ownership

| Data / Entity | Owning Module | Access Rules |
|---------------|---------------|--------------|
| Workspace, WorkspaceState | workspace | only via workspace methods |
| Chat messages | chat | only via chat methods |
| File content | files | editor reads and writes through files |
| Git data | git | read-only, comes from the repo |
| UI prefs | shell | `localStorage`, per machine |

Today the modules share the `App` struct. Cross-module calls are not yet forbidden by code structure (`planned`).

## Database Migrations

Not applicable. No database. JSON files must stay backward compatible.

## Security Boundary

- Authentication: none
- Authorization: OS user permissions
- External inputs: file paths and shell input come from the local user. Chat and tab IDs are sanitized before use as file names.
- Sensitive data: Anthropic API key from env or frontend, never stored by the backend (observed, needs confirmation for the frontend side)

## Deployment View

`wails build` per OS. Dev: `wails dev`. Only macOS packaging assets exist in `build/`.

## Architecture Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mac-only code paths | Broken features on Linux and Windows | Platform audit task |
| Monolithic `app.go` | Coupling | Split by module |
| `creack/pty` on Windows | No terminal on Windows | Verify, ADR if replaced |
| Native title bar plus custom bar | Extra black strip | Resolved by ADR-0007. Windows and macOS still unverified |
