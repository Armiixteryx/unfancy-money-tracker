import { afterEach, describe, expect, it, vi } from "vitest";

import { DatasetPersistence, MemoryPersistenceAdapter } from "../../../platform/persistence";
import { createDatasetStore } from "./useLocalDatasetStore";

describe("local dataset store", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hydrates before exposing records and persists transaction CRUD without sync mutations", async () => {
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => undefined);
    expect(store.getState().dataset).toBeNull();

    await store.getState().initialize();
    const dataset = store.getState().dataset;
    expect(dataset).not.toBeNull();

    const expenseCategory = dataset?.categories.find((category) => category.kind === "expense" && !category.isSystem);
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
    expect(store.getState().dataset).not.toHaveProperty("sync");
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

    expect(result).toEqual({ ok: false, message: "Category type must match transaction type" });
  });

  it("persists budgets, preferences, and category reassignment locally", async () => {
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => undefined);
    await store.getState().initialize();
    const expenseCategory = store.getState().dataset?.categories.find((category) => category.kind === "expense" && !category.isSystem);
    if (!expenseCategory) return;

    const budget = await store.getState().addBudget({ categoryId: expenseCategory.id, month: "2026-07", amount: "100", currency: "USD" });
    expect(budget.ok).toBe(true);
    const preference = await store.getState().setPreferences({ baseCurrency: "EUR" });
    expect(preference.ok).toBe(true);
    expect(store.getState().dataset?.preferences.selectedCurrencies).toEqual(["USD", "EUR"]);
    const removedBase = await store.getState().setPreferences({ selectedCurrencies: ["USD"] });
    expect(removedBase).toEqual({ ok: false, message: "The current base currency must remain selected." });
    const removedLast = await store.getState().setPreferences({ selectedCurrencies: [] });
    expect(removedLast).toEqual({ ok: false, message: "Select at least one desired currency." });
    const deleted = await store.getState().deleteCategory(expenseCategory.id);
    expect(deleted.ok).toBe(true);
    expect(store.getState().dataset?.categories.some((category) => category.id === expenseCategory.id)).toBe(false);
    expect(store.getState().dataset?.budgets[0]?.categoryId).toBe(deleted.ok ? deleted.value.id : "");
    expect(store.getState().dataset?.preferences.baseCurrency).toBe("EUR");
    expect(store.getState().dataset?.categoryDeletionTombstones).toHaveLength(1);

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
    expect(store.getState().dataset).not.toHaveProperty("sync");
  });

  it("does not replace data outside the explicit local development environment", async () => {
    vi.stubEnv("EXPO_PUBLIC_ENV", "production");
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()), async () => undefined);
    await store.getState().initialize();

    await expect(store.getState().replaceWithMockData("dashboard")).resolves.toEqual({
      ok: false,
      message: "Mock data is available only in the local development environment."
    });
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

    await expect(store.getState().copyBudgets("2026-07", "2026-07")).resolves.toEqual({ ok: false, message: "Source and target months must be different." });
    await expect(store.getState().copyBudgets("2026-08", "2026-09")).resolves.toEqual({ ok: false, message: "No budgets found in the source month." });
    await expect(store.getState().copyBudgets("invalid", "2026-09")).resolves.toEqual({ ok: false, message: "Choose valid calendar months to copy budgets." });
    await expect(store.getState().copyBudgets("2026-07", "2026-09")).resolves.toEqual({ ok: false, message: "No budgets are available to copy." });
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
    expect(result).toEqual({ ok: false, message: "Budgets could not be saved locally. Retry to save your changes." });
    expect(adapter.writes).toBe(writesBeforeCopy + 1);
    expect(store.getState().saveError).toBe("Local save failed. Your change is still visible; retry to save it.");
  });
});
