# ADR 0011: Local development environment

## Status

Accepted

## Context

The product is anonymous and local-only. The repository also needs fast, deterministic tests for the retained backend that do not deploy infrastructure or consume cloud data from app launches.

## Decision

Interactive web, iOS, and Android development does not require the AWS stack. The retained Cognito, API Gateway, and DynamoDB backend is exercised only by backend contract/integration workflows and remains dormant from the Expo app.

DynamoDB Local and AWS SAM provide local backend test infrastructure. They run the production sync and exchange-rate handlers against synthetic data for initialization, conflict, ownership, idempotency, concurrency, and API-contract verification. SAM is not an interactive authentication environment. Every local sync request must provide an explicit synthetic `x-local-subject`.

The removed in-memory authentication and client-sync adapters are not runtime options. Backend tests use synthetic subjects and records only; no app flow performs interactive authentication or cloud sync.

`EXPO_PUBLIC_ENV=local` continues to gate local-only fixture tooling. The Expo app does not consume Cognito or sync API outputs.

## Consequences

- Anonymous development remains available without the AWS development stack.
- Backend domain and persistence tests stay fast and deterministic through SAM and DynamoDB Local.
- Developers must avoid real financial data in the development environment.

## Validation

- Anonymous use works with incomplete cloud configuration.
- SAM sync calls without `x-local-subject` are rejected.
- Synthetic subjects cannot access one another’s datasets.
- Local reset commands affect only Docker and generated SAM artifacts.
