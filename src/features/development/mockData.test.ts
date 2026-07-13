import { describe, expect, it } from "vitest";

import { calculateBudgetProgress } from "../../domain/budgets";
import { monthlyReport } from "../../domain/reports";
import type { Dataset } from "../../domain/types";
import { datasetEnvelopeSchema } from "../../platform/persistence/schema";
import { createMockDataset } from "./mockData";

const datasetId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-12T12:00:00.000Z");

function assertFixtureIntegrity(dataset: Dataset): void {
  expect(datasetEnvelopeSchema.parse(dataset)).toEqual(dataset);
  const categories = new Map(dataset.categories.map((category) => [category.id, category]));
  const budgetKeys = new Set<string>();

  for (const transaction of dataset.transactions) {
    const category = categories.get(transaction.categoryId);
    expect(category, `transaction ${transaction.id} must reference a category`).toBeDefined();
    expect(category?.kind, `transaction ${transaction.id} category kind must match`).toBe(transaction.type);
    expect(transaction.date <= "2026-07-12").toBe(true);
  }
  for (const budget of dataset.budgets) {
    const category = categories.get(budget.categoryId);
    expect(category, `budget ${budget.id} must reference a category`).toBeDefined();
    expect(category?.kind).toBe("expense");
    expect(category?.isArchived).toBe(false);
    const key = `${budget.month}:${budget.categoryId}`;
    expect(budgetKeys.has(key), `duplicate fixture budget ${key}`).toBe(false);
    budgetKeys.add(key);
  }
  expect(dataset.sync).toEqual({
    status: "idle",
    inboxCursor: null,
    outbox: [],
    conflicts: [],
    revisions: {},
    lastSyncedAt: null,
    reason: null
  });
}

describe("local mock datasets", () => {
  it("creates a valid dashboard dataset with current and report history", () => {
    const dataset = createMockDataset("dashboard", datasetId, { now });

    assertFixtureIntegrity(dataset);
    expect(dataset.datasetId).toBe(datasetId);
    expect(dataset.transactions.some((transaction) => transaction.date.startsWith("2026-07"))).toBe(true);
    expect(dataset.transactions.some((transaction) => transaction.date.startsWith("2026-04"))).toBe(true);
    expect(dataset.budgets).toHaveLength(2);
    expect(monthlyReport(dataset.transactions, "2026-07", 4).every((point) => point.aggregates.length > 0)).toBe(true);
  });

  it("creates edge cases without invalid category references", () => {
    const dataset = createMockDataset("edge-cases", datasetId, { now });
    const categoryIds = new Set(dataset.categories.map((category) => category.id));

    assertFixtureIntegrity(dataset);
    const currencies = new Set(dataset.transactions.map((transaction) => transaction.currency));
    expect(currencies.has("USD")).toBe(true);
    expect(currencies.has("EUR")).toBe(true);
    expect(currencies.has("JPY")).toBe(true);
    expect(dataset.categories.some((category) => category.name === "Sample archived travel" && category.isArchived)).toBe(true);
    expect(dataset.categoryDeletionTombstones).toHaveLength(1);
    expect(dataset.transactions.every((transaction) => categoryIds.has(transaction.categoryId))).toBe(true);
    const statuses = dataset.budgets.map((budget) => {
      const category = dataset.categories.find((candidate) => candidate.id === budget.categoryId);
      return calculateBudgetProgress(budget, dataset.transactions, category?.name).status;
    });
    expect(statuses).toContain("on_track");
    expect(statuses).toContain("attention");
    expect(statuses).toContain("over_budget");
  });
});
