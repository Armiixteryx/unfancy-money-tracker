import { describe, expect, it } from "vitest";

import { createEmptyDataset, DatasetPersistence, hydrateDataset } from "./datasetPersistence";
import { MemoryPersistenceAdapter } from "./memoryPersistenceAdapter";
import { migrateSnapshot } from "./migrations";

const now = "2026-07-11T12:00:00.000Z";
const idFactory = (() => {
  let count = 0;
  return () => `00000000-0000-4000-8000-0000000000${String(++count).padStart(2, "0")}`;
})();

describe("dataset persistence", () => {
  it("hydrates a missing snapshot into an empty anonymous dataset", async () => {
    const result = await hydrateDataset(new MemoryPersistenceAdapter());

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.dataset.transactions).toEqual([]);
      expect(result.dataset.categories).toHaveLength(12);
      expect(result.dataset.preferences.analyticsConsent).toBe(false);
      expect(result.dataset.preferences.firstRunNoticeDismissed).toBe(false);
      expect(result.dataset.preferences.selectedCurrencies).toEqual(["USD"]);
    }
  });

  it("writes validated snapshots and reconstructs them", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const persistence = new DatasetPersistence(adapter);
    const dataset = createEmptyDataset(idFactory, now);

    await persistence.save(dataset);
    const result = await persistence.hydrate();

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.dataset.datasetId).toBe(dataset.datasetId);
      expect(result.dataset.categories.map((category) => category.id)).toEqual(dataset.categories.map((category) => category.id));
    }
  });

  it("quarantines malformed snapshots and exposes recovery state", async () => {
    const adapter = new MemoryPersistenceAdapter("not-json");
    const result = await hydrateDataset(adapter);

    expect(result).toEqual({ status: "recovery", errorCode: "snapshot_unreadable", backupAvailable: true });
    expect(adapter.quarantinedSnapshots).toEqual(["not-json"]);
    expect(await adapter.readRecoverySnapshot()).toBe("not-json");
  });

  it("restores a quarantined snapshot without silently replacing it", async () => {
    const adapter = new MemoryPersistenceAdapter("not-json");
    await hydrateDataset(adapter);
    await adapter.restoreRecoverySnapshot();
    expect(await adapter.readSnapshot()).toBe("not-json");
  });

  it("keeps one migration backup before an older envelope is migrated", async () => {
    const adapter = new MemoryPersistenceAdapter(JSON.stringify({ schemaVersion: 0, datasetId: "00000000-0000-4000-8000-000000000099" }));
    const result = await hydrateDataset(adapter);
    expect(result.status).toBe("ready");
    expect(adapter.migrationBackups).toHaveLength(1);
  });

  it("migrates an older envelope without dropping existing records", () => {
    const legacy = {
      schemaVersion: 0,
      datasetId: "00000000-0000-4000-8000-000000000099",
      transactions: [],
      categories: [],
      budgets: [],
      recordTombstones: []
    };
    const migrated = migrateSnapshot(legacy, () => "00000000-0000-4000-8000-000000000098");

    expect(migrated.schemaVersion).toBe(7);
    expect(migrated.datasetId).toBe(legacy.datasetId);
    expect(migrated.preferences.baseCurrency).toBe("USD");
    expect(migrated).not.toHaveProperty("recordTombstones");
    expect(migrated).not.toHaveProperty("sync");
  });

  it("migrates a v2 envelope to v7 while preserving active data, category tombstones, and selected currencies", () => {
    const categoryId = "00000000-0000-4000-8000-000000000001";
    const transactionId = "00000000-0000-4000-8000-000000000002";
    const budgetId = "00000000-0000-4000-8000-000000000003";
    const deletedCategoryId = "00000000-0000-4000-8000-000000000004";
    const timestamp = "2026-07-11T12:00:00.000Z";
    const migrated = migrateSnapshot({
      schemaVersion: 2,
      datasetId: "00000000-0000-4000-8000-000000000099",
      transactions: [
        { id: transactionId, amount: "10", currency: "USD", type: "expense", categoryId, description: "Legacy record", date: "2026-07-11", createdAt: timestamp, updatedAt: timestamp },
        { id: "00000000-0000-4000-8000-000000000006", amount: "12", currency: "GBP", type: "income", categoryId, description: "Legacy income", date: "2026-07-11", createdAt: timestamp, updatedAt: timestamp }
      ],
      categories: [{ id: categoryId, kind: "expense", name: "Food", isSystem: false, isArchived: false, createdAt: timestamp, updatedAt: timestamp }],
      budgets: [{ id: budgetId, categoryId, month: "2026-07", amount: "25", currency: "EUR", createdAt: timestamp, updatedAt: timestamp }],
      categoryDeletionTombstones: [{ recordType: "category", recordId: deletedCategoryId, deletedAt: timestamp }],
      recordTombstones: [{ recordType: "budget", recordId: budgetId, deletedAt: timestamp }, { recordType: "category", recordId: deletedCategoryId, deletedAt: timestamp }],
      preferences: { baseCurrency: "EUR", theme: "dark", analyticsConsent: true },
      sync: { status: "stale", inboxCursor: "7", outbox: [{ idempotencyKey: "00000000-0000-4000-8000-000000000005", recordType: "transaction", recordId: transactionId, operation: "upsert", baseRevision: 0, revision: 1, payload: null, tombstone: false }], conflicts: [], revisions: { [`transaction:${transactionId}`]: 1 }, lastSyncedAt: timestamp, reason: "legacy" }
    });

    expect(migrated.schemaVersion).toBe(7);
    expect(migrated.datasetId).toBe("00000000-0000-4000-8000-000000000099");
    expect(migrated.preferences).toEqual({ language: "system", baseCurrency: "EUR", selectedCurrencies: ["USD", "EUR", "GBP"], theme: "dark", analyticsConsent: true, firstRunNoticeDismissed: false });
    expect(migrated.transactions[0]?.id).toBe(transactionId);
    expect(migrated.categories[0]?.id).toBe(categoryId);
    expect(migrated.budgets[0]?.id).toBe(budgetId);
    expect(migrated.categoryDeletionTombstones).toEqual([{ recordType: "category", recordId: deletedCategoryId, deletedAt: timestamp }]);
    expect(migrated).not.toHaveProperty("recordTombstones");
    expect(migrated).not.toHaveProperty("sync");
  });
});

it("orders reset after in-flight writes so stale records cannot reappear", async () => {
  const adapter = new MemoryPersistenceAdapter();
  const persistence = new DatasetPersistence(adapter);
  let finish: () => void = () => undefined;
  const originalWrite=adapter.writeSnapshot.bind(adapter);
  adapter.writeSnapshot=async(snapshot)=>{await new Promise<void>(resolve=>{finish=resolve;});await originalWrite(snapshot);};
  const save=persistence.save(createEmptyDataset());
  await Promise.resolve();await Promise.resolve();
  const reset=persistence.reset();
  finish();await save;await reset;
  expect(await adapter.readSnapshot()).toBeNull();
});
