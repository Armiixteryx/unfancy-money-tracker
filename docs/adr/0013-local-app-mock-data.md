# ADR 0013: Local app mock-data seeding

## Status

Accepted.

## Context

The DynamoDB Local fixture supports backend contract tests, but anonymous app data is encrypted and scoped to the current browser or native device. Developers need fast synthetic data for visual and manual QA without exposing demo-data controls in the product.

## Decision

Provide a local-only terminal command that opens a deep-linked confirmation route in the running app. The route is gated by `EXPO_PUBLIC_ENV=local`, accepts only named built-in presets, and replaces the local dataset after explicit confirmation. It does not call the retained backend or delete backend data.

Fixtures are generated through the domain model with fresh record IDs and preserve the existing dataset ID. The command never writes MMKV or IndexedDB directly.

## Consequences

- Browser, iOS Simulator, and Android emulator/device flows share one fixture source and the app's normal persistence validation path.
- No end-user Settings control, production behavior, analytics event, or backend seed behavior is added.
- Loading mock data is destructive for the local browser/device dataset and always requires an in-app confirmation. Backend datasets and records are unchanged.

## Validation

- Unit-test fixture schema validity, preset coverage, local-only gating, and persistence.
- Verify deep-link opening and confirmation manually on web, iOS, and Android.
