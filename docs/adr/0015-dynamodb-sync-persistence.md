# ADR 0015: DynamoDB sync persistence

## Status

Updated by [ADR 0021](0021-portable-postgresql-sync.md), which is authoritative for restored opt-in sync, PostgreSQL/Flyway, schema 8, and system category slugs. Earlier suspended/DynamoDB/UUID-default decisions below are historical.

Accepted; supersedes the persistence, database-networking, and migration portions of ADR 0010.

## Context

The initial AWS design used Aurora PostgreSQL Serverless v2, RDS Proxy, a VPC, and a NAT Gateway. Those resources create a material idle baseline for a low-traffic portfolio application. The sync API needs conditional record revisions, ordered deltas, ownership isolation, idempotency, and tombstones, but it does not need relational queries because financial aggregates remain client-side.

## Decision

Use one provisioned DynamoDB Standard table per deployment stage. Dev and future prod each use 5 RCU and 10 WCU without autoscaling, keeping their combined provisioned capacity within the account-level 25 RCU and 25 WCU free quota. Use the default AWS-owned encryption key. Dev does not enable paid backups; future prod enables point-in-time recovery, deletion protection, and retained removal behavior.

Store one partition per authenticated dataset using `OWNER#{subject}#DATASET#{datasetId}`. Use sort-key prefixes for dataset metadata, current records, immutable ordered changes, and idempotency acknowledgements. A conditional DynamoDB transaction advances the dataset revision and writes those items atomically. A stale record revision returns a conflict and never overwrites cloud state. Persist idempotency and change history without TTL so delayed retries and devices remain safe.

Keep Cognito, API Gateway HTTP API with its JWT authorizer, and Lambda. Run Lambdas outside a VPC and grant only the sync Lambda access to the table. API Gateway remains the trusted JWT boundary and applies a low-traffic throttle. Push requests contain at most 20 changes so provisioned throughput and the synchronous API timeout remain bounded.

DynamoDB Local replaces Docker PostgreSQL for SAM and repository integration tests. Local and deployed handlers use the same repository, with only the endpoint and credentials supplied differently.

## Consequences

- The dev stack has no Aurora, RDS Proxy, VPC, NAT Gateway, database secret, or customer-managed KMS baseline.
- The backend stores sync envelopes instead of normalized reporting projections.
- Domain schemas validate financial records before writes; reporting and aggregate queries remain client-side.
- Dataset-level revision allocation can contend, so writes use bounded retry and deliberately small batches.
- Production recovery is intentionally a paid safeguard when production deployment is approved.

## Validation

- Idempotent retry, ordered pull cursor, same-record conflict, tombstone, resolution, ownership-isolation, and concurrent-write tests run against DynamoDB Local.
- CDK assertions prove the relational/network resources are absent and stage-specific recovery settings are correct.
- API Gateway rejects invalid Cognito tokens before invoking Lambda.
- Logs and errors contain no financial payloads, descriptions, categories, tokens, or provider response bodies.
