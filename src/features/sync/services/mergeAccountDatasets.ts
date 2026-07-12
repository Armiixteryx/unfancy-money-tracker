import type { Dataset, SyncConflict } from "../../../domain/types";

export function mergeAccountDatasets(local: Dataset, account: Dataset): Dataset {
  const conflicts: SyncConflict[] = [...account.sync.conflicts];
  const transactions = mergeRecords(local.transactions, account.transactions, "transaction", local, account, conflicts);
  const categories = mergeRecords(local.categories, account.categories, "category", local, account, conflicts);
  const budgets = mergeRecords(local.budgets, account.budgets, "budget", local, account, conflicts);
  if (JSON.stringify(local.preferences) !== JSON.stringify(account.preferences)) {
    conflicts.push({ recordType: "preference", recordId: account.datasetId, localRevision: local.sync.revisions[`preference:${account.datasetId}`] ?? 0, cloudRevision: account.sync.revisions[`preference:${account.datasetId}`] ?? 0, localPayload: local.preferences, cloudPayload: account.preferences, resolution: "pending" });
  }
  const syncConflicts = dedupeConflicts(conflicts);
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
      outbox: mergeOutbox(local.sync.outbox, account.sync.outbox),
      conflicts: syncConflicts,
      revisions: { ...account.sync.revisions, ...local.sync.revisions },
      status: syncConflicts.length > 0 ? "conflicted" : account.sync.status
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
