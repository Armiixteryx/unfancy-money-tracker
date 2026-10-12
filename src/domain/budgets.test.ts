import { describe, expect, it } from "vitest";

import { calculateBudgetProgress, calculatePlannedExpenseTotals, createBudget, updateBudget } from "./budgets";
import type { BudgetPlannedExpense, Category, Transaction } from "./types";
import type { RateRecord } from "../platform/exchange-rates/types";
import { budgetSchema } from "./recordSchemas";
import { budgetInputSchema } from "./validation";

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
    expect(budget.plannedExpenses).toEqual([]);
  });

  it("validates, normalizes, and preserves a budget's planned expenses when editing the limit", () => {
    const plannedExpenses: BudgetPlannedExpense[] = [{
      id: "018f47b0-0000-7000-8000-000000000001",
      description: "  Monthly internet  ",
      amount: "45.00",
      currency: "USD"
    }];
    const existing = createBudget(
      { categoryId: category.id, month: "2026-07", amount: "100", currency: "USD", plannedExpenses },
      { categories: [category], idFactory: () => "00000000-0000-4000-8000-000000000003", now: () => "2026-07-11T00:00:00.000Z" }
    );
    expect(existing.plannedExpenses).toEqual([{ ...plannedExpenses[0], description: "Monthly internet", amount: "45" }]);

    const updated = updateBudget(existing, { categoryId: category.id, month: "2026-07", amount: "120", currency: "EUR" }, { categories: [category], now: () => "2026-07-12T00:00:00.000Z" });
    expect(updated).toMatchObject({ amount: "120", currency: "EUR", plannedExpenses: existing.plannedExpenses });
  });

  it("accepts legacy budgets without plannedExpenses and rejects duplicate or untrimmed planned items", () => {
    const budget = createBudget(
      { categoryId: category.id, month: "2026-07", amount: "100", currency: "USD" },
      { categories: [category], idFactory: () => "00000000-0000-4000-8000-000000000003", now: () => "2026-07-11T00:00:00.000Z" }
    );
    const legacy = { ...budget };
    delete legacy.plannedExpenses;
    expect(budgetSchema.safeParse(legacy).success).toBe(true);
    expect(budgetSchema.safeParse({ ...budget, plannedExpenses: [
      { id: "018f47b0-0000-7000-8000-000000000001", description: "Internet", amount: "10", currency: "USD" },
      { id: "018f47b0-0000-7000-8000-000000000001", description: "Phone", amount: "15", currency: "USD" }
    ] }).success).toBe(false);
    expect(budgetSchema.safeParse({ ...budget, plannedExpenses: [
      { id: "018f47b0-0000-7000-8000-000000000002", description: " Internet ", amount: "10", currency: "USD" }
    ] }).success).toBe(false);
    expect(budgetInputSchema.safeParse({
      categoryId: category.id, month: "2026-07", amount: "100", currency: "USD",
      plannedExpenses: [
        { id: "018f47b0-0000-7000-8000-000000000001", description: "Internet", amount: "10", currency: "USD" },
        { id: "018f47b0-0000-7000-8000-000000000001", description: "Phone", amount: "15", currency: "USD" }
      ]
    }).success).toBe(false);
  });

  it("converts planned expenses to the budget currency with half-up rounding and retains originals when a rate is missing", () => {
    const plannedExpenses: BudgetPlannedExpense[] = [
      { id: "018f47b0-0000-7000-8000-000000000001", description: "Streaming", amount: "1", currency: "EUR" },
      { id: "018f47b0-0000-7000-8000-000000000002", description: "Phone", amount: "2", currency: "USD" },
      { id: "018f47b0-0000-7000-8000-000000000003", description: "Train pass", amount: "8", currency: "GBP" }
    ];
    const euroRate: RateRecord = {
      base: "EUR", quote: "USD", rate: "1.005", effectiveDate: "2026-07-11",
      fetchedAt: "2026-07-11T00:00:00.000Z", provider: "frankfurter-blended", status: "stale"
    };
    const available = calculatePlannedExpenseTotals(plannedExpenses.slice(0, 2), "USD", (base, quote) => base === "EUR" && quote === "USD" ? euroRate : undefined);
    expect(available.total).toEqual({ amount: "3.01", currency: "USD" });
    expect(available.originalTotals).toEqual([{ amount: "1", currency: "EUR" }, { amount: "2", currency: "USD" }]);
    expect(available.rates).toEqual([euroRate]);

    const missing = calculatePlannedExpenseTotals(plannedExpenses, "USD", (base) => base === "EUR" ? euroRate : undefined);
    expect(missing.total).toBeNull();
    expect(missing.unavailableCurrencies).toEqual(["GBP"]);
    expect(missing.originalTotals).toEqual([
      { amount: "1", currency: "EUR" },
      { amount: "8", currency: "GBP" },
      { amount: "2", currency: "USD" }
    ]);
  });

  it("marks an over-budget category and keeps other currencies separate", () => {
    const budget = createBudget(
      {
        categoryId: category.id, month: "2026-07", amount: "100", currency: "USD",
        plannedExpenses: [{ id: "018f47b0-0000-7000-8000-000000000004", description: "Planned subscription", amount: "900", currency: "USD" }]
      },
      { categories: [category], idFactory: () => "00000000-0000-4000-8000-000000000003", now: () => "2026-07-11T00:00:00.000Z" }
    );
    const progress = calculateBudgetProgress(budget, [transaction("120"), transaction("10", "EUR")], category.name);
    expect(progress.status).toBe("over_budget");
    expect(progress.remaining.amount).toBe("-20");
    expect(progress.otherCurrencySpending).toEqual([{ amount: "10", currency: "EUR" }]);
  });
});
