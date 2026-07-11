# ADR 0006: Authentication and account lifecycle

## Status

Accepted.

## Context

Unfancy Money Tracker starts as an anonymous local-first app and can optionally back up and synchronize data through an email/password account. Authentication must connect local datasets to cloud sync without exposing one account’s cache to another, while previously authenticated users must still be able to work offline.

## Decision

### Authentication behavior

Support email/password sign-up, sign-in, sign-out, session refresh, password reset, and email verification. New accounts may begin cloud sync immediately after signup; verification is requested afterward and is not a prerequisite for v1 sync.

Password reset uses a short-lived, one-time email link. The app never reveals an existing password. Authentication errors use generic safe wording so they do not reveal whether an email address is registered.

The app preserves the email exactly as entered at its boundary. It does not lowercase, apply provider-specific dot rules, or apply plus-address transformations.

New sign-up and sign-in operations require connectivity. A previously authenticated user may continue offline through the locally cached session and encrypted dataset defined by ADR 0004.

### Session model

Define provider-agnostic authentication interfaces for:

- `AuthClient`: sign-up, sign-in, refresh, sign-out, password reset, verification, and session retrieval;
- `AuthSession`: account identifier, session status, verification status, and provider expiry metadata;
- `AuthState`: signed out, loading, signed in, refreshing, offline session, invalid credentials, and error.

Allow multiple simultaneous sessions for one account across phones, tablets, and browsers. Keep sessions persistent across launches using rotating provider-managed refresh credentials. A session ends through sign-out, explicit revocation, security invalidation, or the authentication provider’s policy.

Store session credentials through platform-secure storage. Keep signed-in data in the account-scoped encrypted cache, outbox, and cursor namespaces defined by ADRs 0004 and 0005.

### Local data and account transitions

Sign-up preserves the anonymous dataset and passes it to the merge flow defined by ADRs 0001 and 0005. Sign-in with an existing account loads that account’s local cache and begins synchronization.

Online sign-out stops sync and clears the signed-in account’s local cache. If the user signs out while offline, show a destructive warning that unsynced changes will be lost. After explicit confirmation, clear the cache and sign out locally; cloud revocation completes when connectivity returns.

Account deletion is deferred from v1 and requires a later decision before implementation.

## Consequences

- Users can back up existing anonymous data without losing the local dataset.
- Previously authenticated users can continue working offline while their cached session remains valid.
- Multiple devices can remain signed in to the same account and synchronize independently.
- Email verification improves account security without blocking initial v1 backup.
- Generic credential errors reduce account-enumeration risk but provide less diagnostic detail.
- Offline sign-out is intentionally destructive for unsynced changes and requires explicit confirmation.
- An authentication provider must supply refresh credentials, revocation, password-reset delivery, verification links, and compatible error responses.

## Validation

- Sign-up success, duplicate-account responses, invalid email, weak password, loading, verification reminder, and offline states.
- Sign-in success, generic invalid-credential errors, session refresh, revoked sessions, provider expiry, and multiple-device sessions.
- Password-reset request, expired link, reused link, successful reset, and offline reset behavior.
- Cached-session access and queued mutations while offline.
- Anonymous-to-account dataset preservation and merge handoff.
- Online sign-out cache clearing and offline sign-out warning and discard behavior.
- Account switching cannot expose another account’s cache, session, outbox, or sync cursor.
- Analytics record auth intent and status only; they never include email addresses, passwords, tokens, or financial data.
