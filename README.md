# Unfancy Money Tracker

Unfancy Money Tracker is an anonymous, local-only Expo app for manually tracking income, expenses, category budgets, and descriptive reports. Financial data stays in the encrypted local dataset on the device or browser. The retained AWS/SAM/DynamoDB sync backend is dormant and is not called by the app.

## Quick start

This project pins pnpm through Corepack. If pnpm is not already available, run
`corepack enable` once.

```sh
pnpm install
pnpm run local:verify
pnpm run android
pnpm run start
```

The first `pnpm run android` builds and installs the native development client. After that, use `pnpm run start` and press `a` to open the installed development client. Do not use Expo Go for this project because `react-native-mmkv` requires the New Architecture and native modules included in the development build.

The local service setup and reset behavior are documented in [docs/development/local-environment.md](docs/development/local-environment.md). Product scope and architecture decisions live in `docs/product/` and `docs/adr/`.
