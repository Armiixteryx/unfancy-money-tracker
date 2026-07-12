import { normalizeMoneyAmount } from "./money";
import { assertCategoryMatchesTransaction, transactionInputSchema, type TransactionInput } from "./validation";
import type { Category, Transaction, TransactionType, UUID } from "./types";
import { createUuid } from "../platform/identifiers/createUuid";

export function createTransaction(
  input: TransactionInput,
  dependencies: { idFactory?: () => UUID; now?: () => string; categories: readonly Category[] }
): Transaction {
  const parsed = transactionInputSchema.parse(input);
  const category = dependencies.categories.find((candidate) => candidate.id === parsed.categoryId);
  if (!category) {
    throw new Error("Select an existing category");
  }
  if (category.isArchived) {
    throw new Error("Archived categories cannot be selected for new transactions");
  }
  assertCategoryMatchesTransaction(category.kind, parsed.type);

  const now = dependencies.now?.() ?? new Date().toISOString();
  return {
    id: dependencies.idFactory?.() ?? createUuid(),
    amount: normalizeMoneyAmount(parsed.amount, parsed.currency, { allowNegative: false, allowZero: false }),
    currency: parsed.currency,
    type: parsed.type,
    categoryId: parsed.categoryId,
    description: parsed.description.trim(),
    date: parsed.date,
    createdAt: now,
    updatedAt: now
  };
}

export function updateTransaction(
  existing: Transaction,
  input: TransactionInput,
  dependencies: { now?: () => string; categories: readonly Category[] }
): Transaction {
  const next = createTransaction(input, { ...dependencies, idFactory: () => existing.id });
  return { ...next, id: existing.id, createdAt: existing.createdAt };
}

export type TransactionFilters = {
  query?: string;
  type?: TransactionType | "all";
  categoryId?: string | "all";
  currency?: string | "all";
  fromDate?: string;
  toDate?: string;
};

export function filterTransactions(
  transactions: readonly Transaction[],
  filters: TransactionFilters
): Transaction[] {
  const query = filters.query?.trim().toLocaleLowerCase();
  return transactions
    .filter((transaction) => {
      if (filters.type && filters.type !== "all" && transaction.type !== filters.type) return false;
      if (filters.categoryId && filters.categoryId !== "all" && transaction.categoryId !== filters.categoryId) return false;
      if (filters.currency && filters.currency !== "all" && transaction.currency !== filters.currency) return false;
      if (filters.fromDate && transaction.date < filters.fromDate) return false;
      if (filters.toDate && transaction.date > filters.toDate) return false;
      if (query && !transaction.description.toLocaleLowerCase().includes(query)) return false;
      return true;
    })
    .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt));
}
