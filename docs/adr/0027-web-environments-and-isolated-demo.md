# ADR 0027: Public web environments and isolated demo

## Status

Accepted October 15, 2026. Supersedes the demo deferral in ADR 0014 and the single Amplify main/production mapping in ADRs 0017 and 0021. Native releases and backend deployment gates remain governed by their existing runbooks.

## Context

The owner requested three public Amplify deployments, separate Git branches, no hosting password protection, and a demo isolated from development and production using synthetic data.

## Decision

Use the existing Amplify app `d127yvlpbgr7e4` in `us-east-1` with these mappings:

| Git branch | HTTPS hostname | Runtime | Backend |
| --- | --- | --- | --- |
| `production` | `unfancymoneytracker.camperos.me` | `prod` | Existing production Cognito/API |
| `main` | `development.unfancymoneytracker.camperos.me` | `dev` | Existing development Cognito/API |
| `demo` | `demo.unfancymoneytracker.camperos.me` | `demo` | None |

Create `production` and `demo` from the existing main commit. Subsequent branch pushes build their respective websites; promote reviewed work by merging it to the intended branch. Deployment target selection is enforced by `scripts/build-amplify-web.sh`; public API URLs and Cognito identifiers live in Amplify branch variables. Clear Metro transforms for each export. This hosting request authorizes these initial web releases; backend migrations/releases still use their existing explicit gates.

Remove Amplify HTTP basic authentication for the app and all three branches. Application Cognito authentication remains optional on development and production. Porkbun remains authoritative for DNS; Amplify manages and renews HTTPS using the retained certificate validation CNAME.

The demo immediately opens a populated dashboard using bundled synthetic USD records, with a persistent English/Spanish demo notice. It has no accounts, synthetic identities, remote database, voice processing, shared trackers, analytics, or cross-currency conversion. It never presents simulated cloud backup. Same-currency values work; unsupported conversions use the existing unavailable-rate behavior.

Demo records and preferences are held only in page memory through the existing persistence adapter contract. They are never read from or written to IndexedDB, and no existing durable records are replaced. Reloading/closing the page discards the demo session; an explicit confirmed Reset demo action restores fresh samples. Warn users of that lifetime and ask them to enter sample data only. Production/development remain empty on first use and retain their existing durable storage. Browser origins isolate all three deployments.

Disable Cognito initialization and analytics in demo, block recording before microphone access, clear cloud identifiers in demo builds, and add a demo HTML Content Security Policy that blocks connections, forms, frames, and objects. Static scripts, fonts, and images are served by Amplify. There is no demo backend infrastructure or provider cost; ordinary Amplify build/hosting charges apply.

## Consequences

- Public visitors can explore the product without a hosting password.
- Development and production accounts/data stay in their existing distinct environments.
- The demo demonstrates manual tracking and reporting, with conspicuous limitations and temporary data.
- Work is promoted independently to production and demo; main pushes update development only.
- Local records on the old Amplify hostname stay at that browser origin. Custom domains do not silently migrate browser storage or sign-in sessions.

## Validation

Check strict TypeScript and relevant automated regressions; build all three branches; verify unauthenticated HTTPS routes/assets and correct environment metadata. Confirm demo samples, manual edits, confirmation/reset, reload reset, disabled cloud features, and absence of backend/analytics requests in a fresh browser. Do not submit live voice recordings as part of this hosting change.
