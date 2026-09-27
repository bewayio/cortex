# ADR-0003: Claude chat through local CLI with SDK fallback

## Status

Accepted (as-implemented, documented by `bsdd init` on 2026-09-21)

## Date

2026-09-21

## Context

Users already log in to Claude Code. Asking for a separate API key adds friction.

## Decision

`StartChatStream` uses the `claude` CLI (OAuth, stream-json) when found. Otherwise it uses `anthropic-sdk-go` with a key from the caller or `ANTHROPIC_API_KEY`. Output streams to the frontend through `chat:*` events.

## Consequences

### Positive

- No key needed for logged-in users

### Negative

- CLI lookup covers Unix paths only
- CLI flag or format changes can break streaming
- SDK version is alpha (`v0.2.0-alpha.13`)

### Neutral

- History is stored by BCode, not by the CLI

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| SDK only | Stable contract | Needs API key | Friction |

## References

- `app.go` `StartChatStream`, `startChatViaCLI`, `startChatViaSDK`
