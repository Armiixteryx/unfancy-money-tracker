# Unfancy Money Tracker

Unfancy Money Tracker is a local-first Expo app for income, expenses, category budgets, and descriptive reports. Optional Cognito login enables voice; a separate Settings opt-in enables personal cross-device sync. Financial records persist in encrypted MMKV/IndexedDB locally, with portable PostgreSQL 18.6 and Flyway Community 13.9.0 for cloud sync. Production was deployed October 5, 2026 with one-day automated backups. The three public web environments are hosted on AWS Amplify without a hosting password; see below and [ADR 0027](docs/adr/0027-web-environments-and-isolated-demo.md).

## Quick start

This project pins pnpm through Corepack. If pnpm is not already available, run
`corepack enable` once.

```sh
pnpm install
pnpm run local:verify
pnpm run local:start
pnpm run android
pnpm run start
```

The first `pnpm run android` builds and installs the native development client. After that, use `pnpm run start` and press `a` to open the installed development client. Do not use Expo Go for this project because `react-native-mmkv` requires the New Architecture and native modules included in the development build.

The local service setup and reset behavior are documented in [docs/development/local-environment.md](docs/development/local-environment.md). Product scope and architecture decisions live in `docs/product/` and `docs/adr/`.

## Web environments

| Branch | URL | Services |
| --- | --- | --- |
| `production` | https://unfancymoneytracker.camperos.me | Production |
| `main` | https://development.unfancymoneytracker.camperos.me | Development |
| `demo` | https://demo.unfancymoneytracker.camperos.me | Isolated synthetic data, no backend |

Pushes build the matching branch. Promote reviewed changes by merging into `production` or `demo`; a `main` push updates development. `scripts/build-amplify-web.sh` enforces the target, while Amplify branch variables hold public API/Cognito configuration. Backend deployment still follows the existing staged runbook.

Demo edits live in page memory and reset on refresh/close or a confirmed Reset demo. Accounts, sync, shared trackers, voice, analytics, and cross-currency conversion are unavailable. Existing browser-local records/sessions on the old Amplify hostname remain there; changing domains does not migrate them.

DNS stays in Porkbun. Preserve the Amplify certificate-validation CNAME for automatic HTTPS renewal.

## Verify a web deployment

After a branch deploys, verify the exported routes and static asset routing with the deployed base URL:

```sh
pnpm run verify:web:deployment -- https://<your-amplify-domain>
```

The check requests only public route and asset URLs; use the URL for the deployment you intend to verify and do not commit private URLs or credentials.

See the [PostgreSQL rollout and portability runbook](docs/development/postgresql-sync.md) for migrations, dev reset, database roles, verification, and dump/restore.
