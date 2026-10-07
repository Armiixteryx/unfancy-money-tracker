import { describe, expect, it, vi } from "vitest";

import { createCategory } from "../../domain/categories";
import { createTransaction } from "../../domain/transactions";
import { createBudget } from "../../domain/budgets";
import { createEmptyDataset, DatasetPersistence, hydrateDataset } from "./datasetPersistence";
import { MemoryPersistenceAdapter } from "./memoryPersistenceAdapter";
import { migrateSnapshot } from "./migrations";
import { emptySyncState } from "../../features/sync/state";
import { createUuid } from "../identifiers/createUuid";

it("migrates historical UUID built-ins to slugs while preserving custom IDs, records, and the backup", async () => {
  const dataset=createEmptyDataset();
  const food=dataset.categories.find(category => category.id==="expense-food")!;
  const oldFood="00000000-0000-4000-8000-000000000001";
  const custom={ ...createCategory({ kind:"expense",name:"Synthetic custom" }),id:"00000000-0000-4000-8000-000000000002" };
  const categories=[...dataset.categories.map(category => category.id===food.id ? { ...category,id:oldFood } : category),custom];
  const transaction={ ...createTransaction({ type:"expense",categoryId:oldFood,amount:"12.5",currency:"USD",description:"Synthetic preserved record",date:"2026-10-05" },{ categories }),id:"00000000-0000-4000-8000-000000000003" };
  const budget={ ...createBudget({ categoryId:oldFood,amount:"50",currency:"USD",month:"2026-10" },{ categories }),id:"00000000-0000-4000-8000-000000000004" };
  const raw={ ...dataset,schemaVersion:7,categories,transactions:[transaction],budgets:[budget] };
  const snapshot=JSON.stringify(raw);const adapter=new MemoryPersistenceAdapter(snapshot);
  const persistence=new DatasetPersistence(adapter);const hydrated=await persistence.hydrate();
  expect(hydrated.status).toBe("ready");if (hydrated.status!=="ready") throw new Error("Synthetic migration failed");
  expect(hydrated.dataset.categories.find(category => category.id===custom.id)).toEqual(custom);
  expect(hydrated.dataset.transactions).toEqual([{ ...transaction,categoryId:"expense-food" }]);
  expect(hydrated.dataset.budgets).toEqual([{ ...budget,categoryId:"expense-food" }]);
  expect(hydrated.dataset.sync).toMatchObject({ binding:null,enabled:false,outbox:[] });
  expect(adapter.migrationBackups).toEqual([snapshot]);
});

describe("schema 7 system categories", () => {
  it("promotes keyed defaults and reactivates archived defaults without changing record identity or reseeding", async () => {
    const original = createEmptyDataset();
    const food = original.categories.find(category => category.defaultCategoryKey === "food")!;
    const housing = original.categories.find(category => category.defaultCategoryKey === "housing")!;
    const renamed = original.categories.find(category => category.defaultCategoryKey === "transport")!;
    const legacy = createCategory({ kind: "expense", name: "Food" });
    const custom = createCategory({ kind: "income", name: "Synthetic custom" });
    const raw = {
      ...original,
      schemaVersion: 6,
      preferences: { ...original.preferences, language: "es" },
      categories: [
        ...original.categories.filter(category => category.id !== housing.id).map(category => ({
          ...category,
          isSystem: category.defaultCategoryKey === "uncategorized",
          defaultCategoryKey: category.id === renamed.id ? undefined : category.defaultCategoryKey,
          name: category.id === renamed.id ? "Synthetic renamed" : category.name,
          isArchived: category.id === food.id
        })),
        legacy,
        custom
      ],
      transactions: [createTransaction({ type: "expense", categoryId: food.id, amount: "12.5", currency: "USD", description: "Synthetic migration record", date: "2026-10-03" }, { categories: original.categories })],
      budgets: [createBudget({ categoryId: food.id, amount: "100", currency: "USD", month: "2026-10" }, { categories: original.categories })],
      categoryDeletionTombstones: [{ recordType: "category" as const, recordId: housing.id, deletedAt: "2026-10-03T00:00:00.000Z" }]
    };
    const snapshot = JSON.stringify(raw);
    const idFactory = vi.fn();
    const migrated = migrateSnapshot(raw, idFactory);
    expect(idFactory).not.toHaveBeenCalled();
    expect(JSON.stringify(raw)).toBe(snapshot);
    expect(migrated).toMatchObject({ schemaVersion: 9, datasetId: raw.datasetId, transactions: raw.transactions, budgets: raw.budgets, preferences: raw.preferences, categoryDeletionTombstones: raw.categoryDeletionTombstones });
    expect(migrated.categories.map(category => [category.id, category.name, category.createdAt, category.updatedAt])).toEqual(raw.categories.map(category => [category.id, category.name, category.createdAt, category.updatedAt]));
    expect(migrated.categories.find(category => category.id === food.id)).toMatchObject({ isSystem: true, isArchived: false, defaultCategoryKey: "food" });
    expect(migrated.categories.filter(category => category.defaultCategoryKey).every(category => category.isSystem && !category.isArchived)).toBe(true);
    expect(migrated.categories.find(category => category.id === renamed.id)).toMatchObject({ isSystem: false, name: "Synthetic renamed" });
    expect(migrated.categories.find(category => category.id === legacy.id)).toEqual(legacy);
    expect(migrated.categories.find(category => category.id === custom.id)).toEqual(custom);
    expect(migrated.categories.some(category => category.id === housing.id)).toBe(false);
    expect(migrateSnapshot(migrated)).toEqual(migrated);

    const adapter = new MemoryPersistenceAdapter(snapshot);
    const persistence = new DatasetPersistence(adapter);
    expect(await persistence.hydrate()).toEqual({ status: "ready", dataset: migrated });
    expect(adapter.migrationBackups).toEqual([snapshot]);
    await persistence.save(migrated);
    expect(await persistence.hydrate()).toEqual({ status: "ready", dataset: migrated });
  });

  it("recognizes schema 6 protected Uncategorized without a key", () => {
    const original = createEmptyDataset();
    const raw = { ...original, schemaVersion: 6, categories: original.categories.map(category => ({ ...category, isSystem: category.defaultCategoryKey === "uncategorized", defaultCategoryKey: undefined })) };
    const migrated = migrateSnapshot(raw);
    expect(migrated.categories.filter(category => category.isSystem)).toHaveLength(2);
    expect(migrated.categories.filter(category => category.isSystem).every(category => category.defaultCategoryKey === "uncategorized")).toBe(true);
    expect(migrated.categories.find(category => category.name === "Food")?.defaultCategoryKey).toBeUndefined();
  });

  it.each([
    { defaultCategoryKey: undefined },
    { defaultCategoryKey: "unknown" },
    { defaultCategoryKey: "income" },
    { isArchived: true },
    { isSystem: false }
  ])("quarantines inconsistent current system metadata: %j", async (changes) => {
    const original = createEmptyDataset();
    const raw = { ...original, categories: original.categories.map(category => category.defaultCategoryKey === "food" ? { ...category, ...changes } : category) };
    const snapshot = JSON.stringify(raw);
    const adapter = new MemoryPersistenceAdapter(snapshot);
    expect((await hydrateDataset(adapter)).status).toBe("recovery");
    expect(await adapter.readRecoverySnapshot()).toBe(snapshot);
  });

  it.each([{ isSystem: "false" }, { isArchived: "false" }])("retains malformed schema 6 flags for recovery: %j", async (changes) => {
    const original = createEmptyDataset();
    const raw = { ...original, schemaVersion: 6, categories: original.categories.map(category => category.defaultCategoryKey === "food" ? { ...category, ...changes } : category) };
    const snapshot = JSON.stringify(raw);
    const adapter = new MemoryPersistenceAdapter(snapshot);
    expect((await hydrateDataset(adapter)).status).toBe("recovery");
    expect(adapter.migrationBackups).toEqual([snapshot]);
    expect(await adapter.readRecoverySnapshot()).toBe(snapshot);
  });
});

it("migrates a schema-8 tracker snapshot without changing submitted mutation data", () => {
  const dataset = createEmptyDataset();
  const food = dataset.categories.find(category => category.defaultCategoryKey === "food")!;
  const transaction = { ...createTransaction({ type: "expense", categoryId: food.id, amount: "8.25", currency: "USD", description: "Synthetic preserved outbox", date: "2026-10-07" }, { categories: dataset.categories }), id: createUuid() };
  const change = {
    mutationId: createUuid(), recordType: "transaction" as const, recordId: transaction.id,
    operation: "upsert" as const, baseRevision: 4, payload: transaction, tombstone: false,
    editedAt: transaction.updatedAt, revision: 0, committedAt: null,
  };
  const outbox = [{ change, submitted: true }];
  const raw = {
    ...dataset,
    schemaVersion: 8,
    transactions: [transaction],
    sync: { ...emptySyncState(), enabled: true, binding: { owner: "synthetic-subject", datasetId: dataset.datasetId }, outbox },
  };
  const migrated = migrateSnapshot(raw);
  expect(migrated.schemaVersion).toBe(9);
  expect(migrated.sync?.outbox).toEqual(outbox);
  expect(JSON.stringify(migrated.sync?.outbox[0]?.change)).toBe(JSON.stringify(change));
  expect(migrated.transactions[0]).not.toHaveProperty("creator");
});
