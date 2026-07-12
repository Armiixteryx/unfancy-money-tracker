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

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.datasetId).toBe(legacy.datasetId);
    expect(migrated.preferences.baseCurrency).toBe("USD");
    expect(migrated.sync.outbox).toEqual([]);
    expect(migrated.sync.revisions).toEqual({});
  });
});
