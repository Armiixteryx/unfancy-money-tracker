import { DomainError } from "./errors";
import Decimal from "decimal.js";

import { addMoney, convertMoney, createMoney, normalizeMoneyAmount, subtractMoney, type Money } from "./money";
import type { CurrencyCode } from "./currency";
import { budgetInputSchema, plannedExpenseInputSchema, type BudgetInput, type PlannedExpenseInput } from "./validation";
import type { Budget, BudgetPlannedExpense, CalendarMonth, Category, Transaction, UUID } from "./types";
import { createUuid } from "../platform/identifiers/createUuid";
import type { RateRecord } from "../platform/exchange-rates/types";

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

export type PlannedExpenseTotals = {
  currency: CurrencyCode;
  total: Money | null;
  originalTotals: readonly Money[];
  unavailableCurrencies: readonly CurrencyCode[];
  rates: readonly RateRecord[];
};

export function createBudgetPlannedExpense(
  input: PlannedExpenseInput,
  dependencies: { idFactory?: () => UUID } = {}
): BudgetPlannedExpense {
  const parsed = plannedExpenseInputSchema.parse(input);
  return {
    id: dependencies.idFactory?.() ?? createUuid(),
    description: parsed.description,
    amount: normalizeMoneyAmount(parsed.amount, parsed.currency, { allowNegative: false, allowZero: false }),
    currency: parsed.currency
  };
}

export function updateBudgetPlannedExpense(
  existing: BudgetPlannedExpense,
  input: PlannedExpenseInput
): BudgetPlannedExpense {
  return { ...createBudgetPlannedExpense(input, { idFactory: () => existing.id }), id: existing.id };
}

export function calculatePlannedExpenseTotals(
  plannedExpenses: readonly BudgetPlannedExpense[] | undefined,
  budgetCurrency: CurrencyCode,
  getLatestRate: (sourceCurrency: CurrencyCode, targetCurrency: CurrencyCode) => RateRecord | undefined
): PlannedExpenseTotals {
  const originalTotals = new Map<CurrencyCode, Money>();
  const rates = new Map<string, RateRecord>();
  const unavailableCurrencies = new Set<CurrencyCode>();
  let total = createMoney("0", budgetCurrency);

  for (const expense of plannedExpenses ?? []) {
    const original = createMoney(expense.amount, expense.currency);
    originalTotals.set(expense.currency, addMoney(originalTotals.get(expense.currency) ?? createMoney("0", expense.currency), original));

    if (expense.currency === budgetCurrency) {
      total = addMoney(total, createMoney(expense.amount, budgetCurrency));
      continue;
    }

    const rate = getLatestRate(expense.currency, budgetCurrency);
    if (!rate || rate.base !== expense.currency || rate.quote !== budgetCurrency) {
      unavailableCurrencies.add(expense.currency);
      continue;
    }
    rates.set(`${rate.base}:${rate.quote}`, rate);
    total = addMoney(total, convertMoney(original, budgetCurrency, rate.rate));
  }

  return {
    currency: budgetCurrency,
    total: unavailableCurrencies.size === 0 ? total : null,
    originalTotals: [...originalTotals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, money]) => money),
    unavailableCurrencies: [...unavailableCurrencies].sort(),
    rates: [...rates.values()]
  };
}

export function createBudget(
  input: BudgetInput,
  dependencies: { idFactory?: () => UUID; now?: () => string; categories: readonly Category[] }
): Budget {
  const parsed = budgetInputSchema.parse(input);
  const category = dependencies.categories.find((candidate) => candidate.id === parsed.categoryId);
  if (!category || category.kind !== "expense") throw new DomainError("Select an expense category");
  if (category.isArchived) throw new DomainError("Archived categories cannot receive new budgets");

  const now = dependencies.now?.() ?? new Date().toISOString();
  return {
    id: dependencies.idFactory?.() ?? createUuid(),
    categoryId: parsed.categoryId,
    month: parsed.month as CalendarMonth,
    amount: normalizeMoneyAmount(parsed.amount, parsed.currency, { allowNegative: false, allowZero: false }),
    currency: parsed.currency,
    plannedExpenses: (parsed.plannedExpenses ?? []).map((expense) => ({
      ...expense,
      amount: normalizeMoneyAmount(expense.amount, expense.currency, { allowNegative: false, allowZero: false })
    })),
    createdAt: now,
    updatedAt: now
  };
}

export function updateBudget(
  existing: Budget,
  input: BudgetInput,
  dependencies: { now?: () => string; categories: readonly Category[] }
): Budget {
  const next = createBudget({
    ...input,
    plannedExpenses: [...(input.plannedExpenses ?? existing.plannedExpenses ?? [])]
  }, { ...dependencies, idFactory: () => existing.id });
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
