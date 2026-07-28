import type { Dataset, RecordTombstone, SyncChange as LocalSyncChange } from "../../../domain/types";
import type { AcknowledgedChange, PullResponse, PushResponse, SyncChange, SyncClient } from "../../../platform/sync/types";
import { createUuid } from "../../../platform/identifiers/createUuid";
import { SyncClientError } from "../../../platform/sync/types";

export type InitialSyncResult = {
  push: PushResponse;
  pulledChangeCount: number;
  cursor: string;
  pulledChanges: readonly SyncChange[];
  acknowledgedChanges: readonly AcknowledgedChange[];
};

export async function syncLocalDataset(dataset: Dataset, client: SyncClient): Promise<InitialSyncResult> {
  const initialSync = dataset.sync.lastSyncedAt === null;
  const initialChanges = buildInitialSyncChanges(dataset);
  const pendingKeys = new Set(dataset.sync.outbox.map((change) => `${change.recordType}:${change.recordId}`));
  const firstPull: PullResponse | null = initialSync ? await client.pull({ datasetId: dataset.datasetId, cursor: dataset.sync.inboxCursor ?? "0" }) : null;
  const skipPristineSnapshot = (firstPull?.changes.length ?? 0) > 0 && isPristineDataset(dataset);
  const changes = initialSync
    ? [...dataset.sync.outbox.map(toTransportChange), ...(skipPristineSnapshot ? [] : initialChanges.filter((change) => !pendingKeys.has(`${change.recordType}:${change.recordId}`)))]
    : dataset.sync.outbox.map(toTransportChange);
  const pushResponses: PushResponse[] = [];
  for (let index = 0; index < changes.length || index === 0; index += 100) {
    const batch = changes.slice(index, index + 100);
    pushResponses.push(await client.push({ datasetId: dataset.datasetId, changes: batch }));
    if (changes.length === 0) break;
  }
  assertAllChangesHandled(changes, pushResponses);

  const pull = await client.pull({ datasetId: dataset.datasetId, cursor: firstPull?.cursor ?? dataset.sync.inboxCursor ?? "0" });
  const pulledChanges = [...(firstPull?.changes ?? []), ...pull.changes];
  return {
    push: {
      acknowledged: pushResponses.flatMap((response) => response.acknowledged),
      acknowledgedChanges: pushResponses.flatMap((response) => response.acknowledgedChanges),
      conflicts: pushResponses.flatMap((response) => response.conflicts),
      cursor: pushResponses.at(-1)?.cursor ?? dataset.sync.inboxCursor ?? "0"
    },
    pulledChangeCount: pulledChanges.length,
    cursor: pull.cursor,
    pulledChanges,
    acknowledgedChanges: pushResponses.flatMap((response) => response.acknowledgedChanges)
  };
}

function assertAllChangesHandled(changes: readonly SyncChange[], responses: readonly PushResponse[]): void {
  const acknowledged = new Set(responses.flatMap((response) => response.acknowledged));
  const conflicts = new Set(responses.flatMap((response) => response.conflicts.map((conflict) => `${conflict.recordType}:${conflict.recordId}`)));
  const missing = changes.some((change) => !acknowledged.has(change.idempotencyKey) && !conflicts.has(`${change.recordType}:${change.recordId}`));
  if (missing) throw new SyncClientError("incomplete_sync", "The sync service did not confirm every local change.");
}

const DEFAULT_CATEGORY_SIGNATURES = new Set([
  "income:Uncategorized:true", "expense:Uncategorized:true", "income:Income:false",
  "expense:Food:false", "expense:Housing:false", "expense:Transport:false", "expense:Shopping:false",
  "expense:Utilities:false", "expense:Entertainment:false", "expense:Health:false",
  "expense:Education:false", "expense:Subscriptions:false"
]);

function isPristineDataset(dataset: Dataset): boolean {
  return dataset.transactions.length === 0
    && dataset.budgets.length === 0
    && dataset.recordTombstones.length === 0
    && dataset.categoryDeletionTombstones.length === 0
    && dataset.sync.outbox.length === 0
    && dataset.categories.length === DEFAULT_CATEGORY_SIGNATURES.size
    && dataset.categories.every((category) => !category.isArchived && DEFAULT_CATEGORY_SIGNATURES.has(`${category.kind}:${category.name}:${category.isSystem}`));
}

export type SyncRetryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

export async function syncLocalDatasetWithRetry(dataset: Dataset, client: SyncClient, options: SyncRetryOptions = {}): Promise<InitialSyncResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  let attempt = 0;
  while (true) {
    try {
      return await syncLocalDataset(dataset, client);
    } catch (error) {
      attempt += 1;
      const retryable = error instanceof SyncClientError && (error.code === "offline" || error.code === "server_error");
      if (!retryable || attempt >= maxAttempts) throw error;
      await sleep(initialDelayMs * 2 ** (attempt - 1));
    }
  }
}

export function buildInitialSyncChanges(dataset: Dataset): SyncChange[] {
  const changes: SyncChange[] = [
    ...dataset.transactions.map((record) => upsert("transaction", record.id, record)),
    ...dataset.categories.map((record) => upsert("category", record.id, record)),
    ...dataset.budgets.map((record) => upsert("budget", record.id, record)),
    upsert("preference", dataset.datasetId, dataset.preferences),
    ...dataset.recordTombstones.map((tombstone) => tombstoneChange(tombstone))
  ];
  return changes;
}

function upsert(recordType: SyncChange["recordType"], recordId: string, payload: unknown): SyncChange {
  return { idempotencyKey: createUuid(), recordType, recordId, operation: "upsert", baseRevision: 0, payload, tombstone: false, revision: 1 };
}

function tombstoneChange(tombstone: RecordTombstone): SyncChange {
  return { idempotencyKey: createUuid(), recordType: tombstone.recordType, recordId: tombstone.recordId, operation: "delete", baseRevision: 0, payload: null, tombstone: true, revision: 1 };
}

function toTransportChange(change: LocalSyncChange): SyncChange {
  return { ...change };
}
