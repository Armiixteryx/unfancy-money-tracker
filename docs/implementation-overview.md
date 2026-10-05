# Unfancy Money Tracker — Implementation Overview

_Current repository state reviewed September 6, 2026._

## What the app does

Unfancy Money Tracker is a cross-platform Expo application for individuals who want a simple, consolidated view of manually entered income, expenses, monthly category budgets, and spending history.

The app keeps financial records on the device or in the browser and supports anonymous manual tracking. Optional Cognito login enables remote voice entry only. The client calls the public rates Lambda and authenticated voice Lambda; the retained AWS/SAM/DynamoDB sync backend remains dormant. The product deliberately does not model bank accounts, transfers, investments, debt, shared finances, or financial advice.

## Main features

| Surface | Current behavior | State |
| --- | --- | --- |
| Dashboard | Shows the current month, income and expenses by original currency, a base-currency snapshot when rates are available, category spending, recent activity, and budget remaining by currency. | Implemented |
| Transactions | Create, edit, delete, search, and filter income and expense records by type, category, currency, and date range. Desktop/browser uses a list plus detail-pane workspace; mobile uses a full-screen form. | Implemented |
| Budgets | Navigate between calendar months; create, edit, and delete one expense-category budget per month; view spent, limit, remaining, progress, near-limit, and over-budget states. | Implemented |
| Reports | View 3-, 6-, or 12-month spending history, original-currency monthly bars, current-month category breakdown, and factual activity observations. | Implemented |
| Settings | Change base currency and theme; manage categories; inspect exchange-rate freshness; toggle optional analytics; reset local data; view the CSV Pro preview. | Implemented |
| Categories | Create, rename, archive, and delete income or expense categories. Protected `Uncategorized` categories remain available; deleting a category reassigns its records and budgets. | Implemented |
| Exchange rates | Uses Frankfurter blended rates through a shared DynamoDB cache, with 24-hour freshness for latest and requested historical dates. Device caches support visibly stale offline fallback; combined totals are withheld when a required rate is unavailable. | Implemented |
| Local dataset | Anonymous CRUD, encrypted local persistence, schema migration, recovery, category-deletion tombstones, and local fixture replacement. | Implemented |
| Retained sync backend | Cognito, API Gateway, Lambda, and DynamoDB handlers/repositories/contracts remain for a future client reintroduction. The Expo app has no auth, sync client, runtime cloud configuration, or sync UI. | Dormant and retained |
| Analytics | PostHog is opt-in and disabled by default. Allowed properties are restricted to safe product metadata; financial values and user-entered content are excluded. | Implemented |
| CSV export | Shows a non-functional Pro-feature interest preview and records the CTA locally/through safe analytics. It does not download CSV files or process payments. | Intentionally preview-only |

## Core data behavior

- Transactions require a positive amount, type, category, description, date, and currency.
- Amounts are stored as canonical decimal strings, with `decimal.js` used for calculations and currency-precision-aware rounding.
- Original transaction amounts and currencies are preserved. Only aggregates are converted to the selected base currency.
- Categories and records use UUIDs, so renaming a category updates its historical labels without rewriting transaction names.
- Budgets apply to expense transactions in one selected calendar month and do not roll over.
- Income does not consume a category budget.
- Category deletions create local tombstones while related transactions and budgets move to protected `Uncategorized`.
- Persisted datasets are schema-validated and migrated between storage schema versions.

## Technical implementation

- Expo 54, React Native, TypeScript, and Expo Router provide the web, iOS, and Android application shell.
- Zustand owns local dataset and UI state; TanStack Query handles exchange-rate and remote-operation state.
- React Hook Form and Zod are used for form and boundary validation.
- Native persistence uses encrypted MMKV storage; web persistence uses IndexedDB with Web Crypto encryption. An in-memory adapter supports tests and local fallback paths.
- Domain logic is separated into transaction, category, budget, money, aggregate, report, and validation modules under `src/domain` and `src/features`.
- Retained server contracts and adapters use Cognito, API Gateway, Lambda, and DynamoDB; they are server-owned and independent of the deleted Expo client surfaces. Aggregate and reporting queries remain client-side.
- Infrastructure is defined with AWS CDK. SAM and DynamoDB Local support local API and repository testing.
- The UI uses a custom theme system with warm neutral surfaces, navy text, emerald positive states, coral negative states, responsive browser layouts, and accessibility labels/status messaging. The dependency set includes NativeWind, but the current feature screens primarily use themed React Native styles.

## Current implementation state

### Working end-to-end locally

- Anonymous local dataset creation and hydration.
- Transaction and budget CRUD with validation and destructive confirmations.
- Category lifecycle and reassignment behavior.
- Dashboard aggregates and reporting calculations.
- Theme, base-currency, analytics-consent, and local-reset preferences.
- Latest and historical exchange-rate adapters, caching, stale-rate notices, and unavailable-rate fallbacks.
- Local persistence migrations and recovery UI for unreadable snapshots.
- Development-only mock dataset seeding for visual/manual QA.

### Retained backend

The AWS implementation remains available for a future reintroduction and is kept undeployed/unchanged by normal app use. No public Cognito or sync API values are read by the Expo client.

The AWS implementation currently uses Cognito, API Gateway HTTP API, Lambda, and DynamoDB. Production infrastructure can be synthesized and inspected; production deployment remains intentionally deferred by the project’s deployment decisions.

### Notable implementation caveat

The dashboard currently renders a converted base-currency income/expenses/net snapshot, while budget remaining is displayed per original currency. A single unified, converted remaining-budget figure is not currently rendered.

### Deliberately not implemented in V1

- Bank connections, imports, account balances, source/destination fields, and transfers.
- Investments, loans, debt tracking, shared household finances, or financial advice.
- Actual CSV downloads, payments, subscriptions, or Pro enforcement.
- Account deletion.
- End-user demo data. Mock data exists only as local development tooling.

## Validation and verification

The repository contains domain, persistence, local-store, analytics, exchange-rate, fixture, server-contract, repository, and infrastructure tests.

Verified during this review:

- `pnpm run typecheck` — passed.
- `pnpm run lint` — passed.
- `pnpm test` — 17 test files and 50 tests passed.
- `pnpm run test:fixtures` — passed.
- `pnpm run test:contract` — passed, including SAM validation, CDK assertions, and dev/prod synthesis.
- The local persistence portion of `pnpm run test:integration` passed. DynamoDB repository cases require DynamoDB Local on `127.0.0.1:8000`; Docker was unavailable during this review, so those cases could not run.

## Useful entry points

- Product scope: [`docs/product/personal-finance-dashboard-v1.md`](product/personal-finance-dashboard-v1.md)
- Local setup and development commands: [`docs/development/local-environment.md`](development/local-environment.md)
- App routes: [`app/(tabs)/`](../app/(tabs)/)
- Feature screens: [`src/features/`](../src/features/)
- Domain rules: [`src/domain/`](../src/domain/)
- AWS infrastructure: [`infra/lib/unfancy-money-tracker-stack.ts`](../infra/lib/unfancy-money-tracker-stack.ts)
