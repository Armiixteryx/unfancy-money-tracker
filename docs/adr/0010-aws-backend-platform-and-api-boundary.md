# ADR 0010: AWS backend platform and API boundary

## Status

Updated by [ADR 0021](0021-portable-postgresql-sync.md), which is authoritative for restored opt-in sync, PostgreSQL/Flyway, schema 8, and system category slugs. Earlier suspended/DynamoDB/UUID-default decisions below are historical.

Accepted; persistence, database-networking, and migration portions superseded by ADR 0015.

## Context

The app needs email/password accounts, secure multi-device synchronization, revision-based conflict handling, managed PostgreSQL storage, and server-side authorization. The client must never connect directly to the database or contain cloud-service secrets. AWS is the selected backend platform.

## Decision

### AWS services

Use this AWS-native backend stack:

- Amazon Cognito User Pool for email/password authentication, confirmation, password recovery codes, refresh tokens, and session revocation;
- API Gateway HTTP API as the public API boundary;
- API Gateway JWT authorization using Cognito access tokens;
- TypeScript AWS Lambda functions for sync, conflict resolution, and server-side exchange-rate proxying;
- Aurora PostgreSQL Serverless v2 as the managed relational database;
- RDS Proxy between Lambda and Aurora for connection management;
- Cognito-managed email delivery for confirmation and password recovery during the initial low-volume rollout;
- AWS Secrets Manager and KMS for credentials and encryption keys;
- Amazon CloudWatch for operational logs and metrics;
- AWS CDK in TypeScript for infrastructure and environment configuration.

S3 and CloudFront may host the web PWA, but hosting is independent of the application API. DynamoDB, AppSync, Amplify Data, and AWS Realtime services are out of scope for v1; the record-level delta protocol in ADR 0005 is sufficient.

### API and authorization boundary

The Expo client calls API Gateway with a Cognito access token. API Gateway validates the JWT before invoking a Lambda handler. Lambda derives the opaque Cognito `sub` claim and enforces ownership on every query and mutation using the authenticated user identity.

The client never receives database credentials and never connects directly to Aurora. Application queries must scope every record to the authenticated user and dataset. PostgreSQL constraints and transactions enforce revision, uniqueness, and tombstone invariants; Lambda remains the authorization boundary.

### Sync API responsibilities

Expose server operations for:

- pushing idempotent record-level changes with a base revision;
- pulling remote changes from an account-scoped cursor;
- returning same-record conflicts without overwriting newer data;
- resolving a conflict by creating a new revision;
- acknowledging tombstones and advancing cursors.

Each write executes in a PostgreSQL transaction. A revision mismatch returns a conflict payload; it never falls back to last-write-wins. The client’s `SyncClient` adapter hides API Gateway details from the domain and Zustand layers.

### Database boundary

Store application data in normalized PostgreSQL tables with an authenticated owner identifier, dataset identifier, revision metadata, and tombstone state. Keep Cognito user/session data in Cognito-managed storage; application tables reference the opaque Cognito subject rather than email addresses.

Use versioned SQL migrations managed through AWS CDK deployment workflows. Do not expose a general-purpose database API to the client.

### Environment and operations

Maintain isolated development and production stacks in the same AWS account. Each stack owns its Cognito User Pool, API, Lambdas, Aurora cluster, proxy, VPC, KMS key, and logs. Local interactive builds use development; production infrastructure is synthesized but deployment is deferred until release readiness. Store AWS resource identifiers, database credentials, and service secrets outside the repository. CloudWatch logs and metrics must exclude financial values, descriptions, categories, tokens, and raw provider errors.

## Consequences

- AWS provides the managed identity, API authorization, database, email, secret, and operational primitives required by v1.
- Lambda and Aurora require connection, timeout, retry, transaction, and migration discipline.
- Authorization is implemented in application handlers rather than inherited from Supabase’s direct Auth-to-RLS integration.
- Cognito’s native password recovery uses confirmation codes, and email confirmation is part of the account onboarding flow.
- The backend is more operationally involved than Supabase but demonstrates explicit cloud architecture and security boundaries.

## Validation

- Cognito signup confirmation, sign-in, refresh, password recovery code, sign-out, and multi-session behavior.
- API Gateway rejects missing, expired, invalid, or wrong-audience JWTs.
- Lambda handlers cannot read or mutate records belonging to another Cognito subject or dataset.
- Push, pull, conflict, resolution, tombstone, cursor, and idempotency behavior matches ADR 0005.
- PostgreSQL transactions enforce revision checks and budget/category uniqueness.
- RDS Proxy handles concurrent Lambda connections without leaking credentials.
- Cognito confirmation and password-recovery messages work in configured environments.
- CDK deployments produce isolated environments and migrations are repeatable.
- CloudWatch diagnostics contain no financial or authentication secrets.
