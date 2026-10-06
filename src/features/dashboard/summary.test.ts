import { describe, expect, it } from "vitest";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
import { createBudget } from "../../domain/budgets";
import { createTransaction } from "../../domain/transactions";
import { dashboardSummary } from "./summary";

const dataset = createEmptyDataset();
const categoryId = dataset.categories.find((category) => category.kind === "expense")!.id;
const dependencies = { categories: dataset.categories };
const budget = createBudget({ amount: "100", currency: "USD", categoryId, month: "2026-10" }, dependencies);
const expense = createTransaction({ amount: "120", currency: "USD", type: "expense", categoryId, description: "Synthetic expense", date: "2026-10-04" }, dependencies);

describe("dashboard remaining budget", () => {
  it("includes a budget currency without transactions and respects the selected month", () => {
    expect(dashboardSummary([], [budget], "2026-10")).toMatchObject([{ currency: "USD", remaining: { amount: "100" }, expenses: { amount: "0" } }]);
    expect(dashboardSummary([], [budget], "2026-09")).toEqual([]);
  });

  it("keeps currencies separate, does not subtract income, and retains overspending", () => {
    const income = createTransaction({ amount: "500", currency: "USD", type: "income", categoryId: dataset.categories.find((category) => category.kind === "income")!.id, description: "Synthetic income", date: "2026-10-04" }, dependencies);
    const foreignExpense = createTransaction({ amount: "20", currency: "EUR", type: "expense", categoryId, description: "Synthetic foreign expense", date: "2026-10-04" }, dependencies);
    const transactions = [expense, foreignExpense, income];
    expect(dashboardSummary(transactions, [budget], "2026-10")).toMatchObject([
      { currency: "EUR", budget: null, remaining: null, expenses: { amount: "20", currency: "EUR" } },
      { currency: "USD", remaining: { amount: "-20", currency: "USD" }, income: { amount: "500" } },
    ]);
    expect(transactions[0]).toBe(expense);
    expect(budget.amount).toBe("100");
  });

  it("sums monthly limits and excludes previous-month expenses", () => {
    const otherBudget = createBudget({ amount: "50", currency: "USD", categoryId: dataset.categories.filter((category) => category.kind === "expense")[1]!.id, month: "2026-10" }, dependencies);
    expect(dashboardSummary([expense, { ...expense, date: "2026-09-04" }], [budget, otherBudget], "2026-10")[0]?.remaining?.amount).toBe("30");
  });
});
