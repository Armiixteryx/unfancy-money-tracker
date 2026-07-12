import { describe, expect, it } from "vitest";

import { DatasetPersistence, MemoryPersistenceAdapter } from "../../../platform/persistence";
import { createDatasetStore } from "./useDatasetStore";

const categoryId = "00000000-0000-4000-8000-000000000001";

describe("local dataset store", () => {
  it("hydrates before exposing records and persists transaction CRUD", async () => {
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()));
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
    expect(store.getState().dataset?.recordTombstones).toHaveLength(1);
    expect(store.getState().dataset?.sync.outbox).toHaveLength(1);
    expect(store.getState().dataset?.sync.outbox[0]?.operation).toBe("delete");
    expect(store.getState().dataset?.sync.outbox[0]?.tombstone).toBe(true);
  });

  it("rejects a category from the wrong transaction kind at the domain boundary", async () => {
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()));
    await store.getState().initialize();
    const incomeCategory = store.getState().dataset?.categories.find((category) => category.kind === "income");
    expect(incomeCategory?.id).not.toBe(categoryId);
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
    const store = createDatasetStore(new DatasetPersistence(new MemoryPersistenceAdapter()));
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
  });
});
