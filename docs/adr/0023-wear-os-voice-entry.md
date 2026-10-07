# ADR 0023: Wear OS voice entry with a phone recovery queue

## Status

Accepted October 6, 2026. Paired-device acceptance remains required before release.

## Context

A non-standalone watch can capture a short expense while its paired Android phone is unreachable. Phone background execution can be deferred, and neither a transport acknowledgment nor a successful remote parse proves that the expense was saved locally. Failed recordings need a private, playable recovery path without introducing audio into financial synchronization.

## Decision

- Use Kotlin and Jetpack Compose for a non-standalone Wear OS companion. Expo/React Native remains the phone application framework. Native sources live in `native/`; an Expo config plugin restores generated Android wiring. Both APKs must use the same application ID and signing certificate for Data Layer communication.
- Initial setup requires the installed, signed-in Android companion. Until a signed-in binding arrives, show a setup-only screen that prompts the user to install/open the phone app and sign in; omit queue and recording controls. Show the same screen after sign-out, and expose full watch controls only while a signed-in binding is available. On sign-out the phone sends an empty setup binding; the watch clears its binding but preserves encrypted queued audio. Bind recordings to the originating account and phone node. Capture one AAC/M4A expense for at most 15 seconds; persist an encrypted watch queue of at most ten recordings. A full queue blocks another recording without discarding existing audio.
- Give recordings a stable UUIDv7 identity, reused for the resulting transaction. Transfer queued recordings sequentially over Wear Data Layer. Encrypt audio before creating a Data Layer Asset using a phone public-key envelope; private phone keys stay in AndroidKeyStore. Local watch and phone queues are independently encrypted with AndroidKeyStore keys.
- The phone first persists received audio in a separate private store, then schedules Android background work to run the existing authenticated voice API and durable local transaction save. Android may defer work; the watch remains pending until a terminal acknowledgment.
- Acknowledge only after a saved expense or a durable failed recording. The watch deletes its copy only on an authenticated terminal acknowledgment for that recording/account. Lost acknowledgments and retransfers use durable phone receipts; they must not create another transaction or repeat failed voice processing. Failure to persist either outcome leaves the watch copy pending.
- Use the existing transaction ID to detect an already committed expense across crashes between financial persistence and recording receipt persistence. Revalidate account, dataset generation, categories, and local save state before accepting a result. Failed local persistence must not enqueue a cloud mutation.
- Background watch requests use Amplify’s cached valid session with automatic expired-token refresh. The voice network deadline starts after authentication preparation, so deferred authentication does not consume the recognition deadline. Existing foreground authentication defaults remain unchanged. See [Amplify session management](https://docs.amplify.aws/javascript/frontend/auth/manage-user-sessions/).
- Any processing, authentication, interruption, or local-save failure retains audio in the phone recovery queue. Never automatically resubmit failed audio. Settings → Failed watch recordings offers Play/Pause and confirmed Delete, with guidance to create a new expense through Dashboard or Transactions. There is no Try again action.
- Sign-out and financial reset preserve recovery audio. Playback requires the originating signed-in account; deletion remains available. Audio, receipts, account binding, and failure metadata stay outside the financial dataset, migrations, sync payloads, analytics, logs, and replay. Only successfully saved financial transactions participate in separately opted-in sync.

## Consequences

Wear OS requires a paired Android phone; iOS is not a delivery target. Background work is eventual, not immediate. Encryption protects retained app and Data Layer copies, while provider processing retains the existing ADR 0017 remote privacy boundary. Recovery requires manual listening and entry; it does not promise automatic correction.

## Validation

Automated tests cover queue lifecycle, local-save deduplication, account restrictions, persistence/handoff failures, playback/deletion controls, and separation from financial sync. Native compilation and paired phone/watch exercises must cover background delivery, reconnect, ten pending recordings, lost acknowledgment, process interruption, storage failure, account changes, playback, and deletion. Record actual verification results in the Wear OS runbook; do not infer paired-device behavior from unit tests.

References: [Data Layer events](https://developer.android.com/training/wearables/data/events), [Data Layer client types](https://developer.android.com/training/wearables/data/client-types), [React Native Headless JS](https://reactnative.dev/docs/headless-js-android), ADRs 0017, 0020, and 0021.

Background handlers share an in-process promise per request ID. A headless caller awaits an existing foreground operation so Android retains the task lifetime until its durable outcome. A warm headless invocation preserves an already hydrated local dataset; reinitializing it can invalidate foreground work. Cold invocations still hydrate before processing.

Handoff work uses a unique job per request with `KEEP` rather than one appended chain. A delayed or stalled older job must not prevent a newly received recording from starting its headless execution window. Stable request claims and shared processing promises still prevent duplicate transcription and saves.

Confirmed deletion commits its tombstone before crypto erasure. Key-erasure failure restores a visible failure while audio remains decryptable. Once key erasure succeeds, filesystem cleanup failure must preserve the tombstone rather than restoring an unplayable failed row; durable acknowledgment work retries cleanup. Filesystem deletion failures are checked instead of ignored.

Sequential watch delivery uses one shared sender with a remembered drain request. A terminal acknowledgment received during a send, including just before sender release, must trigger inspection of the updated queue head. Headless startup records task identity before completion can fire; unexpected JavaScript rejection is caught so React Native can finish the task after attempting durable failure storage. That fallback only claims pending entries, preserving work already owned by an active processor.
