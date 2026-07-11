# ADR 0009: Application architecture and state boundaries

## Status

Accepted.

## Context

Unfancy Money Tracker targets web, iOS, and Android with one shared TypeScript codebase. Its local financial records, remote sync, exchange rates, authentication, forms, and cross-cutting readiness states have different lifecycles and must not become one undifferentiated store. The architecture should keep feature workflows cohesive while preserving shared domain behavior and thin platform-specific integrations.

## Decision

### Code organization

Organize the codebase feature-first with shared domain, platform, and UI layers:

```text
src/
  domain/
  features/
    dashboard/
    transactions/
    budgets/
    reports/
    settings/
    auth/
    sync/
  platform/
  ui/
app/
  (tabs)/
```

Keep pure money, transaction, category, budget, report, and sync calculations in `src/domain`. Keep workflow screens, components, forms, stores, and query modules within their feature. Keep persistence, secure-key, authentication, exchange-rate, and other platform APIs behind interfaces in `src/platform`.

### Navigation boundaries

Use five primary Expo Router routes: Dashboard, Transactions, Budgets, Reports, and Settings. Forms, transaction details, authentication, sync onboarding, and conflict resolution are nested flows or modal routes rather than additional primary navigation items.

### State ownership

Use Zustand for local financial records and local UI state. Zustand is the source of truth for the hydrated local dataset, including transactions, categories, budgets, preferences, sync metadata, and queued local mutations.

Use TanStack Query for cloud sync requests, authentication requests, exchange-rate requests, and other remote/server state. Keep query hooks in feature-local query modules with shared transport and query-key utilities. TanStack Query cache is never persisted as domain data and never replaces the local Zustand dataset.

### Mutation and validation boundaries

Feature components submit commands through feature store actions. Store actions call pure domain use cases, which validate and calculate before persistence and sync enqueueing:

```text
Form
  → feature store action
  → domain use case
  → validation/calculation
  → persistence and sync queue
  → Zustand state update
```

Use React Hook Form and Zod for field-level form validation and user feedback. Validate again at the domain boundary before any mutation is persisted or synchronized. A form must not be able to bypass domain invariants by calling persistence directly.

### UI system and readiness states

Build a global design system from NativeWind tokens and React Native Reusables primitives. Keep feature-specific compositions local; the global layer owns reusable primitives, tokens, accessibility defaults, and shared status treatments rather than complete feature screens.

The global app shell owns persistence hydration, authentication readiness, and global sync gates. Each feature owns its loading, empty, validation, success, and error states after the shell reports readiness. Screens must not render partially hydrated financial records.

### Cross-platform boundaries

Share domain logic, feature behavior, validation, and calculations across web, iOS, and Android. Isolate storage, secure keys, authentication, exchange rates, navigation-specific APIs, and other platform differences behind thin adapters that implement shared contracts.

Preserve the adapter contracts defined by ADRs 0004–0008, including `PersistenceAdapter`, `AuthClient`, `ExchangeRateProvider`, and `SyncClient` boundaries.

## Consequences

- Feature code remains cohesive while financial invariants stay reusable and testable.
- Zustand and TanStack Query have distinct lifecycles, avoiding duplicated sources of truth.
- Domain use cases add an intentional boundary between forms, state, persistence, and sync.
- The app shell can block unsafe partial hydration without centralizing every feature’s UI state.
- Thin adapters reduce platform drift but require contract tests for each native and web implementation.
- The global UI layer requires disciplined limits so it does not become a second feature layer.

## Validation

- Route groups resolve correctly on web, iOS, and Android.
- Hydration and authentication gates prevent partially initialized screens.
- Feature stores update local records only through domain actions and use cases.
- Domain validation runs even when a form bypasses UI validation.
- Successful mutations persist, update Zustand, and enqueue sync exactly once.
- TanStack Query failures expose feature-level recovery states without corrupting local records.
- Platform adapters conform to their shared contracts.
- NativeWind and React Native Reusables primitives preserve accessible labels, focus behavior, touch targets, and color-independent statuses.
- No persisted domain data is placed in TanStack Query cache or transient UI state.
