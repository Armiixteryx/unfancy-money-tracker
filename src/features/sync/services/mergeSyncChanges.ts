import { findUncategorizedCategory } from "../../../domain/categories";
import type { Budget, Dataset, RecordTombstone, SyncConflict as LocalSyncConflict } from "../../../domain/types";
import { categorySchema, budgetSchema, preferencesSchema, transactionSchema } from "../../../platform/persistence/schema";
import type { AcknowledgedChange, SyncChange, SyncConflict } from "../../../platform/sync/types";

export type MergeResult = {
  dataset: Dataset;
  conflicts: readonly LocalSyncConflict[];
  invalidChangeCount: number;
};

export function mergeSyncChanges(
  dataset: Dataset,
  pulledChanges: readonly SyncChange[],
  acknowledgedIds: ReadonlySet<string>,
  serverConflicts: readonly SyncConflict[],
  acknowledgedChanges: readonly AcknowledgedChange[] = []
): MergeResult {
  let next = dataset;
  let invalidChangeCount = 0;
  const pending = new Map(next.sync.outbox.map((change) => [`${change.recordType}:${change.recordId}`, change]));
  const localConflicts = [...next.sync.conflicts];
  const revisions = { ...next.sync.revisions };

  for (const acknowledged of acknowledgedChanges) {
    const key = `${acknowledged.recordType}:${acknowledged.recordId}`;
    revisions[key] = Math.max(revisions[key] ?? 0, acknowledged.revision);
  }

  for (const conflict of serverConflicts) {
    const key = `${conflict.recordType}:${conflict.recordId}`;
    if (!localConflicts.some((candidate) => `${candidate.recordType}:${candidate.recordId}` === key)) {
      localConflicts.push({ ...conflict, localPayload: conflict.localPayload, cloudPayload: conflict.cloudPayload });
    }
  }

  for (const change of pulledChanges) {
    if (acknowledgedIds.has(change.idempotencyKey)) {
      revisions[`${change.recordType}:${change.recordId}`] = Math.max(revisions[`${change.recordType}:${change.recordId}`] ?? 0, change.revision);
      continue;
    }
    const key = `${change.recordType}:${change.recordId}`;
    const pendingChange = pending.get(key);
    if (pendingChange && !serverConflicts.some((conflict) => `${conflict.recordType}:${conflict.recordId}` === key)) {
      if (!localConflicts.some((conflict) => `${conflict.recordType}:${conflict.recordId}` === key)) {
        localConflicts.push({ recordType: change.recordType, recordId: change.recordId, localRevision: pendingChange.revision, cloudRevision: change.revision, localPayload: pendingChange.payload, cloudPayload: change.payload, resolution: "pending" });
      }
      continue;
    }

    if (change.operation === "delete" || change.tombstone) {
      next = applyDelete(next, change);
      revisions[key] = change.revision;
      continue;
    }

    const applied = applyUpsert(next, change.recordType, change.payload);
    if (!applied) {
      invalidChangeCount += 1;
      continue;
    }
    next = applied;
    revisions[key] = change.revision;
  }

  const acknowledged = new Set(acknowledgedIds);
  const remainingOutbox = next.sync.outbox.filter((change) => !acknowledged.has(change.idempotencyKey));
  next = {
    ...next,
    sync: {
      ...next.sync,
      outbox: remainingOutbox,
      conflicts: localConflicts,
      revisions,
      status: localConflicts.length > 0 ? "conflicted" : remainingOutbox.length > 0 ? "stale" : "synced",
      reason: invalidChangeCount > 0 ? "Some cloud changes could not be validated." : localConflicts.length > 0 ? "Cloud changes need review before they can be applied." : next.sync.reason
    }
  };
  return { dataset: next, conflicts: localConflicts, invalidChangeCount };
}

function applyUpsert(dataset: Dataset, recordType: SyncChange["recordType"], rawPayload: unknown | null): Dataset | null {
  if (rawPayload === null) return null;
  if (recordType === "transaction") {
    const parsed = transactionSchema.safeParse(rawPayload);
    return parsed.success ? { ...dataset, transactions: replaceOrAppend(dataset.transactions, parsed.data) } : null;
  }
  if (recordType === "category") {
    const parsed = categorySchema.safeParse(rawPayload);
    return parsed.success ? { ...dataset, categories: replaceOrAppend(dataset.categories, parsed.data) } : null;
  }
  if (recordType === "budget") {
    const parsed = budgetSchema.safeParse(rawPayload);
    return parsed.success ? { ...dataset, budgets: replaceOrAppend(dataset.budgets, parsed.data as Budget) } : null;
  }
  const parsed = preferencesSchema.safeParse(rawPayload);
  return parsed.success ? { ...dataset, preferences: parsed.data } : null;
}

function applyDelete(dataset: Dataset, change: SyncChange): Dataset {
  const tombstone: RecordTombstone = { recordType: change.recordType, recordId: change.recordId, deletedAt: new Date().toISOString() };
  if (change.recordType === "transaction") return addTombstone({ ...dataset, transactions: dataset.transactions.filter((transaction) => transaction.id !== change.recordId) }, tombstone);
  if (change.recordType === "budget") return addTombstone({ ...dataset, budgets: dataset.budgets.filter((budget) => budget.id !== change.recordId) }, tombstone);
  if (change.recordType === "preference") return dataset;
  const category = dataset.categories.find((candidate) => candidate.id === change.recordId);
  if (!category) return addTombstone(dataset, tombstone);
  const fallback = findUncategorizedCategory(dataset.categories, category.kind);
  const budgets: readonly Budget[] = dataset.budgets.map((budget): Budget => budget.categoryId === change.recordId ? { ...budget, categoryId: fallback.id } : budget);
  return addTombstone({
    ...dataset,
    categories: dataset.categories.filter((candidate) => candidate.id !== change.recordId),
    transactions: dataset.transactions.map((transaction) => transaction.categoryId === change.recordId ? { ...transaction, categoryId: fallback.id } : transaction),
    budgets,
    categoryDeletionTombstones: [...dataset.categoryDeletionTombstones, tombstone]
  }, tombstone);
}

function addTombstone(dataset: Dataset, tombstone: RecordTombstone): Dataset {
  if (dataset.recordTombstones.some((candidate) => candidate.recordType === tombstone.recordType && candidate.recordId === tombstone.recordId)) return dataset;
  return { ...dataset, recordTombstones: [...dataset.recordTombstones, tombstone] };
}

function replaceOrAppend<T extends { id: string }>(records: readonly T[], payload: T): readonly T[] {
  return records.some((record) => record.id === payload.id) ? records.map((record) => record.id === payload.id ? payload : record) : [...records, payload];
}
