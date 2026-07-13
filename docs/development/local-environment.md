# Local development environment

The default development loop is local-only and does not require AWS credentials:

- PostgreSQL 16 runs in Docker on port `5432`.
- MailHog captures local confirmation and password-reset email on SMTP `1025` and UI `http://127.0.0.1:8025`.
- SAM CLI builds and runs the API Gateway-compatible Lambda routes in `sam/template.yaml` on `http://127.0.0.1:3001`.
- LocalStack is optional and runs only when an AWS SDK contract test needs it, on port `4566`.

Copy `.env.example` to `.env.local` only when a local override is needed. The committed defaults are synthetic and non-production. Never place AWS credentials, production database credentials, PostHog project keys, real email destinations, or real financial data in local configuration or fixtures.

## Commands

```sh
scripts/local-env.sh verify
scripts/local-env.sh start
scripts/local-env.sh migrate
scripts/local-env.sh seed
npm run local:seed-app -- --preset=dashboard --target=ios
scripts/local-env.sh status
scripts/local-env.sh health
```

Use `scripts/local-env.sh sam-api` for the local API loop, `scripts/local-env.sh sam-lambda` for direct Lambda invocation, and `scripts/local-env.sh localstack-start` only for optional AWS SDK wiring experiments. SAM uses the locally available Lambda image with `--skip-pull-image`, so these commands do not need Docker registry credentials.

The deterministic application checks are:

```sh
npm test
npm run typecheck
npm run lint
sam validate --template sam/template.yaml --lint
sam build --template-file sam/template.yaml --build-dir .aws-sam/build --cached
npm run test:integration
npm run test:contract
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
npm run local:seed-app -- --preset=dashboard --target=ios
npm run local:seed-app -- --preset=edge-cases --target=android
npm run local:seed-app -- --preset=dashboard --target=web
```

The app must already be running on the requested target. The command opens a confirmation screen; it does not write encrypted device/browser storage directly. Confirmation replaces the entire anonymous local dataset. It refuses signed-in account namespaces and any environment where `EXPO_PUBLIC_ENV` is not `local`. Use `--dry-run` to print the target URL without opening it. The dashboard preset covers ordinary current-month and report content; the edge-case preset additionally covers mixed currencies, over-budget states, archived history, and category deletion reassignment.

Native targets use the Expo Router path form `unfancy-money-tracker:///developer-seed?...` (three slashes); this is required so `developer-seed` is interpreted as a route rather than a URL host.

Mock fixtures are contract-tested whenever `npm test` runs. Run `npm run test:fixtures` while changing the preset factory; it verifies the persisted schema, record references, category/budget invariants, date range, clean initial-sync state, report history, and the edge-case budget states.

## Android development client

This app uses `react-native-mmkv` 3.x and Expo New Architecture, so Android must run in the project development client rather than Expo Go. Build and install it once with:

```sh
npm run android
```

This command waits for the emulator or connected device and automatically runs
`adb reverse tcp:3001 tcp:3001`, allowing Android to use the same
`http://127.0.0.1:3001` SAM API configuration as web and the iOS Simulator. Run
Android through this command instead of invoking `expo run:android` directly.

Then start Metro with:

```sh
npm run start
```

To run Android, iOS, and web together from one Expo server, use:

```sh
npm run start:all
```

Then press `a`, `i`, and `w` in the Expo terminal. `start:all` waits for Android
in the background and applies the same port reversal automatically when the
emulator or connected device becomes available.

Press `a` in the Expo terminal to open the installed development client. If the Android SDK is not configured, set `ANDROID_HOME` or create `android/local.properties` with the machine-specific `sdk.dir` path. The generated `android/` directory and local SDK path are not committed.
