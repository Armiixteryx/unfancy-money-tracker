# Budget planned expenses: Wear OS validation

## Scope

Planned expenses are reusable budget items in the phone app. The Wear OS companion remains an expense-capture companion and has no budget or planned-expense UI, storage, or transfer contract. Regression coverage for this change is therefore limited to ensuring the existing watch source still builds and its native tests pass; a paired-device check should confirm the watch still starts in its existing setup/voice-entry flow and does not create or transmit planned items.

## Device and build

- Date: October 8, 2026.
- Physical Wear OS target: unavailable at initial discovery. `adb devices -l` showed only the Samsung Galaxy A54 (`SM_A546E`, wireless ADB); `adb mdns services` showed only that phone. No Wear OS watch was listed.
- Xcode also listed a connected iPad, which is not a Wear OS target.
- Native build: `UNFANCY_E2E=1 EXPO_PUBLIC_ENV=local pnpm run wear:build` passed after the Android E2E agent released the generated Android tree. Expo prebuild completed, the Wear debug APK assembled, and both native test suites passed: 16 Wear tests and 19 phone tests, with zero failures/errors. The APK was produced at `android/wear/build/outputs/apk/debug/wear-debug.apk`.
- A second `adb devices -l` / `adb mdns services` check after the build still showed only the Galaxy A54 phone, so the budget-specific physical watch check remains pending.

## Paired-watch regression checks

When the paired physical watch is available, use the repository's documented Wear OS workflow and the isolated E2E package/signing identity. Do not reset production app data or create planned expenses on the watch. Verify:

- The signed-out/setup screen and signed-in companion handoff remain available.
- The existing expense-capture controls and queue behavior remain intact.
- No planned-expense controls or automatic planned-to-transaction conversion appear on the watch.
- Creating a planned expense in the phone app does not create a watch recording, transaction, or watch queue item.

## Physical paired-device follow-up — October 8, 2026

- Targets: Samsung SM_A546E phone and SM_L300 Wear OS watch over wireless ADB. The watch was rediscovered through mDNS and reconnected at `192.168.123.47:44119` after its saved serial was stale.
- Installed the generated `com.unfancy.moneytracker.e2e` Wear APK without clearing app data. The phone's installed E2E package and the watch package have the same signing certificate SHA-256 (`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`).
- Launched the isolated watch app while the phone was in its guest state. The watch showed “Install or open the phone app, then sign in to enable voice.” Its accessibility hierarchy contained no queue count, recording control, or planned-expense control. This confirms the existing setup-only gate in the guest/unbound state; the signed-in handoff path was not exercised in this run.
- On the phone, created a synthetic Food planned item `Watch_boundary_test` for USD 12.34. The visible actual spend remained USD 85.25 and remaining budget USD 214.75. The watch remained on the same setup-only screen after the save. No microphone capture, voice request, or provider request was triggered.
- Screenshots: [watch setup](artifacts/budget-planned-expenses-watch-setup.png) and [phone planned item with unchanged actual totals](artifacts/budget-planned-expenses-watch-phone-plan.png).

The watch was physically observed and this guest-state boundary passed. Signed-in companion handoff and a bound watch queue comparison remain unverified in this run. Native build/test results above remain the only automated regression evidence.

## Signed-in target-aware handoff — October 12, 2026

The handoff checks used the isolated `com.unfancy.moneytracker.e2e` app identity on the physical Samsung SM_A546E phone and SM_L300 Wear OS watch. The disposable development Cognito account signed in through the app's real auth client. A temporary, development-only phone harness created a disposable shared tracker through the real tracker client, accepted the shared-sync notice, and selected that target. The actual watch UI showed that shared tracker selected before recording.

The test-only watch instrumentation requested binding protocol 2, checked that the binding contained the expected E2E shared target and no unexpected targets, and enqueued one synthetic expense fixture with the selected shared target's dataset ID, membership ID, generation, local date, and a fixed UUIDv7 request ID. The audio was a repository-provided 2.4-second synthetic file; this test did not capture speech through the physical microphone. It exercised the watch's encrypted queue, Data Layer transfer, phone receiver, background processing path, development voice service, and durable financial store. The phone was switched to Personal while the watch item remained queued. Transfer started while the phone was foreground; the phone was sent to the launcher immediately after transfer request, remained backgrounded for about 45 seconds, and the result was inspected after reopening. The successful save was observed after that background interval; its exact commit time was not captured. This does not prove that the initial transfer or save began while the phone was already backgrounded.

The phone observer found exactly one row for the stable request ID in the originating shared target, verified that it was an expense with amount, currency, and category fields present, and found no row with that ID in Personal while Personal was selected. It observed one voice endpoint call. Re-enqueuing the same request ID and transferring it again while the phone was backgrounded left the shared count at one, the Personal count at zero, and the voice-call count at one. The watch terminal receipt queue drained after both deliveries. No exact parsed amount or category value was asserted, so this run is evidence for target routing, durable save, and idempotent redelivery, not speech-recognition accuracy.

After the check, the temporary harness deleted only that fixed-ID synthetic row locally and archived only the disposable shared tracker. The phone was signed out through Settings. The watch's terminal queue remained empty, and its actual E2E screen returned to “Install or open the phone app, then sign in to enable voice.” The delete mutation used the normal shared sync outbox; this run did not verify a remote delete acknowledgment before account cleanup. Existing personal E2E fixtures were left intact. The disposable account and temporary harness were removed after the run.

Screenshots: [watch with the shared target selected](artifacts/signed-in-watch/watch-selected-shared-target.png), [phone on Personal after stable-ID redelivery, observer showing one match and one voice call](artifacts/signed-in-watch/phone-personal-after-redelivery.png), and [signed-out watch setup screen](artifacts/signed-in-watch/watch-signed-out-setup.png). These screenshots show only the isolated E2E app and synthetic test state.

Root review confirmed the three screenshots, restoration of runtime sources, strict TypeScript, lint, and whitespace checks. The 23 focused processor/provider/headless-task regression tests also passed.
