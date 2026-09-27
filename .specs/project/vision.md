---
bsdd_version: "1.0"
document_type: source
domain: project
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: []
  sync_triggers:
    - Changes to product goals
    - Changes to target users
    - Changes to success metrics
---

# Vision

## Problem

Developers who work with Claude Code need one small window with editor, terminal, Git and chat, without a heavy IDE. It must feel the same on every OS.

## Users

| User Group | Need | Success Signal |
|------------|------|----------------|
| Individual developer | Edit files, run terminals, review Git, chat with Claude in one place | Works on a local folder with no setup |
| Cross-platform developer | Same layout on Linux, Windows and macOS | No visual difference between OS |

## Outcomes

| Outcome | Metric | Target |
|---------|--------|--------|
| Consistent window chrome | OS with identical layout | 3 of 3 |
| Local-first | Accounts or servers needed | 0 |

## Scope

### In Scope

- Workspaces, file explorer, editor tabs, Markdown and Mermaid preview
- Integrated terminals with persistent tabs
- Git status, diff, log and commit graph
- Claude chat with attachments, via CLI or API key

### Out of Scope

- Multi-user features, cloud sync, accounts
- Plugin system (not observed, not planned)

## Constraints

- Wails v2, Go and React stay (user-confirmed)
- `~/.bcode` data stays compatible (user-confirmed)
- Vision is inferred from code and needs user confirmation

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Windows never built or tested | Feature gap | Platform audit task |
| Single 1153-line `app.go` | Hard to change safely | Split by module |
| No tests | Regressions | Add tests for git and file ops |
| Frameless window chrome differs per window manager on Linux | Layout drift | Decide in ADR via `bsdd new` |
