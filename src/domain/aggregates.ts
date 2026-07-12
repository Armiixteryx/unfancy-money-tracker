import Decimal from "decimal.js";

import { type CurrencyCode } from "./currency";
import { addMoney, convertMoney, createMoney, type Money } from "./money";
import type { Budget, Category, Transaction } from "./types";

type AggregateRateRecord = {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: string;
  effectiveDate: string;
  fetchedAt: string;
  provider: string;
  status: "fresh" | "stale";
};

export type CurrencyAggregate = {
  currency: CurrencyCode;
  income: Money;
  expenses: Money;
  transactionCount: number;
};

export type CategoryAggregate = {
  categoryId: string;
  categoryName: string;
  currency: CurrencyCode;
  spent: Money;
};

export type ConvertedMonthAggregate = {
  currency: CurrencyCode;
  income: Money;
  expenses: Money;
  transactionCount: number;
  unavailableCurrencies: readonly CurrencyCode[];
  rates: readonly AggregateRateRecord[];
};

export function currentCalendarMonth(date = new Date()): `${number}-${number}` {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` as `${number}-${number}`;
}

export function aggregateMonthByCurrency(
  transactions: readonly Transaction[],
  month: string
): CurrencyAggregate[] {
  const aggregates = new Map<CurrencyCode, CurrencyAggregate>();
  for (const transaction of transactions) {
    if (!transaction.date.startsWith(month)) continue;
    const current = aggregates.get(transaction.currency) ?? {
      currency: transaction.currency,
      income: createMoney("0", transaction.currency),
      expenses: createMoney("0", transaction.currency),
      transactionCount: 0
    };
    const amount = createMoney(transaction.amount, transaction.currency);
    aggregates.set(transaction.currency, {
      ...current,
      income: transaction.type === "income" ? addMoney(current.income, amount) : current.income,
      expenses: transaction.type === "expense" ? addMoney(current.expenses, amount) : current.expenses,
      transactionCount: current.transactionCount + 1
    });
  }
  return [...aggregates.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}

export function convertMonthAggregate(
  transactions: readonly Transaction[],
  month: string,
  baseCurrency: CurrencyCode,
  getRate: (currency: CurrencyCode, date: string) => RateRecord | undefined
): ConvertedMonthAggregate {
  let income = createMoney("0", baseCurrency);
  let expenses = createMoney("0", baseCurrency);
  let transactionCount = 0;
  const unavailableCurrencies = new Set<CurrencyCode>();
  const rates = new Map<string, AggregateRateRecord>();

  for (const transaction of transactions) {
    if (!transaction.date.startsWith(month)) continue;
    transactionCount += 1;
    const rate: AggregateRateRecord | undefined = transaction.currency === baseCurrency
      ? { base: baseCurrency, quote: baseCurrency, rate: "1", effectiveDate: transaction.date, fetchedAt: new Date(0).toISOString(), provider: "same-currency" as const, status: "fresh" as const }
      : getRate(transaction.currency, transaction.date);
    if (!rate) {
      unavailableCurrencies.add(transaction.currency);
      continue;
    }
    rates.set(transaction.currency, rate);
    const converted = convertMoney(createMoney(transaction.amount, transaction.currency), baseCurrency, rate.rate);
    if (transaction.type === "income") income = addMoney(income, converted);
    else expenses = addMoney(expenses, converted);
  }

  return {
    currency: baseCurrency,
    income,
    expenses,
    transactionCount,
    unavailableCurrencies: [...unavailableCurrencies].sort(),
    rates: [...rates.values()]
  };
}

export function aggregateCategorySpending(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  month: string
): CategoryAggregate[] {
  const aggregates = new Map<string, CategoryAggregate>();
  for (const transaction of transactions) {
    if (transaction.type !== "expense" || !transaction.date.startsWith(month)) continue;
    const category = categories.find((candidate) => candidate.id === transaction.categoryId);
    const categoryName = category?.name ?? "Archived category";
    const key = `${transaction.categoryId}:${transaction.currency}`;
    const current = aggregates.get(key) ?? {
      categoryId: transaction.categoryId,
      categoryName,
      currency: transaction.currency,
      spent: createMoney("0", transaction.currency)
    };
    aggregates.set(key, { ...current, spent: addMoney(current.spent, createMoney(transaction.amount, transaction.currency)) });
  }
  return [...aggregates.values()].sort((left, right) => new Decimal(right.spent.amount).comparedTo(left.spent.amount));
}

export function totalBudgetForMonth(budgets: readonly Budget[], month: string, currency: CurrencyCode): Money | null {
  const matching = budgets.filter((budget) => budget.month === month && budget.currency === currency);
  if (matching.length === 0) return null;
  return matching.reduce((total, budget) => addMoney(total, createMoney(budget.amount, currency)), createMoney("0", currency));
}
