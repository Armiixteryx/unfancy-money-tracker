import { v4 as uuid } from "uuid";

import type { Dataset, RecordTombstone } from "../../../domain/types";
import type { PushResponse, SyncChange, SyncClient } from "../../../platform/sync/types";

export type InitialSyncResult = {
  push: PushResponse;
  pulledChangeCount: number;
  cursor: string;
};

export async function syncLocalDataset(dataset: Dataset, client: SyncClient): Promise<InitialSyncResult> {
  const changes = buildInitialSyncChanges(dataset);
  const pushResponses: PushResponse[] = [];
  for (let index = 0; index < changes.length || index === 0; index += 100) {
    const batch = changes.slice(index, index + 100);
    pushResponses.push(await client.push({ datasetId: dataset.datasetId, changes: batch }));
    if (changes.length === 0) break;
  }

  const pull = await client.pull({ datasetId: dataset.datasetId, cursor: dataset.sync.inboxCursor ?? "0" });
  return {
    push: {
      acknowledged: pushResponses.flatMap((response) => response.acknowledged),
      conflicts: pushResponses.flatMap((response) => response.conflicts),
      cursor: pushResponses.at(-1)?.cursor ?? dataset.sync.inboxCursor ?? "0"
    },
    pulledChangeCount: pull.changes.length,
    cursor: pull.cursor
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
  return { idempotencyKey: uuid(), recordType, recordId, operation: "upsert", baseRevision: 0, payload, tombstone: false };
}

function tombstoneChange(tombstone: RecordTombstone): SyncChange {
  return { idempotencyKey: uuid(), recordType: tombstone.recordType, recordId: tombstone.recordId, operation: "delete", baseRevision: 0, payload: null, tombstone: true };
}
