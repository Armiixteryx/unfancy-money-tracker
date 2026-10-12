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
