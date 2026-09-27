---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: [0001, 0004, 0006]
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Initial setup and evolution roadmap

## Status

proposed

## Goal

Bring the brownfield project under BSDD and queue the first evolution items (mode B).

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Architecture: `.specs/architecture/overview.md`
- Discovery: `.specs/project/discovery-report.md`
- ADRs: `.specs/adrs/0001` to `0006`

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries are known
- [x] Related ADRs reviewed
- [x] Security implications identified

## Acceptance Criteria

Roadmap, in priority order. Each item becomes its own task through `bsdd new` and `bsdd plan`.

1. **Unified window chrome (user request, first).** No extra black strip on Linux and Windows. Same layout as macOS on all three. Split into `.specs/tasks/unified-window-chrome.md` with ADR-0007 (accepted: frameless window and one shared title bar).
2. **Cross-platform audit.** Reveal-in-file-manager, default shell, `findClaudeCLI`, PTY on Windows, `build/linux` and `build/windows` assets.
3. **Portable lockfile.** Regenerate `frontend/package-lock.json` so it includes Linux, Windows and macOS optional dependencies.
4. **Split `app.go` by module** (same package), remove or isolate `TestImageStream` and `TestClaudeChat`.
5. **Tests** for git output parsing and file operations.
6. **Project hygiene.** Remove stray `bcode` file and `__MACOSX/`, initialize git, create `docs/ARCH.md` and `docs/frontend.md` from these specs.
7. **Confirm** vision and design direction with the user.
8. **Terminal changes (user request).** Plain terminal only: `.specs/tasks/terminal-plain-only.md`. Shift+Enter fix: `.specs/tasks/terminal-shift-enter.md`. Image paste: `.specs/tasks/terminal-image-paste.md` (ADR-0008).
9. **Usage sidebar panel (user request).** Claude Code token usage chart plus recent projects, new `usage` module: `.specs/tasks/sidebar-usage-panel.md`. Corrected 2026-09-26 to an editor tab, not a sidebar panel.
10. **Home icon + recently-closed projects (user request).** `.specs/tasks/home-icon-and-closed-projects.md`.
11. **MySQL client (user request).** Global connections, sidebar tree, query tabs, new `database` module, ADR-0009: `.specs/tasks/mysql-query-tabs.md`.
12. **Two project lists, global shortcuts, command palette (user request).** Replaces the "recently closed" list from item 10 with a simpler two-list model, adds Ctrl/Cmd+Tab, Ctrl/Cmd+P (fixed cross-platform), Ctrl/Cmd+Shift+P, Ctrl/Cmd+Q, and keyboard-driven open in the file/database trees. Always opens on Home: `.specs/tasks/quick-navigation-and-shortcuts.md`.

## Implementation Notes

- Do not change the Wails + React stack, the macOS layout or the `~/.bcode` formats.
- Item 1 has a task, an accepted ADR and a plan (`docs/plans/2026-09-21_unified-window-chrome.md`). Next command: `bsdd start unified-window-chrome`.

## Definition Of Done

- [ ] Specs reviewed by Documentation Review
- [ ] Roadmap items converted to tasks
- [ ] Sync Review completed if source docs changed
