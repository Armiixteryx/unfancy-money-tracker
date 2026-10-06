# Unfancy Money Tracker — Agent Guide

## Project purpose

Build Unfancy Money Tracker, a polished, cross-platform personal-finance tracker for individuals. It is a portfolio project intended to demonstrate product, design, and engineering judgment.

The source of truth for product scope is [docs/product/personal-finance-dashboard-v1.md](docs/product/personal-finance-dashboard-v1.md). Read it before changing product behavior.

## Technology direction

- Expo, React Native, TypeScript, Expo Router.
- NativeWind and React Native Reusables for UI.
- TanStack Query for asynchronous/server state.
- Zustand for local UI/domain state.
- React Hook Form and Zod for forms and validation.
- React Native MMKV for local persistence.
- PostHog for privacy-conscious product analytics.

Do not introduce an alternative framework, state library, styling system, or persistence layer without a documented decision.

## Product boundaries

- V1 tracks manual income and expenses, with optional authenticated remote voice expense entry through Vercel/SpaceXAI and Cloudflare. Saved records remain local by default; a separate Settings opt-in restores personal cross-device sync through PostgreSQL. Follow ADRs 0017 and 0021 for voice and sync boundaries.
- There are no financial accounts, source/destination details, transfers, bank connections, investments, debt tracking, or shared finances.
- A transaction requires a positive amount, type, category, description, date, and currency.
- Users may skip login; optional Cognito email/password authentication enables voice independently and preserves the same locally persisted records. Sync requires a separate upload notice and opt-in. Optional voice processing sends audio/transcript and active category choices remotely. PostgreSQL sync uses one canonical cloud dataset per login, a durable schema-8 outbox, manual conflicts, and confirmed merge/replacement/reset controls. Production deployment was authorized October 5, 2026; use the explicitly gated staged deployment workflow.
- CSV export is a non-functional Pro-feature preview in V1. Do not implement export, payments, or subscription enforcement unless the product definition changes.
- Insights must be factual and descriptive; do not present financial advice.

## UX and accessibility

- Design mobile-first, then use browser width for analysis rather than duplicated navigation.
- Preserve the dashboard hierarchy: remaining budget is the primary current-month answer; income and expenses support it.
- Implement complete loading, empty, validation, offline, destructive-confirmation, and error states.
- Use accessible labels, focus behavior, touch targets, semantic controls, and color-independent status indicators.
- Keep financial UI calm and legible: warm neutral surfaces, deep navy text, emerald positive states, coral overspending states, and high contrast.

## Data and privacy

- Preserve original transaction amount and currency; only aggregates convert to the user-selected base currency.
- Show exchange-rate freshness. Cached rates must be visibly stale; without a rate, do not show a misleading combined total.
- Never silently discard data during migrations, recovery, fixture replacement, or reset operations.
- Analytics is anonymous, consent-gated, and may record product actions but must never include transaction amounts, descriptions, categories, or other sensitive financial content.
- Treat all financial data as sensitive in logs, errors, test fixtures, and analytics payloads.
- When changing voice category matching, send built-in English/Spanish labels together under the existing category ID; keep custom and unidentifiable legacy names unchanged. Update the backend contract before the client starts sending optional `localizedNames`, rebuild local SAM before endpoint checks, and make the synthetic voice smoke check require the exact expected category ID. Synthetic voice diagnostics may report only case index, outcome, and selected-option probability.

## Documentation

- Record product decisions in `docs/product/`.
- Record durable technical decisions in `docs/adr/` using the existing ADR format.
- Update the product definition and relevant ADR when a change alters accepted scope or behavior.

## Working conventions

- Before testing mobile changes, first check for an attached physical Android device with `adb devices` and an attached physical iPhone or iPad available to Xcode (for example, `xcrun xctrace list devices`). Prefer a connected physical device for each platform when one is available; use an emulator or simulator only when no suitable physical device is attached.
- Start Android with `pnpm run android`; it automatically configures ADB port reversal for the local SAM API. Do not invoke `expo run:android` directly.
- To run Android, iOS, and web from one Expo server, use `pnpm run start:all`, then open each target with Expo's `a`, `i`, and `w` shortcuts.
- Keep TypeScript strict; avoid `any` and validate external or persisted data at boundaries.
- Prefer small, focused components and feature-local code over large shared abstractions.
- Add or update tests for behavior changes, especially calculations, validation, persistence, conversion fallbacks, migration, recovery, and local cleanup states.
- Do not commit secrets, provider keys, real financial data, or production analytics credentials.

## PostgreSQL sync conventions

- Use UUIDv7 for new datasets, custom categories, transactions, budgets, and mutation IDs. System categories use `${kind}-${defaultCategoryKey}` fixed slugs; currency preferences are a singleton per dataset.
- Use plain parameterized SQL through `pg`, normalized tables, and Flyway Community 13.9.0. Applied SQL files are immutable; add forward migrations. Never automatically clean, baseline an unexpected schema, or repair checksums.
- PostgreSQL 18.6 is pinned locally and in AWS. Validate migration history before service release or restore. Run `pnpm run db:build-migrations` before CDK synthesis.
- Push acknowledgments never advance the pull cursor. Submitted outbox entries stay immutable; failed local saves must not upload. Preserve pending data across logout, offline restart, and failures.
- Confirm local replacement/reset; download and validate before replacing durable data. Keep language, theme, consent, and notice state device-local during merge/replacement. A different sync login requires a confirmed local reset.
- Keep one reusable PostgreSQL connection per Node execution environment, verified nonlocal TLS, separate role credentials, private workers and Secrets Manager connectivity, and reserved concurrency 5/2/1 by default. Development alone can explicitly select shared Lambda concurrency through `DEV_LAMBDA_CONCURRENCY_MODE=shared` / CDK `devConcurrencyMode=shared`; retain database role connection limits 5/2 and follow the ADR 0021 troubleshooting runbook. Diagnostics must omit SQL, parameters, financial/authentication contents, and row data.
- RDS automated backups retain one day in development and production. AWS rejected seven days for this account; the owner approved the production one-day recovery window on October 5, 2026. Never disable automated backups to work around a rejected retention period.
- Provision/migrate the separate database stack before switching service handlers. Release voice slug support before the schema-8 client. The development cutover permits explicit old-record reset; never reset during hydration or silently discard migration/recovery backups.
