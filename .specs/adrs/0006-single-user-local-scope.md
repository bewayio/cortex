# ADR-0006: Single-user local scope, BSDD defaults excluded

## Status

Accepted (as-implemented, documented by `bsdd init` on 2026-09-21)

## Date

2026-09-21

## Context

BSDD defaults assume a server product: JWT auth, baseline capabilities (password recovery, profiles, admin roles), Inbox for email, Outbox for events, central SQL migrations, admin CRUD UI.

## Decision

These defaults are excluded. BCode is a local single-user desktop app with no accounts, no email or SMS, no database and no admin area. Wails events are ephemeral UI streams, not domain events. If sync, accounts or telemetry are added, a new ADR must revisit this.

## Consequences

### Positive

- No dead specs for features that do not exist

### Negative

- Local trust model: any code running as the user has full access

### Neutral

- Doctor and review checks for auth, inbox, outbox and migrations should be treated as not applicable

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Adopt defaults anyway | Uniform | Over-engineering | No matching feature |

## References

- `.specs/project/discovery-report.md`
