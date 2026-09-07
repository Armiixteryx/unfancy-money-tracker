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

- V1 tracks manual income and expenses only.
- There are no financial accounts, source/destination details, transfers, bank connections, investments, debt tracking, or shared finances.
- A transaction requires a positive amount, type, category, description, date, and currency.
- Users are anonymous and local-only. The retained AWS/SAM/DynamoDB sync backend is dormant and is not called by the Expo app.
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

## Documentation

- Record product decisions in `docs/product/`.
- Record durable technical decisions in `docs/adr/` using the existing ADR format.
- Update the product definition and relevant ADR when a change alters accepted scope or behavior.

## Working conventions

- Start Android with `pnpm run android`; it automatically configures ADB port reversal for the local SAM API. Do not invoke `expo run:android` directly.
- To run Android, iOS, and web from one Expo server, use `pnpm run start:all`, then open each target with Expo's `a`, `i`, and `w` shortcuts.
- Keep TypeScript strict; avoid `any` and validate external or persisted data at boundaries.
- Prefer small, focused components and feature-local code over large shared abstractions.
- Add or update tests for behavior changes, especially calculations, validation, persistence, conversion fallbacks, migration, recovery, and local cleanup states.
- Do not commit secrets, provider keys, real financial data, or production analytics credentials.
