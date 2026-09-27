---
bsdd_version: "1.0"
document_type: source
domain: project
last_updated: 2026-09-21
version: 1
connections:
  parent: project-state
  children:
    - .specs/project/vision.md
    - .specs/architecture/overview.md
  related_adrs: [0001, 0002, 0003, 0004, 0005, 0006, 0007, 0008, 0009]
  sync_triggers:
    - Changes to technology stack
    - Changes to architecture
    - New restrictions or anti-patterns
---

# Project DNA

> First document every AI session must read before working.

## Mission

BCode is a lightweight desktop code workbench. It combines a file explorer, Monaco editor, integrated terminals, Git tools and a Claude chat in one window, for a single developer working on local folders.

## Vision

Same look and behavior on Linux, Windows and macOS, with fast startup and no account or server. See `.specs/project/vision.md`.

## Architecture Summary

- **Style:** desktop monolith (Wails shell, Go backend, React frontend), logical modules inside one Go package
- **Architecture Spec:** `.specs/architecture/overview.md`
- **Init mode:** B (document + evolve). Planned changes are marked `planned`.

## Technology Stack

| Layer | Technology | ADR Reference |
|-------|-----------|---------------|
| Shell | Wails v2.12 | 0001 |
| Backend language | Go 1.24 (bumped from 1.22 on 2026-09-26 by `go-sql-driver/mysql`'s own `go.mod` requirement, via `go mod tidy`) | 0001 |
| Frontend | React 18, TypeScript 5, Vite 5, Zustand | 0001 |
| Editor / terminal | Monaco, xterm.js, creack/pty | 0004 |
| Database | none for BCode itself (ADR-0002); MySQL client feature, `go-sql-driver/mysql` (shipped 2026-09-26) | 0002, 0009 |
| Storage | JSON files in `~/.bcode` | 0002 |
| AI | claude CLI, Anthropic SDK fallback | 0003 |
| VCS | git CLI via `exec` | 0005 |
| Deployment | local binary per OS (`wails build`) | 0001 |
| Monitoring | none | |

## Conventions

### Naming

- Go: exported methods on `App` are the frontend API, PascalCase
- React components: PascalCase files in `frontend/src/components`
- Stores: `xxxStore.ts` in `frontend/src/stores`
- CSS classes: kebab-case with area prefix (`app-`, `cc-`), styles in `frontend/src/styles`
- Wails events: `domain:action:{id}` (for example `chat:token:{sessionID}`)

### Structure

- `main.go`, `window_options.go`: window options and Wails bootstrap
- `app.go`: all backend methods, grouped by module sections
- `frontend/src`: `components/`, `stores/`, `styles/`, `utils/`
- `frontend/wailsjs`: generated bindings, never edited by hand
- `build/`: per-OS packaging assets (only `darwin` today)
- `docs/`: `frontend.md`, `plans/` exist. `ARCH.md` and `rules/` are `planned`

### Commits

- Format: not defined. Project is not a git repository yet.

## Patterns

### Module Communication

- [x] Public services: frontend calls bound `App` methods
- [x] Events: backend pushes streams through Wails events
- [ ] Interfaces between backend modules (`planned`, after `app.go` split)

### Data Access

Direct filesystem access through `os` and `filepath`. Base directory is `bcodeDir()` = `~/.bcode`. No repository layer.

### Error Handling

Bound methods return `error` to the frontend. Streams emit `chat:error:{id}`. Terminal read errors go to `runtime.LogError`.

### Logging

Wails runtime logger only. No structured logging.

### Authentication & Authorization

Not applicable. Single-user local app. See ADR-0006.

### Database Migrations

Not applicable. No database. Persisted JSON formats must stay backward compatible.

## Restrictions

| # | Restriction | Rationale |
|---|-------------|-----------|
| 1 | Keep Wails v2 + Go + React stack | User-confirmed |
| 2 | Keep macOS window layout as visual reference | User-confirmed |
| 3 | Keep `~/.bcode` file formats compatible | User-confirmed, existing user data |
| 4 | No hardcoded secrets or API keys | Security |
| 5 | Platform-specific code must be isolated and have a Linux, Windows and macOS branch | Same behavior on all OS |
| 6 | Never edit `frontend/wailsjs` by hand | Generated |

## Goals

| Goal | Metric | Target | Deadline |
|------|--------|--------|----------|
| Identical window layout on all OS | No extra top bar; same chrome | 3 of 3 OS | not set |
| Cross-platform build | `wails build` passes | Linux, Windows, macOS | not set |

## Anti-patterns

| Anti-pattern | Why It Fails | Alternative |
|--------------|--------------|-------------|
| Assuming macOS in UI (fixed padding for traffic lights) | Breaks Linux and Windows | Detect platform, or draw one shared chrome |
| Calling `open`, `/bin/zsh` or Unix paths without a fallback | Fails on Windows and some Linux | Branch on `runtime.GOOS` |
| Committing a lockfile with only one OS's optional deps | `npm run build` fails on other OS | Regenerate lockfile with all platforms |

## Opinionated Defaults

| Domain | Default | Rationale |
|--------|---------|-----------|
| Communication | Inbox / Outbox not used | No external delivery, see ADR-0006 |
| Security | Local trust model, no auth | Single user |
| Documentation | Living docs synced via BSDD | Single source of truth |
| Layout & UX | See `.specs/ui/design-direction.md` | Desktop editor style |
| Baseline capabilities | Excluded | ADR-0006 |
| Migrations | Excluded | ADR-0006 |
