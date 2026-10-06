# Local development

The active backend is portable PostgreSQL sync and exchange-rate caching, plus optional authenticated voice. The [PostgreSQL runbook](postgresql-sync.md) is authoritative for database migrations, staged dev rollout, reset, credentials, and dump/restore. Historical DynamoDB Local instructions are superseded by ADR 0021.

Copy `.env.example` to gitignored `.env.local` for local configuration. These defaults are synthetic and must never configure production credentials. Use Docker Desktop, Node 22+, the pinned pnpm version, AWS SAM, and platform SDKs. Java 21/Maven tooling runs in a pinned Docker build.

```sh
pnpm install
pnpm run local:verify
pnpm run local:start
pnpm run local:sam
# In a second terminal:
pnpm run start:all
```

`local:start` starts PostgreSQL 18.6 and validates/applies Flyway 13.9.0 migrations. PostgreSQL uses host port 55432, SAM API 3001, and the optional SAM invocation endpoint 3002. `local:stop` preserves database data. `db:migrate` is safe to repeat. `local:reset` removes this Compose project's containers/volumes; it does not reset MMKV/IndexedDB app data or AWS records. Use the explicitly confirmed Settings reset for app records and sync binding. Do not reset a real financial dataset.

Check `adb devices` and `xcrun xctrace list devices` before native testing. Prefer an attached physical device for each platform. Build Android with `pnpm run android` (it configures ADB port reversal), and iPad/iPhone with `pnpm run ios -- --device <UDID>`. Use `start:all` with a/i/w for a shared Expo server. MMKV needs the development client, not Expo Go. For LAN-connected iPad, configure a reachable SAM URL or AWS dev backend; Android port reversal supports loopback.

Voice and local sync validate the existing Cognito access token. Login does not upload financial records; enable sync separately in Settings. New installs can Skip login. Auth credentials use independent storage. Anonymous and signed-in manual tracking share the same financial snapshot. Old snapshots are backed up/migrated without automatic reset; historical non-v7 records need an explicitly confirmed development reset before sync upload/merge.

Development fixtures are available through `pnpm run local:seed-app` with the existing synthetic dashboard/edge-case presets. Confirm any replacement through that tooling. Fixtures are not end-user demo data and are unavailable in production. Do not use fixture replacement to bypass sync-account reset requirements.

Run `typecheck`, `lint`, `test`, `test:integration`, and `test:contract`. The last builds the migration package, validates SAM, checks infrastructure assertions, and synthesizes dev/prod without deployment. SAM must be rebuilt before voice/sync endpoint checks. Production was authorized October 5, 2026. Both stage deployment scripts provision the database, validate/apply migrations, then release service handlers. Production retains the explicit `ALLOW_PROD_DEPLOY=1` gate and approved one-day automated backups.

Production Android release builds require the private signing key path in `UNFANCY_ANDROID_KEYSTORE` and its password in `UNFANCY_ANDROID_SIGNING_PASSWORD`. Keep the key outside the repository and preserve it for subsequent updates. Set all public API and Cognito values explicitly, clear generated release bundles when changing environments, then install with `pnpm run android -- --variant release --device SM_A546E --no-bundler`.
