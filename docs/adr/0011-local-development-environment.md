# ADR 0011: Local development environment

## Status

Accepted

## Context

The product is anonymous and local-first, but optional account and sync behavior must use the real Cognito and API authorization boundary. The repository also needs fast, deterministic backend tests that do not deploy infrastructure or consume cloud data.

## Decision

Interactive web, iOS, and Android development uses the AWS development stack for Cognito, API Gateway, and Aurora-backed sync. Missing cloud configuration does not block anonymous tracking; Backup & sync reports that cloud backup is unavailable.

Docker PostgreSQL and AWS SAM remain test infrastructure. They run the production sync and exchange-rate handlers against synthetic data for integration, migration, conflict, ownership, and API-contract verification. SAM is not an interactive authentication environment. Every local sync request must provide an explicit synthetic `x-local-subject`.

In-memory authentication and sync adapters remain unit-test doubles only. They must never be selected by runtime configuration. MailHog and the local auth-email endpoint are removed because Cognito manages interactive confirmation and recovery delivery.

`EXPO_PUBLIC_ENV=local` continues to gate local-only fixture tooling. Local and development app builds use development-stack public outputs; production builds use only production-stack outputs.

## Consequences

- Authentication and end-to-end sync tests exercise Cognito rather than an imitation that can drift.
- Anonymous development remains available before the AWS development stack is configured.
- Backend domain and persistence tests stay fast and deterministic through SAM and PostgreSQL.
- Interactive development requires network access for account and sync operations.
- Developers must avoid real financial data in the development environment.

## Validation

- Anonymous use works with incomplete cloud configuration.
- Backup & sync fails safely without falling back to test adapters.
- Cognito sign-up, confirmation, recovery, refresh, and sign-out work against development.
- SAM sync calls without `x-local-subject` are rejected.
- Synthetic subjects cannot access one another’s datasets.
- Local reset commands affect only Docker and generated SAM artifacts.
