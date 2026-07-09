# ADR 0002: Live exchange rates for aggregate views

## Status

Accepted.

## Context

Users may record transactions in multiple currencies while expecting a readable single financial summary.

## Decision

Preserve each transaction's entered amount and currency. Convert dashboard, budget, and report aggregates to the user's selected base currency using live exchange rates. Cache rates locally and display their freshness.

## Consequences

- Original-currency amounts remain auditable and stable.
- Aggregate values can change when rates refresh.
- Offline and unavailable-rate states need explicit UI: use cached stale rates when available; otherwise show non-combined original-currency figures.
- An exchange-rate provider and a rate-refresh strategy will be required before this behavior can be shipped.
