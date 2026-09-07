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
});
