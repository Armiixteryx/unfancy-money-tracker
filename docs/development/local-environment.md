# Local development environment

The Expo application is anonymous and local-only. Backend contract and repository testing uses the retained AWS/SAM/DynamoDB development stack; app launches do not call that backend:

- DynamoDB Local runs in Docker on port `8000`.
- SAM CLI builds the API Gateway-compatible Lambda routes in `sam/template.yaml` for automated integration and contract testing.
- LocalStack is optional and runs only when an AWS SDK contract test needs it, on port `4566`.

Copy `.env.example` to `.env.local` for local development. The Expo client does not require Cognito or sync API values. Never place AWS credentials, database credentials, tokens, PostHog production keys, or real financial data in local configuration or fixtures.

## AWS development stack

Authenticate the AWS CLI, then run the repository-owned deployment:

```sh
aws login
pnpm run infra:deploy:dev
```

`infra:deploy:dev` is a full CDK deployment. It validates TypeScript, unit tests, the SAM contract, CDK assertions, and both stage templates; displays the complete CloudFormation diff; bundles changed TypeScript Lambda handlers; and applies their code, environment, IAM, API Gateway, Cognito, DynamoDB, and logging changes together. It then verifies the CloudFormation and Lambda states and runs non-sensitive API smoke tests. Treat the repository and CDK stack as the source of truth and do not edit deployed resources in the AWS Console.

The account and region must have been bootstrapped once for CDK. If the preflight reports that `CDKToolkit` is missing, run the exact `pnpm exec cdk bootstrap aws://ACCOUNT/REGION -c stage=dev` command it prints, review that one-time infrastructure change, and retry. The deployment stops before making changes when credentials are expired, the selected account conflicts with `CDK_DEFAULT_ACCOUNT`, tests fail, or the existing stack still contains the legacy Aurora database.

### CDK bootstrap record

The development AWS account was bootstrapped in `us-east-1` on August 6, 2026 at 6:27:36 PM America/Caracas (`2026-08-06T22:27:36.380Z`). This created the shared `CDKToolkit` stack used by subsequent CDK deployments. The account identifier is intentionally not stored in the repository.

The deployment writes `.cdk-outputs.dev.json`, which is ignored by Git. Its Cognito, API, and DynamoDB outputs are backend records for contract and future reintroduction work; do not add them to Expo environment configuration. A failed CloudFormation deployment uses the default rollback behavior; inspect the reported stack events, fix the source, and rerun the same command rather than editing resources manually.

For read-only inspection without deployment, use `pnpm run infra:check`, `pnpm run infra:synth:dev`, or `pnpm run infra:diff:dev`. Production can be synthesized and diffed with the `:prod` commands, but deployment is deferred and `infra:deploy:prod` refuses to run unless `ALLOW_PROD_DEPLOY=1` is explicitly supplied.

## Commands

```sh
scripts/local-env.sh verify
scripts/local-env.sh start
scripts/local-env.sh init
scripts/local-env.sh seed
pnpm run local:seed-app --preset=dashboard --target=ios
scripts/local-env.sh status
scripts/local-env.sh health
```

Use `scripts/local-env.sh sam-api` for focused handler testing, `scripts/local-env.sh sam-lambda` for direct Lambda invocation, and `scripts/local-env.sh localstack-start` only for optional AWS SDK wiring experiments. SAM uses the locally available Lambda image with `--skip-pull-image`.

The deterministic application checks are:

```sh
pnpm test
pnpm run typecheck
pnpm run lint
sam validate --template sam/template.yaml --lint
sam build --template-file sam/template.yaml --build-dir .aws-sam/build --cached
pnpm run test:integration
pnpm run test:contract
```

The same checks are available through `scripts/local-env.sh test`, `integration`, `contract`, `typecheck`, and `lint`. `contract` validates the local SAM routes and synthesizes the AWS CDK boundary; it never deploys or requires AWS credentials.

`reset` is intentionally destructive but scoped to Docker resources named by this repository and generated `.aws-sam`/`.localstack` directories:

```sh
scripts/local-env.sh reset
```

The client starts with a new empty anonymous dataset. The DynamoDB Local seed is for backend contract tests only; it is never demo data in the product UI.

## App mock data for local development

Use the local-only app seeder when visual or manual QA needs a populated anonymous dataset:

```sh
pnpm run local:seed-app --preset=dashboard --target=ios
pnpm run local:seed-app --preset=edge-cases --target=android
pnpm run local:seed-app --preset=dashboard --target=web
```

The app must already be running on the requested target. The command opens a destructive confirmation screen; it does not write encrypted device/browser storage directly or delete backend data. The flow is available only when `EXPO_PUBLIC_ENV` is `local`. Use `--dry-run` to print the target URL without opening it.

Native targets use the Expo Router path form `unfancy-money-tracker:///developer-seed?...` (three slashes); this is required so `developer-seed` is interpreted as a route rather than a URL host.

Mock fixtures are contract-tested whenever `pnpm test` runs. Run `pnpm run test:fixtures` while changing the preset factory; it verifies the persisted schema, record references, category/budget invariants, date range, local tombstone behavior, report history, and the edge-case budget states. Fixtures replace only the local dataset and never touch the retained backend.

## Android development client

This app uses `react-native-mmkv` 3.x and Expo New Architecture, so Android must run in the project development client rather than Expo Go. Build and install it once with:

```sh
pnpm run android
```

This command waits for the emulator or connected device and preserves the optional
ADB reversal used by focused SAM tests. Run Android through this command instead
of invoking `expo run:android` directly.

Then start Metro with:

```sh
pnpm run start
```

To run Android, iOS, and web together from one Expo server, use:

```sh
pnpm run start:all
```

Then press `a`, `i`, and `w` in the Expo terminal. `start:all` waits for Android
in the background and applies the same port reversal automatically when the
emulator or connected device becomes available.

Press `a` in the Expo terminal to open the installed development client. If the Android SDK is not configured, set `ANDROID_HOME` or create `android/local.properties` with the machine-specific `sdk.dir` path. The generated `android/` directory and local SDK path are not committed.

## iOS development client

Build with `pnpm run ios`; use `pnpm run ios --device 00008120-0009394210414032 --no-bundler` for David’s iPad, then connect to the server started by `pnpm run start:all`. Reinstall over the existing app to retain the local dataset.

The local `plugins/with-ios-scene.cjs` prebuild plugin adds a single UIKit scene to Expo SDK 54's generated Swift app delegate. iOS/iPadOS 27 requires scene adoption for clients built with the iOS 27 SDK; without it the app closes before Metro connects, with `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` in the device crash report. The plugin creates the scene window before starting React Native and Expo's development launcher, preserves cold-start links, and forwards URL, universal-link, foreground, and background callbacks. See ADR 0019 and [Apple’s lifecycle migration guidance](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle).

After changing native plugins, run `pnpm exec expo prebuild --platform ios --no-install` and rebuild. The plugin is specific to the SDK 54 Swift template and rejects unexpected templates; review and remove it when upgrading to Expo's built-in scene support. Do not edit only the ignored generated `ios/` directory.

For a physical-device startup check without Metro, use `pnpm run ios --device 00008120-0009394210414032 --configuration Release --no-bundler`. This local build includes the JavaScript bundle and uses the same development bundle identifier and local dataset. Rebuild with the default Debug configuration to restore the Metro development client. This command does not publish or deploy the app.

## Optional voice expense service

Voice uses the existing SAM API on port 3001; Android's existing reversal scripts apply. Add `EXPO_PUBLIC_VOICE_API_URL=http://localhost:3001` to `.env.local` (the service root, without `/voice/expense`). Put `AI_GATEWAY_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_AUTH_TOKEN` in `.env.local` as backend-only variables. Never give these keys an `EXPO_PUBLIC_` prefix.

`pnpm run voice:env` reads only the three provider credential values and generates `sam/env.voice.local.json` with mode 0600, merging the tracked local SAM configuration. It preserves `.env.local` and the tracked SAM file. `pnpm run local:sam` generates this environment before starting the API. A native rebuild is needed for the new Expo Audio/File System modules: use `pnpm run android` or `pnpm run ios`, then `pnpm run start:all` for a shared server. Web recording requires microphone access in a secure context (localhost or HTTPS) and WebM/Opus support.

`pnpm run voice:smoke` is a separate opt-in live-provider check using only generated synthetic Spanish and English audio. It requires macOS `say` with Paulina/Samantha voices, `ffmpeg`, and `ffprobe`. It tests M4A/AAC and WebM/Opus for five amounts/currencies, checks category match or the confidence fallback, prints pass/fail only, and removes temporary files. Probes are spaced 15 seconds apart; rejected requests are never automatically retried. Provider throttling is reported as a sanitized failure. Routine tests use mocked providers.

`pnpm run infra:deploy:dev` creates a retained `UnfancyMoneyTracker-dev/voice` Secrets Manager secret, grants only the voice Lambda read access, and then uploads the provider credential values via `scripts/voice-environment.ts dev`. The script deliberately does not load local DynamoDB AWS credentials into the deployment SDK environment. AWS credentials come from the existing authenticated shell/configuration. Set the app's voice URL to the deployed `ApiUrl` output after deployment. Production deployment stays deferred; production synthesis is still checked.

The anonymous voice route has rate 0.25 requests/second and burst 2. This is shared route throttling, not an identity or subscription system. See ADR 0017 for privacy, deadlines, category confidence semantics, and the remote processing boundary. Platform microphone gestures, OS interruption behavior, assistive technology, and notification focus still require device/browser release checks.
