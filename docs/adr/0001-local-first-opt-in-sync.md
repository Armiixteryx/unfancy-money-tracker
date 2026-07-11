# ADR 0001: Local-first data with opt-in cloud sync

## Status

Accepted.

## Context

The product should be immediately usable without an account while supporting backup and multi-device access for users who choose it.

## Decision

Persist anonymous user data locally by default. Offer optional email-and-password sign-up/sign-in from Settings. On first sync, merge local and cloud data rather than replacing either dataset. Present same-record conflicts for explicit user resolution. Preserve duplicate candidates with different UUIDs and allow users to review them later without blocking unrelated sync.

## Consequences

- The core tracker works offline and without authentication.
- Sync requires a migration/upload flow for existing local data.
- Conflict and offline-recovery states are first-class product requirements.
- A backend and authentication service will be required before sync can be shipped.
