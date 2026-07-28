# ADR 0013: Local app mock-data seeding

## Status

Accepted.

## Context

The local PostgreSQL fixture supports backend contract tests, but anonymous app data is encrypted and scoped to the current browser or native device. Developers need fast synthetic data for visual and manual QA without exposing demo-data controls in the product.

## Decision

Provide a local-only terminal command that opens a deep-linked confirmation route in the running app. The route is gated by `EXPO_PUBLIC_ENV=local`, accepts only named built-in presets, and resets the local-preview session and account cache before replacing the anonymous dataset after explicit confirmation. It does not call the sync API or delete backend data.

Fixtures are generated through the domain model with fresh record IDs, preserve the existing dataset ID, and reset sync metadata to an initial state. If a developer later signs in, the existing initial-sync merge behavior uploads the synthetic anonymous dataset intentionally. The command never writes MMKV or IndexedDB directly.

## Consequences

- Browser, iOS Simulator, and Android emulator/device flows share one fixture source and the app's normal persistence validation path.
- No end-user Settings control, production behavior, analytics event, or backend seed behavior is added.
- Loading mock data is destructive for the local browser/device session, account cache, and anonymous dataset, and always requires an in-app confirmation. Backend datasets and records are unchanged.

## Validation

- Unit-test fixture schema validity, preset coverage, local-only gating, anonymous-namespace enforcement, and persistence.
- Verify deep-link opening and confirmation manually on web, iOS, and Android.
