import Decimal from "decimal.js";

import { addMoney, createMoney, normalizeMoneyAmount, subtractMoney, type Money } from "./money";
import type { CurrencyCode } from "./currency";
import { budgetInputSchema, type BudgetInput } from "./validation";
import type { Budget, CalendarMonth, Category, Transaction, UUID } from "./types";
import { createUuid } from "../platform/identifiers/createUuid";

export type BudgetProgressStatus = "on_track" | "attention" | "over_budget";

export type BudgetProgress = {
  budget: Budget;
  categoryName: string;
  spent: Money;
  remaining: Money;
  percentUsed: number;
  status: BudgetProgressStatus;
  otherCurrencySpending: readonly Money[];
};

export function createBudget(
  input: BudgetInput,
  dependencies: { idFactory?: () => UUID; now?: () => string; categories: readonly Category[] }
): Budget {
  const parsed = budgetInputSchema.parse(input);
  const category = dependencies.categories.find((candidate) => candidate.id === parsed.categoryId);
  if (!category || category.kind !== "expense") throw new Error("Select an expense category");
  if (category.isArchived) throw new Error("Archived categories cannot receive new budgets");

  const now = dependencies.now?.() ?? new Date().toISOString();
  return {
    id: dependencies.idFactory?.() ?? createUuid(),
    categoryId: parsed.categoryId,
    month: parsed.month as CalendarMonth,
    amount: normalizeMoneyAmount(parsed.amount, parsed.currency, { allowNegative: false, allowZero: false }),
    currency: parsed.currency,
    createdAt: now,
    updatedAt: now
  };
}

export function updateBudget(
  existing: Budget,
  input: BudgetInput,
  dependencies: { now?: () => string; categories: readonly Category[] }
): Budget {
  const next = createBudget(input, { ...dependencies, idFactory: () => existing.id });
  return { ...next, id: existing.id, createdAt: existing.createdAt };
}

export function budgetKey(budget: Pick<Budget, "categoryId" | "month">): string {
  return `${budget.month}:${budget.categoryId}`;
}

export function calculateBudgetProgress(
  budget: Budget,
  transactions: readonly Transaction[],
  categoryName = "Archived category"
): BudgetProgress {
  const byCurrency = new Map<CurrencyCode, Money>();
  for (const transaction of transactions) {
    if (transaction.type !== "expense" || transaction.categoryId !== budget.categoryId || transaction.date.slice(0, 7) !== budget.month) continue;
    const current = byCurrency.get(transaction.currency) ?? createMoney("0", transaction.currency);
    byCurrency.set(transaction.currency, addMoney(current, createMoney(transaction.amount, transaction.currency)));
  }

  const spent = byCurrency.get(budget.currency) ?? createMoney("0", budget.currency);
  const remaining = subtractMoney(createMoney(budget.amount, budget.currency), spent);
  const percent = new Decimal(spent.amount).dividedBy(budget.amount).times(100);
  const percentUsed = percent.isFinite() ? Math.max(0, percent.toNumber()) : 0;
  const status: BudgetProgressStatus = percentUsed > 100 ? "over_budget" : percentUsed >= 80 ? "attention" : "on_track";

  return {
    budget,
    categoryName,
    spent,
    remaining,
    percentUsed,
    status,
    otherCurrencySpending: [...byCurrency.entries()]
      .filter(([currency]) => currency !== budget.currency)
      .map(([, money]) => money)
  };
}
