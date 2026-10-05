# ADR 0020: Optional authentication for remote voice entry

## Status

Updated by [ADR 0021](0021-portable-postgresql-sync.md), which is authoritative for restored opt-in sync, PostgreSQL/Flyway, schema 8, and system category slugs. Earlier suspended/DynamoDB/UUID-default decisions below are historical.

Accepted. Supersedes ADR 0006's client account lifecycle. Cloud sync and production deployment remain deferred.

## Context

Remote voice needs authenticated access without restricting manual tracking or assigning ownership to the local financial dataset. The existing dev Cognito pool and client must retain their identities.

## Decision

Use Amplify Auth direct USER_SRP_AUTH with pool `us-east-1_gCLS9k4s0`, public client `63kh2vrfpvd7h9moob0m9l2umf`, region us-east-1. Public environment values configure the client. AuthClient owns registration, email confirmation/resend, recovery/reset, login, restoration, logout, and access-token retrieval. Email spelling is preserved; registration/reset requires 12 characters and uppercase, lowercase, digit and symbol. Unsupported Cognito challenges fail safely; social login and MFA enrollment are deferred.

New installations choose login or Skip login before creation of the first financial dataset. An independent introduction namespace stores completion. Existing snapshots, recovery copies, or unreadable financial storage bypass introduction and use existing recovery behavior. Financial reset and fixture tooling cannot remove the marker or credentials.

One anonymous financial dataset remains shared across guest use and every account transition. Login never migrates or uploads records and logout never deletes records. Settings exposes Account. Guests can use all manual features; voice invokes a login modal over the originating screen and requires a new recording gesture after login. Sign-out cancels recording and processing, ignores late results, and preserves completed records and local-save retries.

Amplify stores credentials through a dedicated pool/client namespace, outside Zustand and dataset persistence. Native MMKV is encrypted with a random key held in SecureStore, device-only after first unlock. Web cookies omit Domain and use SameSite=Strict, Path=/, Secure, and a 30-day lifetime; HTTP is allowed only on loopback. These are JavaScript-accessible cookies, so application script integrity remains necessary. Credentials and identity are masked and excluded from automatic capture; auth errors expose fixed localized messages only.

Keep token revocation enabled, rotate 30-day refresh tokens with a 30-second grace period, issue 15-minute access/ID tokens, disable unused OAuth and password auth flows, and retain SRP. Amplify manages refresh rotation. API Gateway and Lambda require `aws.cognito.signin.user.admin`, the reserved scope emitted by direct sign-in; custom scopes require OAuth and are not assumed here. Lambda verifies access-token type, signature, pool, client, expiry, and scope before parsing audio, including SAM. The client retrieves/refreshed tokens before upload inside the existing 30-second deadline and never retries audio on failure.

## Consequences

Authentication requires connectivity; manual tracking and existing local records remain available offline. Browser cookies cannot be HttpOnly with direct client SRP. Remote provider retention and category boundaries remain unchanged. Local logout clears credentials even if remote revocation fails and reports a safe retry error. No authentication analytics, email, tokens, password, provider errors, or financial contents may enter logs or replay.

## Validation

Test independent introduction detection/persistence and recovery, safe credential boundaries, guest microphone gating, bearer headers, rejected requests before providers, cancellation, local-save retry preservation, strict infrastructure assertions, and attached web/Android/iPad startup. Deploy dev before Amplify main and verify anonymous rejection plus authenticated malformed input with a temporary synthetic user that is deleted afterward.

References: [Cognito direct sign-in scopes](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html), [Amplify custom token storage](https://docs.amplify.aws/react-native/build-a-backend/auth/concepts/tokens-and-credentials/).
