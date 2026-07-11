# ADR 0011: Local development environment

## Status

Accepted.

## Context

The app has a local-first client and an AWS backend with Cognito, API Gateway, Lambda, Aurora PostgreSQL, and SES. Requiring cloud credentials or deployed infrastructure for every development task would slow down implementation, testing, and AI-agent iteration. The default local loop must be deterministic, offline-capable, safe for synthetic data, and close enough to the AWS boundaries to catch integration mistakes early.

## Decision

### Default local resources

The repository provides a Docker-based local environment with:

- PostgreSQL using the same major PostgreSQL version targeted by Aurora;
- MailHog for capturing confirmation and password-reset emails without sending real messages;
- optional LocalStack services for AWS SDK wiring experiments, enabled only when a task requires them.

Run Lambda handlers and API Gateway-compatible routes with the AWS SAM CLI. For CDK-defined functions, synthesize the stack first and use the generated template with `sam local start-api` or `sam local start-lambda`. Local SAM is the default API loop; it does not require an AWS account or deployed resources.

Use a local `AuthClient` development adapter for unit and ordinary integration tests. It provides deterministic synthetic users and session states behind the same interface as the Cognito adapter. Use LocalStack Cognito only for AWS SDK contract tests, and use a real disposable Cognito user pool for final confirmation, password-reset, JWT, and refresh-token verification.

### Deterministic fixtures and safety

Provide synthetic users, transactions, categories, budgets, sync changes, conflicts, rate records, and authentication responses as versioned fixtures. Fixtures must contain no real personal or financial data.

Local development defaults to a documented, non-production environment configuration. Production credentials, Cognito secrets, database credentials, PostHog keys, and real email destinations are rejected from local fixture and test configuration.

### Repository commands and reset behavior

Expose predictable scripts for:

- starting and stopping local services;
- applying database migrations;
- seeding synthetic fixtures;
- starting SAM local API and Lambda endpoints;
- running unit, integration, and contract tests;
- checking types and linting;
- resetting all local data and containers.

Each command must be non-interactive by default, document its required port and environment variables, and fail with an actionable message when Docker, SAM CLI, or required dependencies are missing. Reset commands may destroy only local development resources and must never target a non-local AWS environment.

### Environment boundaries

The client selects the local API through an explicit development environment variable. The local API uses PostgreSQL and local auth/email adapters by default. A separate AWS development profile points the same client contracts at API Gateway, Cognito, Aurora/RDS, and SES for integration testing.

Local and AWS implementations must share the same `AuthClient`, `PersistenceAdapter`, `SyncClient`, and domain interfaces. Local substitutes may simplify transport and identity, but they must preserve success, loading, offline, invalid-credential, conflict, and error states.

### AI-agent workflow

The repository includes concise setup documentation near the scripts, `.env.example` files with safe placeholders, health checks, fixture names, expected ports, and a verification command that confirms the local loop is ready. Agents should be able to start from a clean checkout without opening a cloud console or requesting production credentials.

## Consequences

- Most frontend, domain, persistence, sync, and Lambda work can proceed without AWS credentials or network access.
- Local PostgreSQL catches schema, migration, transaction, and ownership errors before Aurora testing.
- SAM local catches Lambda packaging and API-boundary errors, but deployed API Gateway and Cognito behavior still require AWS integration tests.
- MailHog prevents accidental email delivery during local auth flows.
- A development auth adapter adds a test-only implementation that must never be enabled in production builds.
- LocalStack remains optional to keep the default environment fast and reliable.

## Validation

- A clean checkout can start PostgreSQL and MailHog, apply migrations, seed fixtures, and run the local API without AWS credentials.
- SAM local routes invoke the same Lambda handlers used by the CDK stack.
- Synthetic sign-up, sign-in, confirmation, password-reset, invalid-credential, and offline-session states are reproducible.
- Sync push, pull, conflict, tombstone, revision, and idempotency fixtures pass against local PostgreSQL.
- Local reset removes only local containers, volumes, and generated artifacts.
- Local configuration rejects production credentials and real financial fixtures.
- Contract tests compare local adapters with the Cognito, API Gateway, Aurora/RDS, and SES integration boundaries.
- The documented readiness command reports missing Docker, SAM CLI, dependencies, ports, or environment variables clearly.
