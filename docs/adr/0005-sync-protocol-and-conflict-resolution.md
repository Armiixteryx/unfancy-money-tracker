# ADR 0005: Sync protocol and conflict resolution

## Status

Accepted.

## Context

Unfancy Money Tracker supports anonymous local use and optional email/password sync across devices. Initial sync must preserve both local and cloud data, while later offline edits must converge without silently overwriting financial records. The product also needs clear progress and recovery states when sync is pending, stale, unavailable, or conflicted.

## Decision

### Sync model

Use record-level delta sync layered over the versioned dataset envelope from ADR 0004. Each local mutation produces a syncable change containing the entity type, record UUID, operation, base revision, latest record state or tombstone, and an idempotency key.

The client maintains an ordered outbox for local changes and an inbox cursor for acknowledged remote changes. Upload and download are retryable and idempotent. A successful upload is not treated as durable cloud state until the server acknowledges it.

If a user edits the same record multiple times while offline, coalesce the outbox entry to the latest state while retaining the original base revision for conflict detection.

### First sync and automatic synchronization

Signing up or signing in preserves the anonymous local dataset and begins an explicit merge with the cloud dataset. The merge imports records from both sides and never silently deletes either side.

Signed-in data synchronizes automatically when online, on app focus, and after reconnect. Anonymous changes remain local until an account sync is enabled.

Records with unique UUIDs are retained. Different UUIDs representing suspected duplicates, such as category records with the same kind and name, remain separate and do not block unrelated synchronization. They are surfaced for optional later cleanup.

### Conflicts

Use optimistic revision checks. Each write includes the revision it was based on; a revision mismatch returns a conflict instead of overwriting the newer record.

For same-record concurrent edits, the conflict UI offers two choices: keep the local version or keep the cloud version. The selected choice creates a new revision; neither historical version is mutated in place.

Deletion versus a newer edit requires explicit review. A category tombstone follows ADR 0003 and cannot silently resurrect an older deleted record or erase a newer edit without that review.

Unresolved conflicts remain visible in sync status but do not block unrelated records from completing synchronization.

### Offline queue and retries

Local mutations remain usable offline. The encrypted local outbox retries transient failures with bounded exponential backoff and exposes a manual retry action after the retry limit. Idempotency keys ensure replayed requests cannot create duplicate records or apply a mutation twice.

Authentication failures pause the outbox until the user re-authenticates. Permanent validation or authorization failures move the change to a recoverable error state without dropping it.

### Sync states and account transitions

Expose these product-level states: `idle`, `syncing`, `synced`, `offline`, `stale`, `conflicted`, and `error`. Each state includes a non-sensitive reason and the next available action.

Signed-in outboxes and cursors are account-scoped. Signing out stops sync and follows ADR 0004 cache-clearing rules. Signing in to another account starts from that account’s namespace and cannot reuse the previous account’s outbox or cursor.

## Consequences

- Local-first edits remain available offline while cloud changes converge safely.
- The backend must support record revisions, idempotent delta writes, cursors, conflict responses, and durable tombstone handling.
- Conflict resolution adds explicit UI while allowing unrelated records to sync.
- Duplicate candidates are preserved and reviewed separately from sync completion.
- Sync metadata, outbox contents, and conflict payloads are sensitive and must not be sent to analytics or written to logs with financial content.

## Validation

- First sync with local-only, cloud-only, and overlapping records preserves both datasets.
- Record-level deltas, cursors, acknowledgments, and idempotency prevent duplicate application.
- Multiple offline edits coalesce without losing the latest state or original conflict base revision.
- Revision mismatches produce conflicts instead of overwrites.
- Local/cloud choices create new revisions and clear the conflict.
- Delete-versus-edit conflicts require review.
- Unrelated records complete during partial sync.
- Duplicate category candidates remain distinct and non-blocking.
- Offline queues survive reload, retry after reconnect, and expose manual retry after bounded backoff.
- Authentication failures, authorization failures, stale cursors, and permanent validation errors expose distinct states.
- Account switching cannot reuse another account’s cache, outbox, or cursor.
- Tombstones prevent deleted records from reappearing.
- No sensitive financial content appears in analytics or logs.
