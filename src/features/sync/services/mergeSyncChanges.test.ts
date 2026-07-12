import { describe, expect, it } from "vitest";

import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { mergeSyncChanges } from "./mergeSyncChanges";

const categoryId = "00000000-0000-4000-8000-000000000002";
const transactionId = "00000000-0000-4000-8000-000000000003";

describe("mergeSyncChanges", () => {
  it("applies validated remote records and records their revision", () => {
    const dataset = createEmptyDataset(() => categoryId, "2026-07-11T00:00:00.000Z");
    const category = dataset.categories.find((candidate) => candidate.kind === "expense" && !candidate.isSystem);
    expect(category).toBeDefined();
    if (!category) return;
    const result = mergeSyncChanges(dataset, [{ idempotencyKey: "00000000-0000-4000-8000-000000000004", recordType: "transaction", recordId: transactionId, operation: "upsert", baseRevision: 0, revision: 4, tombstone: false, payload: { id: transactionId, amount: "12", currency: "USD", type: "expense", categoryId: category.id, description: "Remote record", date: "2026-07-11", createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z" } }], new Set(), []);
    expect(result.invalidChangeCount).toBe(0);
    expect(result.dataset.transactions).toHaveLength(1);
    expect(result.dataset.sync.revisions[`transaction:${transactionId}`]).toBe(4);
  });

  it("keeps local pending data and exposes a same-record conflict", () => {
    const dataset = createEmptyDataset(() => categoryId, "2026-07-11T00:00:00.000Z");
    const category = dataset.categories.find((candidate) => candidate.kind === "expense" && !candidate.isSystem);
    expect(category).toBeDefined();
    if (!category) return;
    const localPayload = { id: transactionId, amount: "12", currency: "USD", type: "expense" as const, categoryId: category.id, description: "Local record", date: "2026-07-11", createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z" };
    const pendingDataset = { ...dataset, sync: { ...dataset.sync, outbox: [{ idempotencyKey: "00000000-0000-4000-8000-000000000005", recordType: "transaction" as const, recordId: transactionId, operation: "upsert" as const, baseRevision: 0, revision: 1, payload: localPayload, tombstone: false }] } };
    const result = mergeSyncChanges(pendingDataset, [{ idempotencyKey: "00000000-0000-4000-8000-000000000006", recordType: "transaction", recordId: transactionId, operation: "upsert", baseRevision: 1, revision: 2, tombstone: false, payload: { ...localPayload, description: "Cloud record" } }], new Set(), []);
    expect(result.dataset.transactions).toHaveLength(0);
    expect(result.conflicts[0]?.localPayload).toEqual(localPayload);
    expect(result.conflicts[0]?.cloudPayload).toMatchObject({ description: "Cloud record" });
  });
});
