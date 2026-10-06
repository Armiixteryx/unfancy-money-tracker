import { aggregateMonthByCurrency, totalBudgetForMonth } from "../../domain/aggregates";
import { createMoney, subtractMoney } from "../../domain/money";
import type { Budget, Transaction } from "../../domain/types";

export function dashboardSummary(transactions: readonly Transaction[], budgets: readonly Budget[], month: string) {
  const aggregates = aggregateMonthByCurrency(transactions, month);
  const currencies = new Set([
    ...aggregates.map((aggregate) => aggregate.currency),
    ...budgets.filter((budget) => budget.month === month).map((budget) => budget.currency),
  ]);
  return [...currencies].sort().map((currency) => {
    const aggregate = aggregates.find((item) => item.currency === currency);
    const income = aggregate?.income ?? createMoney("0", currency);
    const expenses = aggregate?.expenses ?? createMoney("0", currency);
    const budget = totalBudgetForMonth(budgets, month, currency);
    return { currency, income, expenses, budget, remaining: budget ? subtractMoney(budget, expenses) : null };
  });
}
