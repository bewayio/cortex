# ADR-0004: Integrated terminal through PTY and xterm.js

## Status

Accepted (as-implemented, documented by `bsdd init` on 2026-09-21)

## Date

2026-09-21

## Context

Users need real interactive shells inside the app.

## Decision

The backend starts `$SHELL` (fallback `/bin/zsh`) with `creack/pty` and streams base64 output through `terminal:data:{id}`. The frontend renders with xterm.js and keeps terminals mounted while hidden.

## Consequences

### Positive

- Full interactive shell behavior

### Negative

- `creack/pty` v1.1.21 targets Unix. Windows support is unverified and likely needs ConPTY
- Fallback shell is macOS-specific

### Neutral

- Base64 avoids UTF-8 corruption in JSON events

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| ConPTY library on Windows | Works on Windows | More code | Decide in the platform audit |

## References

- `app.go` terminal section, `Terminal.tsx`
