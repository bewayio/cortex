# ADR-0005: Git data through the git CLI

## Status

Accepted (as-implemented, documented by `bsdd init` on 2026-09-21)

## Date

2026-09-21

## Context

The app shows status, log, graph and diffs.

## Decision

We run the system `git` with `runGit(dir, args...)` and parse its output in Go.

## Consequences

### Positive

- Exact git behavior, no extra library

### Negative

- Requires `git` in PATH
- Output parsing is fragile and has no tests

### Neutral

- Read-only module

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| go-git | No external binary | Slower, feature gaps | Not chosen originally |

## References

- `app.go` git section
