# ADR 0004: Cross-platform local persistence and migrations

## Status

Updated by [ADR 0024](0024-shared-family-trackers.md) for independent shared trackers, membership permissions, tracker-scoped persistence/voice, and compatibility. The personal-tracker behavior below remains applicable; single-dataset assumptions are historical for shared use.

Updated by [ADR 0021](0021-portable-postgresql-sync.md), which is authoritative for restored opt-in sync, PostgreSQL/Flyway, schema 8, and system category slugs. Earlier suspended/DynamoDB/UUID-default decisions below are historical.

Accepted for local persistence; account-scoped cache behavior is superseded for the Expo client by [ADR 0016](0016-client-sync-suspension-and-local-cache-cleanup.md).

## Context

Unfancy Money Tracker must work anonymously and offline while preserving sensitive financial data across app launches, account transitions, and future schema changes. The domain model contains canonical decimal strings, UUID-backed categories, budgets, preferences, and sync tombstones. Persistence must behave consistently on iOS, Android, and the web, validate data at the boundary, and never silently discard records when stored data is old, malformed, or damaged.

## Decision

### Storage boundary

Define one shared `PersistenceAdapter` interface for all platforms. Use React Native MMKV on iOS and Android and an IndexedDB adapter for the web PWA. Both adapters use the same versioned envelope, validation, migration, encryption, and write semantics.

Persist one JSON snapshot per dataset under an app-owned, dataset-scoped key. The envelope contains:

- schema version and dataset UUID;
- transactions, categories, budgets, and category deletion tombstones;
- base currency, a non-empty duplicate-free selected-currencies preference that always includes the base, theme, and account-wide analytics-consent preferences;
- sync metadata and record-level tombstones required by ADR 0001.

Do not persist derived aggregates, TanStack Query cache data, navigation state, or transient form state. Canonical decimal strings and UUIDs are stored exactly as defined by ADR 0003; money is never converted to a JavaScript number for persistence.

### Encryption and key management

Encrypt local dataset envelopes at rest. Native adapters use a device key stored through platform-secure storage, such as Expo SecureStore or an equivalent key provider. The web adapter uses a browser-generated non-exportable Web Crypto key.

If the encryption key is unavailable or lost, do not create a replacement key or fall back to plaintext. Block access to the dataset and require cloud recovery or an explicitly confirmed local reset.

### Validation and hydration

Validate every loaded envelope with Zod before it enters application state. Hydration exposes explicit `loading`, `ready`, and `recovery` states so screens never render partially hydrated financial data.

If no local snapshot exists, create a new anonymous dataset with a fresh UUID and seed the default categories, including protected `Uncategorized`. This is default setup, not demo data.

If validation or decryption fails, preserve the original data in a quarantined recovery record, block normal use, and provide retry, preserved-backup recovery, or an explicitly confirmed destructive local reset. Recovery diagnostics and logs must not contain financial data.

### Writes and consistency

After each successful domain mutation, serialize the complete validated envelope and persist it immediately. Serialize writes through a single persistence boundary so concurrent UI actions cannot overwrite one another with stale snapshots.

If a write fails, keep the in-memory mutation visible, expose a recoverable local-save error, and provide retry. Do not report the mutation as durably saved until persistence succeeds.

### Schema migrations

Persist an integer schema version and apply ordered, pure, idempotent migrations from the stored version to the current version before validating the final envelope with Zod. Migrations must preserve UUIDs, canonical decimal strings, preferences, and tombstones unless a documented migration explicitly changes them.

The v4-to-v5 migration initializes selected currencies to the union of the existing base currency and every currency referenced by transactions and budgets, ordered by the supported-currency list. New and reset datasets seed USD only. This preference controls form choices only; historical records retain their original currencies and remain visible.

Retain one bounded pre-migration snapshot before writing the migrated result. A failed migration never replaces the original data; the app remains in recovery until retry, cloud recovery, or explicit local reset succeeds.

### Dataset identity and account sessions

Generate an anonymous dataset UUID once and retain it across reloads. Signed-in users retain a local cache in an account-scoped namespace for offline use; the same envelope and adapter rules apply to anonymous and signed-in datasets.

Signing up or signing in preserves the local dataset and passes it to the merge flow defined by ADR 0001. Signing out clears the signed-in account’s local cache while leaving cloud data intact. Another account must not be able to read the cleared or previously active account namespace.

## Consequences

- Anonymous and signed-in users can use the app offline while sharing one domain persistence contract across platforms.
- Persisted data has explicit encryption, validation, migration, and recovery boundaries.
- Derived values cannot become stale because they are recomputed from canonical records after hydration.
- IndexedDB and Web Crypto require browser-specific adapter and key-management code in addition to native MMKV integration.
- Corruption and key-loss recovery require dedicated UI states and explicit destructive confirmation.
- Every future persisted-schema change must add an ordered migration and fixture coverage before release.
- No persistence, recovery, or diagnostics path may expose financial values in logs or analytics.

## Validation

- Hydrate missing, current-version, older-version, malformed, partially corrupted, quarantined, and undecryptable snapshots.
- Verify migrations are ordered, idempotent, lossless, and preserve UUIDs, decimal strings, preferences, and tombstones.
- Verify MMKV and IndexedDB adapters conform to the same `PersistenceAdapter` contract.
- Verify immediate writes, serialized mutations, write failures, retry behavior, and reload reconstruction.
- Verify native and web key creation, retrieval, loss handling, blocking recovery, and reset behavior.
- Verify independent dataset namespaces across anonymous use, sign-in, sign-out, and account switching.
- Confirm no persisted or diagnostic output contains financial amounts, descriptions, categories, or other sensitive content.
