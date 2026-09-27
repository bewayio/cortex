---
bsdd_version: "1.0"
document_type: source
domain: areas
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: [0001]
  sync_triggers:
    - Area responsibilities change
    - User groups change
    - Module exposure changes
---

# Area: desktop-window

## Purpose

The single application window. Hosts the editor workbench.

## Users

| User Group | Goal | Access Level |
|------------|------|--------------|
| Individual developer | Work on local folders | Full local access |

## Capabilities

| Capability | Module(s) | Permission |
|------------|-----------|------------|
| Open and switch workspaces | workspace | local |
| Browse and edit files | files | local |
| Review Git changes | git | local |
| Run terminals | terminal | local |
| Chat with Claude | chat | needs claude CLI or API key. Planned: no UI entry, see `tasks/terminal-plain-only.md` |
| Window chrome, panels, resize | shell | local |
| View Claude Code token usage and recent projects | usage | local, read-only over `~/.claude` |
| Connect to and query MySQL databases | database | local, network to user-configured hosts |

## Entry Points

| Entry Point | Type | Notes |
|-------------|------|-------|
| Main window 1280x800, min 800x500, maximised on start | desktop | `main.go`, `startup` |

## Security

- Authentication requirements: none
- Authorization model: OS user
- Sensitive operations: file delete, shell execution, API key use

## Related Modules

- `.specs/modules/workspace.md`, `files.md`, `git.md`, `terminal.md`, `chat.md`, `shell.md`, `usage.md`, `database.md`

## Layout & UX

- Design direction: `.specs/ui/design-direction.md`
- Responsive: resizable panes with minimum window size. Mobile breakpoints do not apply to a desktop window.

## Baseline Capabilities

Excluded by ADR-0006.
