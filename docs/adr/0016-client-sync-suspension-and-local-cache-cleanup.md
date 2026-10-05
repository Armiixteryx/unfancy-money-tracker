# ADR 0016: Suspend client sync and clean up legacy local account caches

## Status

Updated by [ADR 0021](0021-portable-postgresql-sync.md), which is authoritative for restored opt-in sync, PostgreSQL/Flyway, schema 8, and system category slugs. Earlier suspended/DynamoDB/UUID-default decisions below are historical.

Accepted.

## Context

The Expo application no longer needs account creation, authentication, cloud backup, or synchronization in its active product scope. The local dataset is sufficient for the anonymous V1 experience, while the AWS/SAM/API Gateway/Cognito/Lambda/DynamoDB implementation and existing cloud records must remain intact for a possible future reintroduction.

The previous client persisted sync metadata, generic record tombstones, account namespaces, and session credentials. Leaving those artifacts active would allow old client behavior to reappear after an upgrade and would retain stale account data on the device. The migration must preserve the normal anonymous pre-migration backup guarantee and must never call or erase cloud services.

## Decision

- The Expo app is anonymous and local-only on web, iOS, and Android. It has no auth screens, account namespace switching, sync queue, conflict UI, remote sync hooks/services/clients, runtime Cognito or sync configuration, account analytics, or sync actions.
- The dataset store moves from `src/features/sync` to `src/features/local-data` and exposes only local CRUD, local persistence, preferences, local category-deletion tombstones, hydration, recovery, reset, and development-fixture actions.
- Persisted dataset schema version 3 contains dataset identity, transactions, categories, budgets, category-deletion tombstones, and preferences. It does not expose `sync` or `recordTombstones`.
- v0-v2 snapshots migrate in order. Dataset identity and active records, preferences, and category-deletion tombstones survive. Generic record tombstones and inactive sync metadata are discarded from the active snapshot. `hydrateDataset` keeps one pre-migration anonymous backup before writing the migrated snapshot.
- Before anonymous hydration, the app examines the old `dev` and `prod` session keys. For every readable session it derives the old `account:${stage}:${accountId}` namespace, resets that local cache including recovery/migration artifacts and its encryption key, and then clears the session. The cleanup only touches local storage. If a reset fails, its session remains so the next initialization can retry; anonymous hydration does not proceed after a cleanup failure. A missing or unreadable session provides no global namespace registry and cannot be used to discover more caches.
- Server request/response schemas live under `src/server/contracts/sync.ts`. Server handlers, repositories, and integration tests remain independently usable; backend infrastructure and cloud records are not deleted, modified, or invoked by the Expo client.
- Analytics remains consent-gated and anonymous. The allowlist contains only non-sensitive product metadata and no account identity, authentication, or sync status.

## Consequences

- Existing anonymous financial records survive the migration with their dataset UUID and recovery backup.
- Old account-scoped local caches are intentionally cleared, including local recovery and migration artifacts. No old account data is merged into the anonymous dataset.
- Users cannot sign in, sync, resolve conflicts, or identify an account from the app until a later product decision reintroduces those capabilities.
- The retained backend and cloud records can continue to be validated and deployed independently, but no client behavior may depend on them during this suspension.
- A future reintroduction must define the client boundary, persisted schema, cache cleanup/merge semantics, analytics contract, and explicit product acceptance before restoring auth or sync code.

## Validation

- v2 migration preserves active records, preferences, dataset identity, and category-deletion tombstones while removing `sync` and `recordTombstones`.
- Store CRUD, local persistence, category reassignment/tombstones, fixture replacement, and absence of sync queue mutations are covered.
- Legacy cleanup discovers `dev` and `prod` sessions, resets namespaces, removes sessions after success, and retries after failure without cloud calls.
- Analytics tests verify consent gating, anonymous identity, and the non-sync property allowlist.
- Backend contract and DynamoDB integration coverage remains under the server-owned sync contract and repository tests.
