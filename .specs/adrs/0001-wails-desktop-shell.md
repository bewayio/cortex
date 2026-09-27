# ADR-0001: Wails v2 desktop shell with Go backend and React frontend

## Status

Accepted (as-implemented, documented by `bsdd init` on 2026-09-21)

## Date

2026-09-21

## Context

The app needs a native window, filesystem access, PTY and subprocesses, plus a rich UI (Monaco, xterm). The user confirmed the stack must stay.

## Decision

We use Wails v2.12 with a Go backend exposed as bound methods on one `App` struct, and a React 18 + TypeScript + Vite + Zustand frontend embedded from `frontend/dist`.

## Consequences

### Positive

- Small native binary, Go for system work, web tech for UI
- Same UI code on all OS

### Negative

- Window chrome differs per OS (macOS hidden-inset title bar vs native bars)
- WebView differs per OS (WebKitGTK, WebView2, WKWebView)
- Single `App` struct encourages coupling

### Neutral

- Bindings in `frontend/wailsjs` are generated

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Electron | Uniform Chromium | Heavy | Stack fixed by user |
| Tauri | Small | Rust backend | Stack fixed by user |

## References

- `main.go`, `wails.json`
