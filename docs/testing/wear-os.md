# Wear OS verification

## Build and setup

Canonical source is `native/wear` and `native/android-watch`. Run `pnpm exec expo prebuild --platform android --no-install` to restore native source and registration. Use `pnpm run android` for the phone. Run `pnpm run wear:build` to restore native wiring, build the watch, and run both native test suites; install `android/wear/build/outputs/apk/debug/wear-debug.apk` on the paired watch. The watch and phone must share application ID and signing certificate, including production signing. A paired Google Play services phone/watch is required for Data Layer delivery; installing APKs alone does not pair emulators.

Before mobile tests inspect `adb devices` and `xcrun xctrace list devices`; prefer physical devices when available. With no suitable physical device, pair the Medium_Phone and Wear_OS_Small_Round AVDs through Android Studio Device Manager. Start the phone with the repository Android script so local SAM reversal remains configured. With both AVDs running, use `ANDROID_SERIAL=emulator-5556 pnpm run android --device Medium_Phone --no-bundler` (substitute the actual phone serial/name), and run Metro separately. Sign into the companion before watch setup. Use synthetic audio and synthetic transactions only; do not copy financial or authentication contents into diagnostics.

## Paired-device acceptance matrix

| Exercise | Required observation |
| --- | --- |
| Initial setup signed out / signed in | Recording disabled until signed-in phone binding is received |
| Phone offline, ten recordings | Queue persists through watch restart; eleventh capture blocked; no recording erased |
| Reconnect | Sequential transfer; pending remains until terminal phone acknowledgment |
| Phone UI closed/backgrounded | Deferred work processes inbox without mounting phone UI |
| Phone process terminated before work | Durable inbox resumes without losing audio |
| Kill during transcription | Recording retained as failed; no automatic provider resubmission |
| Kill after local transaction commit, before receipt | Existing stable transaction detected; no second expense |
| Lost terminal acknowledgment | Watch retains copy; redelivery replays durable receipt without provider request |
| Parse/network/auth failure | Durable failed recording then acknowledgment; playable recovery queue entry |
| Financial persistence failure | Failed audio retained; no transaction/outbox mutation from failed save |
| Inbox/audio/receipt storage failure | No premature acknowledgment; watch copy survives |
| Corrupt encrypted metadata / unavailable key | Fail closed; retain originals and report unavailable queue |
| Play/Pause, end of track, navigation | Correct accessible controls; playback stops on leaving/account transition |
| Sign out or change account | Failed audio remains; wrong-account playback denied; Delete still available |
| Reset / replace financial dataset | Failed audio retained; stale processing cannot write to replacement |
| Delete cancel / confirm / interrupted write | Cancel preserves audio; confirm removes queue item; failure reports without silently losing playable data |
| Duplicate after deletion | Durable tombstone prevents reprocessing or reappearing |
| Sync enabled | Successful transaction may sync; audio, failure metadata, receipts and binding absent from dataset and requests |

## Verification record

October 6, 2026: `adb devices` listed no attached Android device. Xcode listed an offline iPad and no usable physical iOS target. Medium_Phone and Wear_OS_Small_Round AVDs were launched. The phone APK compiled and installed through the repository Android script; the watch APK compiled, installed, and displayed its setup/recording screen on the round AVD. The phone guest flow and Settings recovery empty state were exercised. These AVDs were not paired or signed in, so background delivery, live voice processing, reconnect, and actual recovery playback remain unverified.

Automated verification passed: 59 Vitest files / 398 tests; TypeScript and ESLint; nine Wear and fourteen phone JVM tests through `pnpm run wear:build`; Android phone assembly; and web static export (13 routes). Tests include encrypted-store fault injection, lost receipts, stable-ID deduplication, account lifecycle races, durable-save failures, and explicit exclusion of audio/recovery fields from opted-in financial snapshots and outbox entries. This matrix remains the release gate for device-only behavior.

## Physical-device follow-up — October 6, 2026

Samsung SM_A546E phone and SM_L300 Wear OS watch were connected through wireless ADB; no suitable physical iOS device was attached. Installed the updated development APKs without clearing app data and verified identical application IDs and signing certificates. The companion was already signed in, with cloud sync off.

The first setup exchange exposed an AndroidKeyStore integration defect: watch queue and binding encryption supplied a caller-generated GCM IV despite randomized-encryption keys. Both now let the provider generate the IV and preserve the same stored ciphertext format. JVM tests cannot reproduce this provider restriction, so `WatchDeviceChecks` adds a real-device regression probe using the real Keystore key and isolated memory-backed synthetic storage. It reports only connectivity, outcome, and boolean assertions.

Passed on the physical watch: connected-phone discovery, setup message acceptance, observed setup reply while the companion UI was backgrounded, received signed-in encrypted binding, encrypted queue round-trip, ten-item limit, queue reopen, and corrupt-source retention. The companion recovery list displayed its empty state. Native builds and all 23 JVM tests passed after the Keystore fix; TypeScript, ESLint, and whitespace checks also passed.

Run the probe after signing into the paired development companion:

```sh
# Restore canonical sources first; substitute actual ADB serials.
pnpm run wear:build
cd android
./gradlew :wear:assembleDebugAndroidTest
adb -s <watch-serial> install -r wear/build/outputs/apk/androidTest/debug/wear-debug-androidTest.apk
adb -s <watch-serial> shell am instrument -w com.unfancy.moneytracker.dev.test/com.unfancy.moneytracker.wear.WatchDeviceChecks
```

The probe does not record microphone audio, enqueue live recordings, or create transactions. Live background audio processing, reconnection, lost acknowledgments, recovery playback/deletion, and account-change/reset scenarios still require the paired acceptance matrix above and an account selected for synthetic testing.

## Authorized synthetic handoff tests — October 6, 2026

The owner authorized synthetic expense creation and cleanup and confirmed that current data is synthetic. Added test-only generated AAC speech/silence fixtures and explicit instrumentation actions; these bypass the microphone only, then use the real encrypted watch queue, Data Layer envelope, phone receiver, WorkManager/Headless JS, existing voice request, and durable receipt path. Synthetic diagnostics contain outcome/case index only. Instrumentation keeps an encrypted test backup solely for stable-ID redelivery checks; its cleanup action deletes this backup once the live watch queue drains.

Observed on the paired physical devices:

- With the companion UI backgrounded, synthetic audio reached the encrypted phone inbox. The watch remained pending until a durable failed outcome existed, then removed its copy.
- Local SAM invocation returned HTTP 502 because Docker's container image store hit a disk I/O error. The recording remained in the phone failure list; no financial transaction was created. This verifies transport/processing-failure retention, not successful provider parsing. No Docker data was reset or deleted.
- Redelivery of an existing failed request replayed the terminal receipt and drained the watch again. Existing failed items were not selected for transcription after app restart.
- Interrupting phone processing by restarting the development companion produced `processing_interrupted` recovery, retaining the recording.
- Sign-out retained recovery items, removed Play controls, displayed the originating-account notice, and kept Delete available.
- Cancel preserved a failed recording; confirmed Delete removed it while signed out.
- Runtime assertions verified that these failures created no financial transaction and that audio/duration/error metadata were absent from the financial dataset. Sync stayed off.

The development companion was restarted with the existing development voice endpoint to avoid the local Docker failure. Its previous Cognito session no longer returned a usable access token; fresh sign-in is needed before successful-save, originating-account playback, and remaining live scenarios. The 53 focused application tests and 23 native JVM tests passed during this follow-up; the watch instrumentation backup was removed after all queued copies drained. Two synthetic failed phone recordings remain for originating-account playback verification. Do not automatically resend the failed fixtures after authentication is restored.

Test-only queue actions (the owner must authorize synthetic account use before `enqueue`):

```sh
adb -s <watch-serial> shell am instrument -w -e action enqueue -e fixture expense -e caseIndex 1 com.unfancy.moneytracker.dev.test/com.unfancy.moneytracker.wear.WatchDeviceChecks
# Other actions: resend (optional backupIndex), transfer, verifyDrained, verifyTen, cleanup.
# Enqueue accepts fixture=silence|expense, count=1..10, transfer=false for offline tests.
```

## Fresh-session continuation — October 6, 2026

Fresh sign-in restored development voice access. A separate newly generated synthetic request returned HTTP 200 and parsed successfully; retained failures were never resubmitted. Originating-account Play/Pause and end-of-track playback passed on the physical phone. Two new synthetic recordings saved through the durable local path and their terminal receipts drained the watch, although these saves completed after foregrounding the companion. Replaying a completed stable ID produced a receipt without another voice request or transaction. Runtime assertions again confirmed that failed IDs have no financial transaction and audio, duration, and failure fields are absent from the financial dataset; sync remained off.

Background testing exposed a foreground/headless lifetime race and a blocked appended WorkManager chain. Headless callers now await an existing processing promise, warm invocations preserve hydrated storage, and delivery schedules unique per-request handoff work with KEEP. Regression tests cover shared task lifetime, warm/cold hydration, and delayed authentication before the voice deadline. The current complete suite passes 403 tests across 60 files, plus 23 native JVM tests; typecheck, ESLint, web export, and whitespace checks pass. After installing the updated companion through `pnpm run android` on SM_A546E, two preserved pending watch recordings completed while the companion UI stayed backgrounded. Each stable ID had exactly one locally saved expense; terminal receipts emptied the watch queue. Completed-ID redelivery while backgrounded produced no further voice call or transaction. Watch wireless ADB disconnects initially interrupted the multiple-pending probe, but reconnection preserved both recordings and the final transfer passed. Synthetic recovery items and four newly saved expenses remain available for review. Physical microphone capture, force-killed cold runtime startup, and the full device fault-injection/reset matrix remain release-gate checks; unit coverage does not substitute for those cases.

After all terminal receipts drained, the test-only encrypted watch backup was deleted and synthetic runtime observers were removed. The temporary development voice selector was restored to its original local value. The local SAM Docker image-store I/O failure remains unresolved; successful provider checks above used the existing development endpoint. No failed phone audio or existing financial data was deleted during this continuation.

## Remaining-scenario review — October 6, 2026

Physical cold startup was exercised by terminating the companion process under its app UID, without putting Android into force-stop state. A subsequent synthetic silence recording restarted the companion in the background; the foreground activity stayed the Samsung launcher. The unavailable local voice service led to a durable failed entry, and terminal receipt delivery drained the watch after resuming its UI. This proves cold receiver/headless recovery and failure retention; cold successful provider parsing remains distinct from the prior warm background success.

Physical microphone permission was requested through the watch UI, granted once, and the UI displayed Recording and Stop. Manual Stop created a pending encrypted recording and delivered it to the phone inbox. The unavailable local service produced a durable failed entry; after terminal receipt replay, the watch UI displayed Queue: 0 / 10 and directed the user to the phone recovery list. No audio content was extracted into diagnostics. This checks hardware capture and handoff rather than semantic accuracy of spoken expense parsing.

Review found that a filesystem cleanup exception after successful key deletion could roll a deletion tombstone back into a failed row with unplayable audio. The rollback now applies only to key-erasure failure. After successful crypto erasure the durable deleted tombstone survives cleanup failure and acknowledgment work retries cleanup. Android filesystem deletions now check failure results. The new injected disk-cleanup test uses fresh random keys so a deleted key cannot silently regenerate the same test key. Native verification passes fifteen phone and nine watch tests (24 total).

Remaining physical release gates: cold successful provider save, timed maximum-duration capture, ten live offline recordings through watch process restart, reset/replacement during in-flight work, different-account transition, real storage fault injection, and live sync request inspection. Those paths have automated coverage where practical, but are not marked as physical-device passes.

The corrected phone APK was built and installed using `pnpm run android` on SM_A546E. All 403 application tests, 24 native tests, TypeScript, ESLint, and whitespace checks pass. Post-test runtime assertions confirm failure/audio fields remain absent from financial data. Test-only encrypted watch backups were removed after terminal receipt replay drained the live queue; phone recovery audio remains preserved.

### Additional paired-device verification — October 6, 2026

The physical phone ran an isolated instrumentation store using its real filesystem and AndroidKeyStore. Audio/metadata writes, failed-receipt persistence, completion writes, unavailable keys, and key/file deletion faults were injected. Durable recovery, deletion tombstones, and account restrictions passed without modifying retained user recovery audio. An isolated financial persistence probe also passed local-save failure and reset-during-save checks: the rejected save produced neither a transaction nor an outbox mutation, and the interrupted save did not restore data after reset.

The watch retained ten encrypted synthetic recordings across a forced process restart and blocked an eleventh recording. A physical microphone recording automatically stopped at the fifteen-second UI limit. Live multiple-pending delivery exposed an acknowledgment race in sequential sending: an acknowledgment arriving while the sender was occupied could lose its next-drain request. A shared sender now records that request and drains the updated head; regression tests cover acknowledgments during a send and immediately before unlock. Final delivery of the preserved queue still requires restoring its originating account.

A temporary account was created in the development Cognito pool with email delivery suppressed. Actual SDK sign-in to that different account passed: original-account playback was denied, failed audio remained present, and deletion remained available. The watch preserved its original-account pending recordings. The temporary account was removed after testing. The original saved access token expired, and its refresh token could not restore the session; a fresh original-account sign-in is required. Financial records and retained recovery recordings were not cleared.

Live development sync used an isolated encrypted financial store and the temporary account, leaving the main dataset's sync preference off. Request bodies and the downloaded response were checked on-device for failed recording IDs and forbidden audio/failure fields. A successfully saved watch expense uploaded and downloaded; the forbidden contents were absent. The synthetic cloud expense was deleted afterward. An initial test-harness pull used the local dataset ID instead of its cloud binding ID and returned 403; correcting the probe to use the canonical binding passed.

Unexpected headless rejection now resolves the Android task after attempting a durable handoff failure for unclaimed pending recordings; it does not fail a recording owned by another active processor. Native startup tracks task identity before a fast completion callback and converts startup exceptions into worker failure. Verification passes 405 application tests across 60 files and 28 native JVM tests, TypeScript, ESLint, web export, and whitespace checks.

Remaining physical release gates: final restored-account queue drain; a successful voice/save from a killed cold phone runtime; live receiver storage failure with watch retention and recovery; and main-dataset reset/replacement during an in-flight voice request. The isolated real-device financial reset probe and native storage injections above do not establish those end-to-end passes. The ten-item test held transfer rather than disabling both devices' radios, so a radio-off ten-recording run remains distinct. Local SAM still returns 502 because Docker's image store reports disk I/O failure; development endpoint tests passed without repairing or resetting Docker.

### Restored-account follow-up — October 6, 2026

Fresh original-account sign-in restored the binding, and terminal receipts drained all previously preserved watch recordings. Phone metadata confirmed delivery of the maximum-duration microphone recording. A fresh synthetic speech recording was sent after killing the phone app process with `run-as kill -9` while the launcher stayed foreground. The cold headless runtime hydrated, called the development voice service, committed exactly one expense under the stable request ID, and persisted a completed receipt; watch redelivery replayed that receipt and drained the queue. This establishes cold background success for the installed debug build and attached pair; it does not replace a signed release-build acceptance run.

A live receiver storage failure was injected by temporarily removing write permission on the phone's private audio directory, with original permissions restored in `finally`. No inbox row or terminal receipt was created, and the watch retained its encrypted copy. After write permission was restored, delivery created a pending phone recording; Android deferred background work. Foreground hydration then completed one durable saved expense. This tested receiver failure and subsequent transfer recovery, without resubmitting a phone failed-queue entry.

Both live main-dataset interruption checks passed. A newly received synthetic voice response was intercepted before the processor accepted it; the main store was reset in one case and replaced in the other. Each case retained the new phone recording with `processing_interrupted`, created no stale transaction, and restored the exact encrypted financial snapshot. Previously failed recordings were never resubmitted. The originating account remains signed in. These checks close the reset/replacement and cold-success gaps above. A fully radio-disabled ten-recording run and signed release-build acceptance remain separate verification; the tested ten-item restart used held transfer.

Final cleanup confirmed an empty watch queue and deleted its encrypted instrumentation backup. Isolated phone test snapshots and the expired authentication backup were removed after exact financial restoration; retained recovery audio was preserved. The temporary development account was deleted, the original account remained signed in, and the original local voice backend selector and Metro server were restored. The local Docker/SAM 502 remains an environmental limitation. Final verification: 405 application tests, 28 native tests, typecheck, ESLint, 13-route web export, and whitespace checks pass.

### Missing companion / no watch setup — October 7, 2026

The physical SM_A546E phone and SM_L300 watch were attached. The watch remained system-paired and reported one connected phone node, but the phone companion package was absent for Android user 0. No phone APK was installed, and no account, app data, recovery audio, or system pairing was changed.

On the watch, a focused instrumentation action backed up the exact encrypted binding file bytes in memory, temporarily removed the binding, launched the real watch activity, and restored the original encrypted bytes in `finally`. During the unbound window, an actual accessibility hierarchy dump showed the “Open the phone app and sign in to enable voice” message and the Record control's clickable parent disabled. The activity's phone-ready state was false. Invoking the real `startRecording` guard directly left recording false, produced no request ID, created no `.m4a` cache file, and left the encrypted queue unchanged. The watch sent a setup request while the phone companion was absent; after a three-second wait the binding remained absent. The physical probe returned `bindingAbsent`, `recordControlGuardDisabled`, `microphoneStartBlocked`, `setupRequestRemainedUnbound`, `queueUnchanged`, and `bindingRestored` as true, with one connected phone node.

After the exact binding backup was restored, the watch again displayed Queue: 0 / 10 and the Record control was enabled. Earlier paired setup exercises above established successful signed-in setup and binding receipt. This October 7 scenario verifies a never-configured watch state on an already-paired watch with no companion package available; it does not represent hardware that has never been system-paired.
