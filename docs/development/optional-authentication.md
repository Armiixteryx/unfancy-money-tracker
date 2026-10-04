# Optional login development

Use the public Cognito pool/client in .env.example on web, Android and iPad; local SAM validates the same access tokens as AWS dev. Do not configure the dormant sync backend in client authentication. Rebuild native clients when adding Amplify dependencies. Start Android with `pnpm run android`; build the attached iPad with `pnpm run ios -- --device <UDID>`. Use `pnpm run start:all` for one shared Metro server.

Login is optional for manual tracking. Existing snapshots and recovery copies bypass the first-install introduction; use a separate browser profile or isolated installation to test first-run behavior. Do not clear the user's existing debug records. Account changes and financial resets preserve the introduction choice.

Rebuild SAM with `sam build --template-file sam/template.yaml` before endpoint checks. Endpoint synthetic voice checks require VOICE_ACCESS_TOKEN from a temporary confirmed synthetic Cognito account. Never print tokens, identity, passwords, transcripts, or provider bodies. The smoke harness retains exact expected-category UUID assertions and restricted case/outcome/probability diagnostics.

Run typecheck, lint, unit tests, test:contract, web export and attached-device checks before deployment. `infra:diff:dev` must show no replacement of Cognito identities or financial storage. Deploy AWS dev first and verify JWT authorization, reserved scope, anonymous HTTP 401, authenticated malformed HTTP 422, CORS authorization/content-type, and throttling. Back up Amplify app/branch environment settings privately before updating public values. The deployment script runs `scripts/check-voice-auth.ts` against dev using a temporary synthetic user with suppressed notifications and automatic cleanup. Automatic builds are disabled: publishing main requires an explicit Amplify RELEASE job.

Amplify platform support includes AsyncStorage and NetInfo dependencies, but token persistence is explicitly overridden with the dedicated credential adapter; financial persistence remains MMKV/IndexedDB. Metro resolves the pure ESM tslib entry to support Amplify in Expo static rendering.

## October 4, 2026 validation

TypeScript, lint, 269 unit tests, CDK assertions, SAM validation/build, and web/Android/iOS exports pass. AWS dev was deployed without replacement of Cognito identities. Disposable-user checks pass SRP, rotating refresh, refresh-token revocation, anonymous rejection, authenticated malformed input, ID-token rejection, CORS and configured throttling. An authenticated synthetic voice case passes the exact expected category UUID, amount and currency for both M4A and WebM. This is one recognition case, not a complete recognition-quality assessment.

An isolated web origin verifies new-install Skip login, persistence across reload, SRP login, session restoration, Account identity/sign-out, and preservation of a synthetic local record after logout. Android A54 and David’s iPad builds install successfully; interactive login checks on the physical devices remain unverified because Android is locked and iPad display capture was unavailable. No existing debug dataset was cleared.
