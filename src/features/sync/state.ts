import { z } from "zod";
import {
  syncChangeSchema,
  syncConflictSchema,
  syncedPreferencesSchema,
  type SyncChange,
  type SyncRecordType,
} from "../../server/contracts/sync";
import type { Dataset } from "../../domain/types";
import { createUuid } from "../../platform/identifiers/createUuid";

export const outboxEntrySchema = z.object({
  change: syncChangeSchema,
  submitted: z.boolean(),
  resolution: z
    .object({
      conflict: syncConflictSchema,
      choice: z.enum(["keep_local", "keep_cloud"]),
    })
    .optional(),
  rejection: z.enum(["permission_denied", "tracker_archived"]).optional(),
});
export const syncStateSchema = z.object({
  binding: z
    .object({ owner: z.string().min(1), datasetId: z.string().uuid() })
    .nullable(),
  enabled: z.boolean(),
  cursor: z.string().regex(/^\d+$/),
  revisions: z.record(z.string(), z.number().int().nonnegative()),
  outbox: z.array(outboxEntrySchema),
  conflicts: z.array(syncConflictSchema),
  lastSyncedAt: z.string().datetime().nullable(),
});
export type SyncState = z.infer<typeof syncStateSchema>;
export type OutboxEntry = z.infer<typeof outboxEntrySchema>;
export function emptySyncState(): SyncState {
  return {
    binding: null,
    enabled: false,
    cursor: "0",
    revisions: {},
    outbox: [],
    conflicts: [],
    lastSyncedAt: null,
  };
}
export const recordKey = (type: SyncRecordType, id: string) => `${type}:${id}`;
export function syncState(dataset: Dataset): SyncState {
  return dataset.sync ?? emptySyncState();
}
export function records(
  dataset: Dataset,
): Map<string, { type: SyncRecordType; id: string; payload: unknown }> {
  const map = new Map<
    string,
    { type: SyncRecordType; id: string; payload: unknown }
  >();
  for (const [type, values] of [
    ["category", dataset.categories],
    ["transaction", dataset.transactions],
    ["budget", dataset.budgets],
  ] as const) {
    for (const value of values) {
      const payload = type === "transaction"
        ? (({ creator: _creator, ...financialRecord }) => financialRecord)(value as Dataset["transactions"][number])
        : value;
      map.set(recordKey(type, value.id), {
        type,
        id: value.id,
        payload,
      });
    }
  }
  map.set("preference:currency", {
    type: "preference",
    id: "currency",
    payload: syncedPreferencesSchema.parse({
      baseCurrency: dataset.preferences.baseCurrency,
      selectedCurrencies: dataset.preferences.selectedCurrencies,
    }),
  });
  return map;
}
export function trackLocalChanges(
  previous: Dataset,
  next: Dataset,
  editedAt = new Date().toISOString(),
): Dataset {
  const state = syncState(previous);
  if (!state.binding) return next;
  const outbox = [...state.outbox];
  const before = records(previous);
  const after = records(next);
  const deletedCategories = new Set(
    previous.categories
      .filter(
        (category) =>
          !next.categories.some((value) => value.id === category.id),
      )
      .map((category) => category.id),
  );
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(key);
    const value = after.get(key);
    if (JSON.stringify(old?.payload) === JSON.stringify(value?.payload))
      continue;
    const entry = outbox.findIndex(
      (candidate) =>
        recordKey(candidate.change.recordType, candidate.change.recordId) ===
          key && !candidate.submitted,
    );
    const source = value ?? old!;
    if (
      old &&
      value &&
      (source.type === "transaction" || source.type === "budget") &&
      !outbox.some(
        (entry) =>
          recordKey(entry.change.recordType, entry.change.recordId) === key,
      )
    ) {
      const oldRecord = old.payload as {
        categoryId: string;
        updatedAt: string;
      };
      const newRecord = value.payload as {
        categoryId: string;
        updatedAt: string;
      };
      if (
        deletedCategories.has(oldRecord.categoryId) &&
        JSON.stringify({
          ...oldRecord,
          categoryId: newRecord.categoryId,
          updatedAt: newRecord.updatedAt,
        }) === JSON.stringify(newRecord)
      )
        continue;
    }
    const baseRevision =
      entry >= 0
        ? outbox[entry]!.change.baseRevision
        : (state.revisions[key] ?? 0);
    const change: SyncChange = {
      mutationId: createUuid(),
      recordType: source.type,
      recordId: source.id,
      operation: value ? "upsert" : "delete",
      baseRevision,
      payload: value?.payload ?? null,
      tombstone: !value,
      editedAt,
      revision: 0,
      committedAt: null,
    };
    if (entry >= 0) outbox[entry] = { change, submitted: false };
    else outbox.push({ change, submitted: false });
  }
  return { ...next, sync: { ...state, outbox } };
}
export function uploadAll(dataset: Dataset, state: SyncState): Dataset {
  const outbox: OutboxEntry[] = [];
  for (const { type, id, payload } of records(dataset).values())
    outbox.push({
      submitted: false,
      change: {
        mutationId: createUuid(),
        recordType: type,
        recordId: id,
        operation: "upsert",
        baseRevision: state.revisions[recordKey(type, id)] ?? 0,
        payload,
        tombstone: false,
        editedAt: new Date().toISOString(),
        revision: 0,
        committedAt: null,
      },
    });
  return { ...dataset, sync: { ...state, outbox } };
}
