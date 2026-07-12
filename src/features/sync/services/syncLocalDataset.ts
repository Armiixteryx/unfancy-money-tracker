import type { Dataset, RecordTombstone, SyncChange as LocalSyncChange } from "../../../domain/types";
import type { AcknowledgedChange, PullResponse, PushResponse, SyncChange, SyncClient } from "../../../platform/sync/types";
import { createUuid } from "../../../platform/identifiers/createUuid";

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
  const changes = initialSync
    ? [...dataset.sync.outbox.map(toTransportChange), ...initialChanges.filter((change) => !pendingKeys.has(`${change.recordType}:${change.recordId}`))]
    : dataset.sync.outbox.map(toTransportChange);
  const pushResponses: PushResponse[] = [];
  const firstPull: PullResponse | null = initialSync ? await client.pull({ datasetId: dataset.datasetId, cursor: dataset.sync.inboxCursor ?? "0" }) : null;
  for (let index = 0; index < changes.length || index === 0; index += 100) {
    const batch = changes.slice(index, index + 100);
    pushResponses.push(await client.push({ datasetId: dataset.datasetId, changes: batch }));
    if (changes.length === 0) break;
  }

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
