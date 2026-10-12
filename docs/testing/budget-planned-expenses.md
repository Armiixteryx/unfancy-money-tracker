# Budget planned expenses validation

October 8, 2026. Scope and compatibility decisions are recorded in [ADR 0025](../adr/0025-budget-planned-expenses.md).

## Application and storage checks

- `pnpm test`: 462 tests passed across 73 files.
- `pnpm run typecheck`, `pnpm run lint`, and `git diff --check`: passed.
- PostgreSQL repository and independent-device sync: 24 integration tests passed.
- Shared tracker permissions: four integration tests passed against the local test database.
- Flyway: one integration test passed, including repeatability, checksum rejection, locking, rollback, and portable dump/restore with ordered planned items.
- Native regression: `UNFANCY_E2E=1 EXPO_PUBLIC_ENV=local pnpm run wear:build` assembled the Wear APK and passed 35 JVM tests (16 Wear, 19 phone).
- `pnpm run db:build-migrations`: passed. V005 is a forward migration; no cloud release was performed.

Root review corrected the transaction form's Cancel event binding, stale asynchronous form callbacks, successful/failed retry identity cleanup, and same-tracker item removal. Coverage includes omitted legacy lists versus explicit clearing, submitted outbox preservation, missing/stale exchange rates, and shared member versus admin controls.

## Browser flow

Using synthetic local records in the desktop browser, verified planned item creation and independent planned/actual totals, editable transaction prefill, cancel, actual expense save with the plan retained, budget copying to another month, the first-day default for a non-current month, and persistence after reload. English and Spanish UI rendered during the checks. Original amounts and missing/stale conversion states have automated coverage.

## Physical device records

- [Android](budget-planned-expenses-android.md): core flow passed on the Samsung Galaxy A54 in the isolated E2E package. Physical currency coverage used USD.
- [Wear OS](budget-planned-expenses-watch.md): native build/tests and the physical guest setup boundary passed on SM_L300. Creating a plan on the paired phone did not change actual spending or expose watch capture controls. Signed-in voice handoff was not exercised.
- [iPad](budget-planned-expenses-ipad.md): planned-item create/edit/validation, expense prefill/cancel/save, separate actual totals, copying, confirmed deletion, and restart persistence passed on the physical iPad A16. Landscape layout was visually inspected; VoiceOver was not independently checked. Physical currency coverage used USD.

## Testing priority change — October 12, 2026

The owner stopped the follow-up device-test cycle and deferred accessibility requirements under [ADR 0026](../adr/0026-deferred-accessibility-requirements.md). VoiceOver and other accessibility audits are no longer release gates. The interrupted follow-up does not change the completed October 8 evidence above. The disposable development test account and its temporary credentials were removed without signing in or modifying user financial data or audio.
