---
bsdd_version: "1.0"
document_type: source
domain: project
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: [0001, 0002, 0003, 0004, 0005, 0006]
  sync_triggers:
    - Major codebase restructuring
    - Init mode change or re-scan
---

# Discovery Report

> Brownfield scan from `bsdd init`. Tags: **observed**, **inferred**, **user-confirmed**.

## Init Mode

| Field | Value |
|-------|-------|
| Mode | B: document + evolve (user-confirmed) |
| Goal | Documentation + refactoring roadmap |
| Must not change | Stack Wails + React; macOS window layout (`TitleBarHiddenInset`); data format under `~/.bcode` (all user-confirmed) |
| Planned changes | Same window layout on Linux, Windows and macOS with no extra black top bar (user-confirmed, first follow-up via `bsdd new`) |

## Scan Summary

### Structure & modules

| Finding | Tag | Notes |
|---------|-----|-------|
| Wails v2.12 desktop app, Go module `bcode`, Go 1.22 | observed | `go.mod`, `wails.json` |
| Backend is one `App` struct in `app.go` (1153 lines) bound to the frontend | observed | `main.go` `Bind` |
| Frontend React 18 + TS + Vite + Zustand in `frontend/src` (about 3500 lines) | observed | `frontend/package.json` |
| Logical modules inside `app.go`: workspace, files, git, terminal, chat | observed | section comments and function groups |
| Empty `bcode/` file and `__MACOSX/` folder in project root | observed | likely stray artifacts |
| Project root is not a git repository | observed | no `.git` |

### Areas & entry points

| Area | Evidence | Tag |
|------|----------|-----|
| Desktop window (single surface, single user) | `main.go` creates one window | observed |
| No web, admin or client area | no routes, no server | observed |

### Stack

| Layer | Detected | Tag |
|-------|----------|-----|
| Language | Go 1.22, TypeScript 5 | observed |
| Framework | Wails v2.12, React 18, Vite 5 | observed |
| Editor / terminal | Monaco, xterm.js, `creack/pty` | observed |
| State | Zustand stores, `localStorage` for UI prefs | observed |
| Database | none, JSON files in `~/.bcode` | observed |
| Email provider | none | observed |
| Queue / events | Wails runtime events (`chat:token:*`, `terminal:data:*`) | observed |
| AI | `claude` CLI (OAuth) with Anthropic SDK fallback | observed |

### Auth

| Item | Status | Tag |
|------|--------|-----|
| Strategy | none, local single-user app | observed |
| Anthropic API key | env `ANTHROPIC_API_KEY` or passed from frontend | observed |
| Password recovery / profiles / admin roles | not applicable | inferred |

### Communication patterns

| Channel | Current approach | BSDD recommendation | Tag |
|---------|------------------|---------------------|-----|
| Email | none | not needed | observed |
| Domain events | Wails events, ephemeral | Outbox not needed (no persistence of intent) | inferred |
| External APIs | Anthropic API via SDK fallback | none | observed |

### Migrations

| Item | Current | BSDD recommendation | Tag |
|------|---------|---------------------|-----|
| Location | none | not needed, no database | observed |
| File formats | `recent.json`, `workspaces/{id}.json`, `chats/{ws}/{tab}.json`, `last_workspace.txt` | keep compatible (user constraint) | observed |

### UI

| Surface | Style detected | Responsive | Admin CRUD pattern |
|---------|----------------|------------|--------------------|
| Desktop window | VS Code dark (`#1e1e1e`, accent `#007ACC`), activity bar, sidebar, tabs, status bar | resizable panes, min 800x500 | n/a |

## Platform findings (relevant to the requested layout change)

| Finding | Tag | Notes |
|---------|-----|-------|
| `app-titlebar` is a fixed 44px bar with 80px left padding for macOS traffic lights | observed | `components.css`, `App.tsx` |
| Only macOS sets `TitleBarHiddenInset`; Linux and Windows keep the native title bar | observed | `main.go` |
| On Linux and Windows the 44px bar renders below the native title bar, giving the black strip | observed | user screenshot |
| Only `build/darwin` exists, no `build/linux` or `build/windows` | observed | `build/` |
| `RevealInFinder` runs `open -R`, macOS only | observed | `app.go` |
| Terminal uses `$SHELL` with `/bin/zsh` fallback and `creack/pty` | observed (code), inferred (Windows impact) | likely does not build or run on Windows, needs verification |
| `findClaudeCLI` searches Unix paths only | observed | Windows not covered |
| `frontend/package-lock.json` was generated on macOS; Linux needs `@rollup/rollup-linux-x64-gnu` | observed | fixed locally with `--no-save` |

## Gap Analysis (mode B)

| BSDD default | Current state | Priority | Proposed task/ADR |
|--------------|---------------|----------|-------------------|
| Consistent cross-platform layout | Mac differs from Linux/Windows | High | `bsdd new` for unified window chrome (user request) |
| Cross-platform support | Mac-first code paths | High | task: platform audit (reveal file, shell, claude lookup, PTY on Windows) |
| Module independence | Single `app.go` with 5 concerns | Medium | task: split `app.go` by module, same package |
| Tests | none | Medium | task: add Go tests for git parsing and file ops |
| Inbox / Outbox | not applicable | none | ADR-0006 |
| Migrations | not applicable | none | ADR-0006 |
| JWT / baseline capabilities | not applicable | none | ADR-0006 |
| Docs in `docs/` per global rules | absent | Low | create `docs/ARCH.md` and `docs/frontend.md` from these specs |
| Lockfile portable across OS | mac-only optional deps | Medium | task: regenerate lockfile on Linux and macOS |

## Uncertainties

- Windows support is a goal (user asked for equal layout on Windows) but the build has never been verified there.
- Release and packaging targets for Linux and Windows are not defined.
- Design direction is documented from code, not yet confirmed by the user.

## Source Material

- Paths scanned: `main.go`, `app.go`, `wails.json`, `go.mod`, `frontend/src/**`, `frontend/package.json`, `build/`
- Docs used: none in project
- Date of scan: 2026-09-21
