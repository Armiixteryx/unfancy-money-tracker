# Local development environment

Anonymous application development remains local-first. Interactive account and sync testing uses the deployed AWS development stack:

- PostgreSQL 16 runs in Docker on port `5432`.
- SAM CLI builds the API Gateway-compatible Lambda routes in `sam/template.yaml` for automated integration and contract testing.
- LocalStack is optional and runs only when an AWS SDK contract test needs it, on port `4566`.

Copy `.env.example` to `.env.local` and populate the public Cognito region/client ID and API URLs from the development stack outputs. Missing values leave anonymous tracking available and disable only cloud backup. Never place AWS credentials, database credentials, tokens, PostHog production keys, or real financial data in local configuration or fixtures.

## AWS development stack

```sh
pnpm run infra:synth:dev
pnpm run infra:diff:dev
pnpm run infra:deploy:dev
```

The deployment writes `.cdk-outputs.dev.json`, which is ignored by Git. Copy `CognitoRegion`, `CognitoClientId`, and `ApiUrl` into the corresponding `EXPO_PUBLIC_*` values in `.env.local`. Production can be synthesized and diffed with the `:prod` commands, but deployment is deferred and `infra:deploy:prod` refuses to run unless `ALLOW_PROD_DEPLOY=1` is explicitly supplied.

## Commands

```sh
scripts/local-env.sh verify
scripts/local-env.sh start
scripts/local-env.sh migrate
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

The client starts with a new empty anonymous dataset. The PostgreSQL seed is for backend contract tests only; it is never demo data in the product UI.

## App mock data for local development

Use the local-only app seeder when visual or manual QA needs a populated anonymous dataset:

```sh
pnpm run local:seed-app --preset=dashboard --target=ios
pnpm run local:seed-app --preset=edge-cases --target=android
pnpm run local:seed-app --preset=dashboard --target=web
```

The app must already be running on the requested target and must be using its anonymous dataset. The command opens a destructive confirmation screen; it does not write encrypted device/browser storage directly or delete backend data. The flow is available only when `EXPO_PUBLIC_ENV` is `local`. Use `--dry-run` to print the target URL without opening it.

Native targets use the Expo Router path form `unfancy-money-tracker:///developer-seed?...` (three slashes); this is required so `developer-seed` is interpreted as a route rather than a URL host.

Mock fixtures are contract-tested whenever `pnpm test` runs. Run `pnpm run test:fixtures` while changing the preset factory; it verifies the persisted schema, record references, category/budget invariants, date range, clean initial-sync state, report history, and the edge-case budget states.

To verify a fixture upload, load and confirm the fixture, sign into a synthetic Cognito development account, and use **Sync now**. Verify the result only through safe status messages or synthetic development records; never use real financial data.

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
