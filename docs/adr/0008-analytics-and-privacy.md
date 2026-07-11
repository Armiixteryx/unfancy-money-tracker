# ADR 0008: Analytics and privacy

## Status

Accepted.

## Context

Unfancy Money Tracker needs product analytics to evaluate core flows, but it handles sensitive financial information. PostHog must therefore collect only intentional, non-sensitive product signals, with explicit user consent and protections against accidental capture through automatic instrumentation or session replay.

## Decision

### Consent and identity

Analytics is opt-in and disabled by default. Anonymous users may explicitly enable it. After signup or sign-in, the explicit consent choice syncs across the account’s devices; it is not enabled implicitly by account creation.

Persist a random anonymous PostHog distinct ID locally. Link that anonymous identity to an opaque account subject only after signup or sign-in. Never use an email address or other direct identifier as an analytics identity.

When a user opts out, stop future capture and flush events already queued by the SDK, then keep analytics disabled until the user opts in again.

### PostHog capture and retention

Use PostHog Cloud with environment-specific project keys supplied through runtime configuration. Do not commit project keys or production analytics credentials.

Enable automatic capture with strict redaction and session replay with masking. Preserve layout and interaction timing, but mask all user-entered text and financial values, including amounts, descriptions, categories, dates, chart values, and transaction rows.

Use the PostHog provider’s default retention policy in v1. Do not add a custom retention period.

### Event contract

Guarantee these core events:

- `dashboard_viewed`;
- `report_viewed`;
- `transaction_created`;
- `budget_created`;
- `transaction_filter_applied`;
- `sync_account_intent`;
- `sync_account_completed`;
- `csv_upgrade_interest_clicked`.

Also support a detailed authentication funnel with safe status-only events for signup, sign-in, password reset, verification, and authentication errors. Generic authentication error codes are mapped locally before submission; raw provider error bodies are never sent.

The allowed property list is limited to platform, app version, surface, action result, generic error code, and sync status. Events fire once per intended action, not once per render or retry.

Never include transaction amounts, descriptions, categories, dates, currencies, transaction IDs, email addresses, credentials, tokens, provider error bodies, or raw user-entered text in event payloads, replay, logs, or error reports.

## Consequences

- Analytics provides intentional product signals without collecting financial content.
- Opt-in consent and account-wide preference synchronization add settings and state-management behavior.
- Automatic capture and replay require tested masking for every financial surface.
- Anonymous-to-account linking improves funnel analysis while retaining opaque identifiers.
- Queued events are treated as analytics data and follow the same consent and privacy rules.
- PostHog Cloud configuration must be environment-specific and kept outside the repository.

## Validation

- Analytics defaults to disabled before consent.
- Opt-in enables events and masked replay; opt-out stops future capture and flushes queued events.
- Consent synchronizes correctly across signed-in devices.
- Anonymous identity links to an opaque account subject without exposing email.
- Core and authentication event names use only the approved property allowlist.
- Financial values and user-entered text never enter event payloads, replay, logs, or error reports.
- Automatic capture and replay mask finance inputs and values.
- Events fire once per intended action.
- Offline queues behave correctly before consent, after consent, and after opt-out.
- PostHog credentials load from environment configuration and are never committed.
