import { errorCode } from "../../../domain/errors";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatasetPersistence, MemoryPersistenceAdapter } from "../../../platform/persistence";
import { createDatasetStore } from "./useLocalDatasetStore";
import { createUuid } from "../../../platform/identifiers/createUuid";
import { emptySyncState } from "../../sync/state";

describe("local dataset store", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps a hydrated tracker mounted when refresh requests initialization again", async () => {
    const persistence = new DatasetPersistence(new MemoryPersistenceAdapter());
    const hydrate = vi.spyOn(persistence, "hydrate");
    const store = createDatasetStore(persistence, async () => undefined);
    await store.getState().initialize();
    const dataset = store.getState().dataset;
    const statuses: string[] = [];
    const unsubscribe = store.subscribe(state => statuses.push(state.hydration.status));
    await store.getState().initialize();
    unsubscribe();
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(store.getState().dataset).toBe(dataset);
    expect(statuses).not.toContain("loading");
  });

  it("hydrates before exposing records and persists transaction CRUD without sync mutations", async () => {
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => undefined);
    expect(store.getState().dataset).toBeNull();

    await store.getState().initialize();
    const dataset = store.getState().dataset;
    expect(dataset).not.toBeNull();

    const expenseCategory = dataset?.categories.find((category) => category.defaultCategoryKey === "food");
    expect(expenseCategory).toBeDefined();
    if (!expenseCategory) return;

    const added = await store.getState().addTransaction({
      amount: "12.50",
      type: "expense",
      categoryId: expenseCategory.id,
      description: "Synthetic transaction",
      date: "2026-07-11",
      currency: "USD"
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const updated = await store.getState().editTransaction(added.value.id, {
      amount: "13.00",
      type: "expense",
      categoryId: expenseCategory.id,
      description: "Updated synthetic transaction",
      date: "2026-07-11",
      currency: "USD"
    });
    expect(updated.ok).toBe(true);

    const deleted = await store.getState().deleteTransaction(added.value.id);
    expect(deleted.ok).toBe(true);
    expect(store.getState().dataset?.transactions).toHaveLength(0);
    expect(store.getState().dataset).not.toHaveProperty("recordTombstones");
    expect(store.getState().dataset).toHaveProperty("sync.enabled", false);
  });

  it("saves watch transactions durably before exposing the record and deduplicates the stable ID", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    const before = store.getState().dataset!;
    const category = before.categories.find(candidate => candidate.defaultCategoryKey === "food")!;
    const id = createUuid();
    const input = { amount: "9.25", type: "expense" as const, categoryId: category.id, description: "Synthetic watch entry", date: "2026-10-06", currency: "USD" as const };

    const saved = await store.getState().addTransactionDurably(input, id);
    expect(saved).toMatchObject({ ok: true, value: { id } });
    const hydrated = await new DatasetPersistence(adapter).hydrate();
    expect(hydrated.status).toBe("ready");
    if (hydrated.status !== "ready") return;
    expect(hydrated.dataset.transactions.map(record => record.id)).toEqual([id]);

    await store.getState().addTransactionDurably({ ...input, amount: "90.00" }, id);
    expect(store.getState().dataset?.transactions).toHaveLength(1);
    expect(store.getState().dataset?.transactions[0]?.amount).toBe("9.25");
  });

  it("keeps watch audio and recovery metadata out of an opted-in financial snapshot and outbox", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    await store.getState().updateFromSync(current => ({ ...current, sync: { ...emptySyncState(), enabled: true, binding: { owner: "synthetic-sub", datasetId: current.datasetId } } }));
    const dataset = store.getState().dataset!;
    const category = dataset.categories.find(candidate => candidate.defaultCategoryKey === "food")!;
    const input = { amount: "9.25", type: "expense" as const, categoryId: category.id, description: "Synthetic expense", date: "2026-10-06", currency: "USD" as const,
      audio: "synthetic-recording-bytes", status: "failed", errorCode: "synthetic_failure", accountId: "synthetic-origin-account" };
    expect((await store.getState().addTransactionDurably(input, createUuid())).ok).toBe(true);
    const saved = store.getState().dataset!;
    expect(saved.sync?.outbox).toHaveLength(1);
    const serialized = JSON.stringify(saved);
    for (const value of ["synthetic-recording-bytes", "synthetic_failure", "synthetic-origin-account", '\"audio\"', '\"errorCode\"']) expect(serialized).not.toContain(value);
    const hydrated = await new DatasetPersistence(adapter).hydrate();
    expect(hydrated.status).toBe("ready");
    if (hydrated.status === "ready") expect(hydrated.dataset).toEqual(saved);
  });

  it("retains a failed watch write in memory for same-ID retry without persisting or uploading it", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    await store.getState().updateFromSync(current => ({ ...current, sync: { ...emptySyncState(), enabled: true, binding: { owner: "synthetic-sub", datasetId: current.datasetId } } }));
    const before = store.getState().dataset!;
    const category = before.categories.find(candidate => candidate.defaultCategoryKey === "food")!;
    vi.spyOn(adapter, "writeSnapshot").mockRejectedValueOnce(new Error("synthetic storage failure"));
    const result = await store.getState().addTransactionDurably({ amount: "9.25", type: "expense", categoryId: category.id, description: "Synthetic watch entry", date: "2026-10-06", currency: "USD" }, createUuid());
    if (result.ok) throw new Error("Expected a failed durable write");
    expect(result).toMatchObject({ recordId: expect.any(String) });
    expect(store.getState().dataset).not.toBe(before);
    expect(store.getState().dataset?.transactions.map(record => record.id)).toEqual([result.recordId]);
    expect(store.getState().dataset?.sync?.outbox).toHaveLength(1);
    const persisted = await new DatasetPersistence(adapter).hydrate();
    expect(persisted.status).toBe("ready");
    if (persisted.status === "ready") expect(persisted.dataset.transactions).toHaveLength(0);
    const retried = await store.getState().addTransactionDurably({ amount: "90.00", type: "expense", categoryId: category.id, description: "Changed retry payload", date: "2026-10-06", currency: "USD" }, result.recordId!);
    expect(retried.ok).toBe(true);
    const saved = await new DatasetPersistence(adapter).hydrate();
    expect(saved.status).toBe("ready");
    if (saved.status === "ready") expect(saved.dataset.transactions.map(record => record.id)).toEqual([result.recordId]);
  });

  it("serializes a pending watch write before a confirmed local reset and leaves no stale record", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    const dataset = store.getState().dataset!;
    const category = dataset.categories.find(candidate => candidate.defaultCategoryKey === "food")!;
    const originalWrite = adapter.writeSnapshot.bind(adapter);
    let enterWrite!: () => void;
    let releaseWrite!: () => void;
    const entered = new Promise<void>(resolve => { enterWrite = resolve; });
    const gate = new Promise<void>(resolve => { releaseWrite = resolve; });
    vi.spyOn(adapter, "writeSnapshot").mockImplementation(async snapshot => { enterWrite(); await gate; await originalWrite(snapshot); });
    const watchSave = store.getState().addTransactionDurably({ amount: "9.25", type: "expense", categoryId: category.id, description: "Synthetic watch entry", date: "2026-10-06", currency: "USD" }, createUuid());
    await entered;
    const reset = store.getState().resetLocalData();
    releaseWrite();
    await Promise.all([watchSave, reset]);
    expect(store.getState().dataset?.transactions).toHaveLength(0);
    const hydrated = await new DatasetPersistence(adapter).hydrate();
    expect(hydrated.status).toBe("ready");
    if (hydrated.status === "ready") expect(hydrated.dataset.transactions).toHaveLength(0);
  });

  it("rejects a category from the wrong transaction kind at the domain boundary", async () => {
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => undefined);
    await store.getState().initialize();
    const incomeCategory = store.getState().dataset?.categories.find((category) => category.kind === "income");
    if (!incomeCategory) return;

    const result = await store.getState().addTransaction({
      amount: "10",
      type: "expense",
      categoryId: incomeCategory.id,
      description: "Synthetic invalid category",
      date: "2026-07-11",
      currency: "USD"
    });

    expect(result).toEqual({ ok: false, message: errorCode("Category type must match transaction type") });
  });

  it("persists budgets, preferences, and category reassignment locally", async () => {
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => undefined);
    await store.getState().initialize();
    const addedCategory = await store.getState().addCategory({ kind: "expense", name: "Synthetic custom" });
    expect(addedCategory.ok).toBe(true);
    if (!addedCategory.ok) throw new Error("Expected a custom category");
    const expenseCategory = addedCategory.value;

    const budget = await store.getState().addBudget({ categoryId: expenseCategory.id, month: "2026-07", amount: "100", currency: "USD" });
    expect(budget.ok).toBe(true);
    const preference = await store.getState().setPreferences({ baseCurrency: "EUR" });
    expect(preference.ok).toBe(true);
    expect(store.getState().dataset?.preferences.selectedCurrencies).toEqual(["USD", "EUR"]);
    const removedBase = await store.getState().setPreferences({ selectedCurrencies: ["USD"] });
    expect(removedBase).toEqual({ ok: false, message: errorCode("The current base currency must remain selected.") });
    const removedLast = await store.getState().setPreferences({ selectedCurrencies: [] });
    expect(removedLast).toEqual({ ok: false, message: errorCode("Select at least one desired currency.") });
    const deleted = await store.getState().deleteCategory(expenseCategory.id);
    expect(deleted.ok).toBe(true);
    expect(store.getState().dataset?.categories.some((category) => category.id === expenseCategory.id)).toBe(false);
    expect(store.getState().dataset?.budgets[0]?.categoryId).toBe(deleted.ok ? deleted.value.id : "");
    expect(store.getState().dataset?.preferences.baseCurrency).toBe("EUR");
    expect(store.getState().dataset?.categoryDeletionTombstones).toHaveLength(1);

  });
  it("rejects every system category mutation without changing records or writing a snapshot", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const write = vi.spyOn(adapter, "writeSnapshot");
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    const categories = store.getState().dataset!.categories;
    for (const category of categories) {
      expect((await store.getState().addTransaction({ amount: "10", type: category.kind, categoryId: category.id, description: "Synthetic protected record", date: "2026-07-11", currency: "USD" })).ok).toBe(true);
      if (category.kind === "expense") expect((await store.getState().addBudget({ categoryId: category.id, month: "2026-07", amount: "100", currency: "USD" })).ok).toBe(true);
    }
    const before = store.getState().dataset;
    const writeCount = write.mock.calls.length;
    for (const category of categories) {
      await expect(store.getState().renameCategory(category.id, "Synthetic rename")).resolves.toEqual({ ok: false, message: "protected_categories_cannot_be_renamed" });
      await expect(store.getState().archiveCategory(category.id)).resolves.toEqual({ ok: false, message: "protected_categories_cannot_be_archived" });
      await expect(store.getState().deleteCategory(category.id)).resolves.toEqual({ ok: false, message: "protected_categories_cannot_be_deleted" });
      expect(store.getState().dataset).toBe(before);
    }
    expect(write).toHaveBeenCalledTimes(writeCount);
    const rehydrated = await new DatasetPersistence(adapter).hydrate();
    expect(rehydrated).toMatchObject({ status: "ready", dataset: before });
  });

  it.each(["income", "expense"] as const)("persists custom %s lifecycle and reassigns references to the matching fallback", async (kind) => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    const added = await store.getState().addCategory({ kind, name: "Synthetic lifecycle" });
    if (!added.ok) throw new Error("Expected custom category");
    const id = added.value.id;
    expect((await store.getState().addTransaction({ categoryId: id, type: kind, amount: "10", description: "Synthetic custom record", date: "2026-07-11", currency: "USD" })).ok).toBe(true);
    if (kind === "expense") expect((await store.getState().addBudget({ categoryId: id, month: "2026-07", amount: "100", currency: "USD" })).ok).toBe(true);
    expect((await store.getState().renameCategory(id, "Synthetic renamed")).ok).toBe(true);
    expect((await store.getState().archiveCategory(id)).ok).toBe(true);
    const removed = await store.getState().deleteCategory(id);
    if (!removed.ok) throw new Error("Expected custom deletion");
    expect(removed.value).toMatchObject({ kind, defaultCategoryKey: "uncategorized", isSystem: true });
    const restarted = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await restarted.getState().initialize();
    const dataset = restarted.getState().dataset!;
    expect(dataset.categories.some(category => category.id === id)).toBe(false);
    expect(dataset.transactions[0]?.categoryId).toBe(removed.value.id);
    if (kind === "expense") expect(dataset.budgets[0]?.categoryId).toBe(removed.value.id);
    expect(dataset.categoryDeletionTombstones).toEqual([{ recordType: "category", recordId: id, deletedAt: expect.any(String) }]);
  });

  it("persists the theme preference without replacing system with a resolved value", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();

    await store.getState().setPreferences({ theme: "dark" });
    const rehydrated = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await rehydrated.getState().initialize();
    expect(rehydrated.getState().dataset?.preferences.theme).toBe("dark");

    await rehydrated.getState().setPreferences({ theme: "system" });
    const rehydratedAgain = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await rehydratedAgain.getState().initialize();
    expect(rehydratedAgain.getState().dataset?.preferences.theme).toBe("system");
  });

  it("replaces the local dataset with a development fixture without account restrictions", async () => {
    vi.stubEnv("EXPO_PUBLIC_ENV", "local");
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    const originalId = store.getState().dataset?.datasetId;

    const result = await store.getState().replaceWithMockData("edge-cases");

    expect(result.ok).toBe(true);
    expect(store.getState().dataset?.datasetId).toBe(originalId);
    expect(store.getState().dataset?.transactions.length).toBeGreaterThan(10);
    expect(store.getState().dataset).toHaveProperty("sync.enabled", false);
  });

  it("does not replace data outside the explicit local development environment", async () => {
    vi.stubEnv("EXPO_PUBLIC_ENV", "production");
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => undefined);
    await store.getState().initialize();

    await expect(store.getState().replaceWithMockData("dashboard")).resolves.toEqual({
      ok: false,
      message: errorCode("Mock data is available only in the local development environment.")
    });
  });
  it("requires a confirmed local reset before fixtures can replace a bound dataset",async () => {
    vi.stubEnv("EXPO_PUBLIC_ENV","local");
    const adapter=new MemoryPersistenceAdapter();const store=createDatasetStore(new DatasetPersistence(adapter),async () => undefined);await store.getState().initialize();
    await store.getState().updateFromSync(current => ({ ...current,sync:{ ...current.sync!,binding:{ owner:"synthetic-owner",datasetId:current.datasetId },enabled:false } }));
    const saved=await adapter.readSnapshot();const epoch=store.getState().datasetEpoch;
    expect((await store.getState().replaceWithMockData("dashboard")).ok).toBe(false);
    expect(await adapter.readSnapshot()).toBe(saved);expect(store.getState().datasetEpoch).toBe(epoch);
  });

  it("retries legacy cleanup before hydrating when cleanup fails", async () => {
    let attempts = 0;
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("synthetic cleanup failure");
    });

    await store.getState().initialize();
    expect(store.getState().hydration.status).toBe("recovery");
    await store.getState().retryHydration();
    expect(store.getState().hydration.status).toBe("ready");
    expect(attempts).toBe(2);
  });
  it("copies a populated source month with fresh records and persists the target budgets", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    const category = store.getState().dataset?.categories.find((candidate) => candidate.kind === "expense" && !candidate.isArchived);
    if (!category) return;

    const added = await store.getState().addBudget({ categoryId: category.id, month: "2026-07", amount: "125.00", currency: "USD" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const source = added.value;

    const result = await store.getState().copyBudgets("2026-07", "2026-08");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toHaveLength(1);
    expect(result.value.skipped).toBe(0);
    expect(result.value.created[0]).toMatchObject({ categoryId: source.categoryId, month: "2026-08", amount: source.amount, currency: source.currency });
    expect(result.value.created[0]?.id).not.toBe(source.id);
    expect(result.value.created[0]?.createdAt).toEqual(expect.any(String));
    expect(result.value.created[0]?.updatedAt).toEqual(expect.any(String));
    expect(store.getState().dataset?.budgets.find((budget) => budget.id === source.id)).toEqual(source);

    const rehydrated = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await rehydrated.getState().initialize();
    expect(rehydrated.getState().dataset?.budgets.some((budget) => budget.month === "2026-08" && budget.categoryId === source.categoryId)).toBe(true);
  });

  it("merges copies without overwriting existing target limits", async () => {
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => undefined);
    await store.getState().initialize();
    const categories = store.getState().dataset?.categories.filter((candidate) => candidate.kind === "expense" && !candidate.isArchived).slice(0, 2);
    if (!categories || categories.length < 2) return;
    const categoryOne = categories[0];
    const categoryTwo = categories[1];
    if (!categoryOne || !categoryTwo) return;
    const sourceOne = await store.getState().addBudget({ categoryId: categoryOne.id, month: "2026-07", amount: "100", currency: "USD" });
    const sourceTwo = await store.getState().addBudget({ categoryId: categoryTwo.id, month: "2026-07", amount: "200", currency: "USD" });
    const existing = await store.getState().addBudget({ categoryId: categoryOne.id, month: "2026-08", amount: "75", currency: "USD" });
    expect(sourceOne.ok && sourceTwo.ok && existing.ok).toBe(true);
    if (!existing.ok) return;

    const result = await store.getState().copyBudgets("2026-07", "2026-08");
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) return;
    expect(result.value.created).toHaveLength(1);
    expect(result.value.skipped).toBe(1);
    expect(store.getState().dataset?.budgets.filter((budget) => budget.month === "2026-08")).toHaveLength(2);
    expect(store.getState().dataset?.budgets.find((budget) => budget.id === existing.value.id)?.amount).toBe("75");
  });

  it("rejects invalid, same-month, empty, and unavailable source requests", async () => {
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => undefined);
    await store.getState().initialize();
    const categories = store.getState().dataset?.categories ?? [];
    const expenseCategories = categories.filter((candidate) => candidate.kind === "expense" && !candidate.isArchived).slice(0, 2);
    const incomeCategory = categories.find((candidate) => candidate.kind === "income");
    if (expenseCategories.length < 2 || !incomeCategory) return;
    const firstCategory = expenseCategories[0];
    const secondCategory = expenseCategories[1];
    if (!firstCategory || !secondCategory) return;
    const first = await store.getState().addBudget({ categoryId: firstCategory.id, month: "2026-07", amount: "100", currency: "USD" });
    const second = await store.getState().addBudget({ categoryId: secondCategory.id, month: "2026-07", amount: "200", currency: "USD" });
    expect(first.ok && second.ok).toBe(true);
    const dataset = store.getState().dataset;
    if (!dataset || !first.ok || !second.ok) return;
    store.setState({
      dataset: {
        ...dataset,
        categories: dataset.categories.map((category) => expenseCategories.some((candidate) => candidate.id === category.id) ? { ...category, isArchived: true } : category),
        budgets: [...dataset.budgets, { ...first.value, id: "00000000-0000-4000-8000-000000000091", categoryId: incomeCategory.id }, { ...first.value, id: "00000000-0000-4000-8000-000000000092", categoryId: "00000000-0000-4000-8000-000000000093" }]
      }
    });

    await expect(store.getState().copyBudgets("2026-07", "2026-07")).resolves.toEqual({ ok: false, message: errorCode("Source and target months must be different.") });
    await expect(store.getState().copyBudgets("2026-08", "2026-09")).resolves.toEqual({ ok: false, message: errorCode("No budgets found in the source month.") });
    await expect(store.getState().copyBudgets("invalid", "2026-09")).resolves.toEqual({ ok: false, message: errorCode("Choose valid calendar months to copy budgets.") });
    await expect(store.getState().copyBudgets("2026-07", "2026-09")).resolves.toEqual({ ok: false, message: errorCode("No budgets are available to copy.") });
    expect(store.getState().dataset?.budgets.filter((budget) => budget.month === "2026-09")).toHaveLength(0);
  });

  it("reports one local persistence failure for an atomic copy", async () => {
    class FailingAdapter extends MemoryPersistenceAdapter {
      writes = 0;
      override async writeSnapshot(_snapshot: string): Promise<void> {
        this.writes += 1;
        throw new Error("synthetic persistence failure");
      }
    }
    const adapter = new FailingAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    const category = store.getState().dataset?.categories.find((candidate) => candidate.kind === "expense" && !candidate.isArchived);
    if (!category) return;
    await store.getState().addBudget({ categoryId: category.id, month: "2026-07", amount: "100", currency: "USD" });
    const writesBeforeCopy = adapter.writes;

    const result = await store.getState().copyBudgets("2026-07", "2026-08");
    expect(result).toEqual({ ok: false, message: errorCode("Budgets could not be saved locally. Retry to save your changes.") });
    expect(adapter.writes).toBe(writesBeforeCopy + 1);
    expect(store.getState().saveError).toBe(errorCode("Local save failed. Your change is still visible; retry to save it."));
  });
});


describe("voice persistence lifecycle", () => {
  it("reports failed writes and retries the same identity without duplicates", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => undefined);
    await store.getState().initialize();
    const dataset = store.getState().dataset!;
    const category = dataset.categories.find(c => c.kind === "expense")!;
    const write = vi.spyOn(adapter, "writeSnapshot").mockRejectedValueOnce(new Error("synthetic failure"));
    const input = {amount:"10",type:"expense" as const,categoryId:category.id,description:"Synthetic voice expense",date:"2026-10-02",currency:"USD" as const};
    const failed = await store.getState().addTransaction(input);
    expect(failed.ok).toBe(false);
    if(failed.ok || !failed.recordId) throw new Error("Expected retained identity");
    expect(store.getState().dataset?.transactions).toHaveLength(1);
    const retry = await store.getState().addTransaction(input, failed.recordId);
    expect(retry).toMatchObject({ok:true,value:{id:failed.recordId}});
    expect(store.getState().dataset?.transactions).toHaveLength(1);
    expect(write).toHaveBeenCalledTimes(2);
    expect(store.getState().saveStatus).toBe("idle");
  });
  it("invalidates callbacks when fixtures replace the dataset even with the same ID", async () => {
    vi.stubEnv("EXPO_PUBLIC_ENV","local");
    const store=createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()),async()=>undefined);
    await store.getState().initialize();
    const id=store.getState().dataset?.datasetId;
    const epoch=store.getState().datasetEpoch;
    await store.getState().replaceWithMockData("dashboard");
    expect(store.getState().dataset?.datasetId).toBe(id);
    expect(store.getState().datasetEpoch).toBeGreaterThan(epoch);
    vi.unstubAllEnvs();
  });
});
