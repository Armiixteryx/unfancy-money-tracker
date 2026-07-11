import { describe, expect, it } from "vitest";

import { calculateBudgetProgress, createBudget } from "./budgets";
import type { Category, Transaction } from "./types";

const category: Category = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "expense",
  name: "Food",
  isSystem: false,
  isArchived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const transaction = (amount: string, currency = "USD"): Transaction => ({
  id: "00000000-0000-4000-8000-000000000002",
  amount,
  currency: currency as Transaction["currency"],
  type: "expense",
  categoryId: category.id,
  description: "Synthetic test transaction",
  date: "2026-07-11",
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z"
});

describe("budgets", () => {
  it("creates a canonical expense-category budget", () => {
    const budget = createBudget(
      { categoryId: category.id, month: "2026-07", amount: "100.00", currency: "USD" },
      { categories: [category], idFactory: () => "00000000-0000-4000-8000-000000000003", now: () => "2026-07-11T00:00:00.000Z" }
    );
    expect(budget.amount).toBe("100");
    expect(budget.month).toBe("2026-07");
  });

  it("marks an over-budget category and keeps other currencies separate", () => {
    const budget = createBudget(
      { categoryId: category.id, month: "2026-07", amount: "100", currency: "USD" },
      { categories: [category], idFactory: () => "00000000-0000-4000-8000-000000000003", now: () => "2026-07-11T00:00:00.000Z" }
    );
    const progress = calculateBudgetProgress(budget, [transaction("120"), transaction("10", "EUR")], category.name);
    expect(progress.status).toBe("over_budget");
    expect(progress.remaining.amount).toBe("-20");
    expect(progress.otherCurrencySpending).toEqual([{ amount: "10", currency: "EUR" }]);
  });
});
