import type { Dataset, SyncChange, SyncConflict } from "../../../domain/types";
import { createUuid } from "../../../platform/identifiers/createUuid";

export function mergeAccountDatasets(local: Dataset, account: Dataset): Dataset {
  const conflicts: SyncConflict[] = [...account.sync.conflicts];
  const transactions = mergeRecords(local.transactions, account.transactions, "transaction", local, account, conflicts);
  const categories = mergeRecords(local.categories, account.categories, "category", local, account, conflicts);
  const budgets = mergeRecords(local.budgets, account.budgets, "budget", local, account, conflicts);
  if (JSON.stringify(local.preferences) !== JSON.stringify(account.preferences)) {
    conflicts.push({ recordType: "preference", recordId: account.datasetId, localRevision: local.sync.revisions[`preference:${account.datasetId}`] ?? 0, cloudRevision: account.sync.revisions[`preference:${account.datasetId}`] ?? 0, localPayload: local.preferences, cloudPayload: account.preferences, resolution: "pending" });
  }
  const syncConflicts = dedupeConflicts(conflicts);
  const outbox = queueTransferredLocalRecords(local, account, mergeOutbox(local.sync.outbox, account.sync.outbox));
  return {
    ...local,
    datasetId: account.datasetId,
    transactions,
    categories,
    budgets,
    categoryDeletionTombstones: mergeTombstones(local.categoryDeletionTombstones, account.categoryDeletionTombstones),
    recordTombstones: mergeTombstones(local.recordTombstones, account.recordTombstones),
    sync: {
      ...account.sync,
      outbox,
      conflicts: syncConflicts,
      revisions: { ...account.sync.revisions, ...local.sync.revisions },
      status: syncConflicts.length > 0 ? "conflicted" : outbox.length > 0 ? "stale" : account.sync.status,
      reason: syncConflicts.length > 0
        ? "Cloud changes need review before they can be applied."
        : outbox.length > 0
          ? "Local changes are waiting for optional cloud sync."
          : account.sync.reason
    }
  };
}

function mergeRecords<T extends { id: string }>(local: readonly T[], account: readonly T[], recordType: "transaction" | "category" | "budget", localDataset: Dataset, accountDataset: Dataset, conflicts: SyncConflict[]): readonly T[] {
  const merged = [...local];
  for (const cloudRecord of account) {
    const localRecord = local.find((record) => record.id === cloudRecord.id);
    if (!localRecord) {
      merged.push(cloudRecord);
      continue;
    }
    if (JSON.stringify(localRecord) !== JSON.stringify(cloudRecord)) {
      conflicts.push({ recordType, recordId: cloudRecord.id, localRevision: localDataset.sync.revisions[`${recordType}:${cloudRecord.id}`] ?? 0, cloudRevision: accountDataset.sync.revisions[`${recordType}:${cloudRecord.id}`] ?? 0, localPayload: localRecord, cloudPayload: cloudRecord, resolution: "pending" });
    }
  }
  return merged;
}

function mergeOutbox(local: Dataset["sync"]["outbox"], account: Dataset["sync"]["outbox"]): Dataset["sync"]["outbox"] {
  const merged = [...local];
  for (const cloudChange of account) {
    if (!merged.some((change) => change.recordType === cloudChange.recordType && change.recordId === cloudChange.recordId)) merged.push(cloudChange);
  }
  return merged;
}

function queueTransferredLocalRecords(local: Dataset, account: Dataset, outbox: Dataset["sync"]["outbox"]): Dataset["sync"]["outbox"] {
  let next = [...outbox];
  const queue = (change: Omit<SyncChange, "idempotencyKey" | "baseRevision" | "revision">) => {
    if (next.some((candidate) => candidate.recordType === change.recordType && candidate.recordId === change.recordId)) return;
    next.push({ ...change, idempotencyKey: createUuid(), baseRevision: 0, revision: 1 });
  };

  for (const transaction of local.transactions) {
    if (!account.transactions.some((candidate) => candidate.id === transaction.id)) {
      queue({ recordType: "transaction", recordId: transaction.id, operation: "upsert", payload: transaction, tombstone: false });
    }
  }
  for (const category of local.categories) {
    if (!account.categories.some((candidate) => candidate.id === category.id)) {
      queue({ recordType: "category", recordId: category.id, operation: "upsert", payload: category, tombstone: false });
    }
  }
  for (const budget of local.budgets) {
    if (!account.budgets.some((candidate) => candidate.id === budget.id)) {
      queue({ recordType: "budget", recordId: budget.id, operation: "upsert", payload: budget, tombstone: false });
    }
  }
  for (const tombstone of local.recordTombstones) {
    if (!account.recordTombstones.some((candidate) => candidate.recordType === tombstone.recordType && candidate.recordId === tombstone.recordId)) {
      queue({ recordType: tombstone.recordType, recordId: tombstone.recordId, operation: "delete", payload: null, tombstone: true });
    }
  }
  const preferenceKey = `preference:${account.datasetId}`;
  if (!account.sync.revisions[preferenceKey] && JSON.stringify(local.preferences) === JSON.stringify(account.preferences)) {
    queue({ recordType: "preference", recordId: account.datasetId, operation: "upsert", payload: local.preferences, tombstone: false });
  }
  return next;
}

function mergeTombstones<T extends { recordType: string; recordId: string }>(local: readonly T[], account: readonly T[]): readonly T[] {
  const merged = [...local];
  for (const tombstone of account) if (!merged.some((candidate) => candidate.recordType === tombstone.recordType && candidate.recordId === tombstone.recordId)) merged.push(tombstone);
  return merged;
}

function dedupeConflicts(conflicts: readonly SyncConflict[]): readonly SyncConflict[] {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = `${conflict.recordType}:${conflict.recordId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
