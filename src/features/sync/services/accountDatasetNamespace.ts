import { v5 as uuid } from "uuid";

import type { Dataset } from "../../../domain/types";

const ACCOUNT_DATASET_NAMESPACE = "9b74e9b6-7b7c-4e42-a50d-a4f740ddf82f";

export function getAccountDatasetId(accountId: string): string {
  return uuid(accountId, ACCOUNT_DATASET_NAMESPACE);
}

export function scopeDatasetToAccount(dataset: Dataset, accountId: string): Dataset {
  const previousDatasetId = dataset.datasetId;
  const datasetId = getAccountDatasetId(accountId);
  if (previousDatasetId === datasetId) return dataset;

  return {
    ...dataset,
    datasetId,
    recordTombstones: dataset.recordTombstones.map((tombstone) =>
      tombstone.recordType === "preference" && tombstone.recordId === previousDatasetId
        ? { ...tombstone, recordId: datasetId }
        : tombstone
    ),
    sync: {
      ...dataset.sync,
      outbox: dataset.sync.outbox.map((change) =>
        change.recordType === "preference" && change.recordId === previousDatasetId
          ? { ...change, recordId: datasetId, baseRevision: 0, revision: 1 }
          : { ...change, baseRevision: 0, revision: 1 }
      ),
      conflicts: dataset.sync.conflicts.map((conflict) =>
        conflict.recordType === "preference" && conflict.recordId === previousDatasetId
          ? { ...conflict, recordId: datasetId }
          : conflict
      ),
      status: dataset.sync.outbox.length > 0 ? "stale" : "idle",
      inboxCursor: null,
      revisions: {},
      lastSyncedAt: null,
      reason: dataset.sync.outbox.length > 0 ? "Local changes are waiting for optional cloud sync." : null
    }
  };
}
