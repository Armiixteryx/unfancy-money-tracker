import { create } from "zustand";
import { ZodError } from "zod";
import { v4 as uuid } from "uuid";

import { archiveCategory, createCategory, findUncategorizedCategory, renameCategory } from "../../../domain/categories";
import { budgetKey, createBudget, updateBudget } from "../../../domain/budgets";
import { createTransaction, filterTransactions, updateTransaction, type TransactionFilters } from "../../../domain/transactions";
import type { Budget, Category, Dataset, Preferences, Transaction } from "../../../domain/types";
import type { BudgetInput, CategoryInput, TransactionInput } from "../../../domain/validation";
import { createPersistenceAdapter, DatasetPersistence } from "../../../platform/persistence";
import type { HydrationState } from "../../../platform/persistence";

type SaveStatus = "idle" | "saving" | "error";

export type DatasetStoreState = {
  hydration: HydrationState;
  dataset: Dataset | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  transactionFilters: TransactionFilters;
  initialize: () => Promise<void>;
  retryHydration: () => Promise<void>;
  resetLocalData: () => Promise<void>;
  addTransaction: (input: TransactionInput) => Promise<MutationResult<Transaction>>;
  editTransaction: (id: string, input: TransactionInput) => Promise<MutationResult<Transaction>>;
  deleteTransaction: (id: string) => Promise<MutationResult<null>>;
  addBudget: (input: BudgetInput) => Promise<MutationResult<Budget>>;
  editBudget: (id: string, input: BudgetInput) => Promise<MutationResult<Budget>>;
  deleteBudget: (id: string) => Promise<MutationResult<null>>;
  setPreferences: (preferences: Partial<Preferences>) => Promise<MutationResult<Preferences>>;
  addCategory: (input: CategoryInput) => Promise<MutationResult<Category>>;
  renameCategory: (id: string, name: string) => Promise<MutationResult<Category>>;
  archiveCategory: (id: string) => Promise<MutationResult<Category>>;
  deleteCategory: (id: string) => Promise<MutationResult<Category>>;
  setTransactionFilters: (filters: Partial<TransactionFilters>) => void;
  clearTransactionFilters: () => void;
};

export type MutationResult<T> = { ok: true; value: T } | { ok: false; message: string };

function safeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) return "Check the highlighted fields and try again.";
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}

function now(): string {
  return new Date().toISOString();
}

function hasDuplicateCategoryName(categories: readonly Category[], category: Category): boolean {
  const normalized = category.name.toLocaleLowerCase();
  return categories.some(
    (candidate) => candidate.id !== category.id && candidate.kind === category.kind && candidate.name.toLocaleLowerCase() === normalized
  );
}

export function createDatasetStore(persistence: DatasetPersistence) {
  return create<DatasetStoreState>((set, get) => {
    let initialization: Promise<void> | null = null;

    const commit = async (dataset: Dataset): Promise<boolean> => {
      set({ dataset, saveStatus: "saving", saveError: null });
      try {
        await persistence.save(dataset);
        set({ saveStatus: "idle" });
        return true;
      } catch {
        set({ saveStatus: "error", saveError: "Local save failed. Your change is still visible; retry to save it." });
        return false;
      }
    };

    return {
      hydration: { status: "loading" },
      dataset: null,
      saveStatus: "idle",
      saveError: null,
      transactionFilters: {},
      initialize: async () => {
        if (initialization) return initialization;
        initialization = (async () => {
          set({ hydration: { status: "loading" } });
          const result = await persistence.hydrate();
          if (result.status === "ready") {
            set({ hydration: result, dataset: result.dataset });
            try {
              await persistence.save(result.dataset);
            } catch {
              set({ saveStatus: "error", saveError: "Local data could not be saved. Retry from Settings." });
            }
          } else {
            set({ hydration: result, dataset: null });
          }
        })().finally(() => {
          initialization = null;
        });
        return initialization;
      },
      retryHydration: async () => {
        await get().initialize();
      },
      resetLocalData: async () => {
        await persistence.reset();
        set({ hydration: { status: "loading" }, dataset: null, saveStatus: "idle", saveError: null });
        await get().initialize();
      },
      addTransaction: async (input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        try {
          const transaction = createTransaction(input, { categories: dataset.categories, now });
          const next = { ...dataset, transactions: [...dataset.transactions, transaction] };
          await commit(next);
          return { ok: true, value: transaction };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      editTransaction: async (id, input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        const existing = dataset.transactions.find((transaction) => transaction.id === id);
        if (!existing) return { ok: false, message: "This transaction is no longer available." };
        try {
          const transaction = updateTransaction(existing, input, { categories: dataset.categories, now });
          const next = {
            ...dataset,
            transactions: dataset.transactions.map((candidate) => (candidate.id === id ? transaction : candidate))
          };
          await commit(next);
          return { ok: true, value: transaction };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      deleteTransaction: async (id) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        if (!dataset.transactions.some((transaction) => transaction.id === id)) {
          return { ok: false, message: "This transaction is no longer available." };
        }
        const next: Dataset = {
          ...dataset,
          transactions: dataset.transactions.filter((transaction) => transaction.id !== id),
          recordTombstones: [
            ...dataset.recordTombstones,
            { recordType: "transaction", recordId: id, deletedAt: now() }
          ]
        };
        await commit(next);
        return { ok: true, value: null };
      },
      addBudget: async (input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        try {
          const budget = createBudget(input, { categories: dataset.categories, idFactory: uuid, now });
          if (dataset.budgets.some((candidate) => budgetKey(candidate) === budgetKey(budget))) {
            return { ok: false, message: "A budget already exists for this category and month." };
          }
          await commit({ ...dataset, budgets: [...dataset.budgets, budget] });
          return { ok: true, value: budget };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      editBudget: async (id, input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        const existing = dataset.budgets.find((budget) => budget.id === id);
        if (!existing) return { ok: false, message: "This budget is no longer available." };
        try {
          const budget = updateBudget(existing, input, { categories: dataset.categories, now });
          if (dataset.budgets.some((candidate) => candidate.id !== id && budgetKey(candidate) === budgetKey(budget))) {
            return { ok: false, message: "A budget already exists for this category and month." };
          }
          const next = { ...dataset, budgets: dataset.budgets.map((candidate) => (candidate.id === id ? budget : candidate)) };
          await commit(next);
          return { ok: true, value: budget };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      deleteBudget: async (id) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        if (!dataset.budgets.some((budget) => budget.id === id)) return { ok: false, message: "This budget is no longer available." };
        const deletedAt = now();
        const next: Dataset = {
          ...dataset,
          budgets: dataset.budgets.filter((budget) => budget.id !== id),
          recordTombstones: [...dataset.recordTombstones, { recordType: "budget", recordId: id, deletedAt }]
        };
        await commit(next);
        return { ok: true, value: null };
      },
      setPreferences: async (preferences) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        const nextPreferences = { ...dataset.preferences, ...preferences };
        await commit({ ...dataset, preferences: nextPreferences });
        return { ok: true, value: nextPreferences };
      },
      addCategory: async (input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        try {
          const category = createCategory(input, { idFactory: uuid, now });
          if (hasDuplicateCategoryName(dataset.categories, category)) return { ok: false, message: "A category with this name already exists." };
          await commit({ ...dataset, categories: [...dataset.categories, category] });
          return { ok: true, value: category };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      renameCategory: async (id, name) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        const existing = dataset.categories.find((category) => category.id === id);
        if (!existing) return { ok: false, message: "This category is no longer available." };
        try {
          const category = renameCategory(existing, name, now());
          if (hasDuplicateCategoryName(dataset.categories, category)) return { ok: false, message: "A category with this name already exists." };
          await commit({ ...dataset, categories: dataset.categories.map((candidate) => (candidate.id === id ? category : candidate)) });
          return { ok: true, value: category };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      archiveCategory: async (id) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        const existing = dataset.categories.find((category) => category.id === id);
        if (!existing) return { ok: false, message: "This category is no longer available." };
        try {
          const category = archiveCategory(existing, now());
          await commit({ ...dataset, categories: dataset.categories.map((candidate) => (candidate.id === id ? category : candidate)) });
          return { ok: true, value: category };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      deleteCategory: async (id) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        const existing = dataset.categories.find((category) => category.id === id);
        if (!existing) return { ok: false, message: "This category is no longer available." };
        if (existing.isSystem) return { ok: false, message: "Protected Uncategorized categories cannot be deleted." };
        try {
          const fallback = findUncategorizedCategory(dataset.categories, existing.kind);
          const deletedAt = now();
          const next: Dataset = {
            ...dataset,
            categories: dataset.categories.filter((category) => category.id !== id),
            transactions: dataset.transactions.map((transaction) => transaction.categoryId === id ? { ...transaction, categoryId: fallback.id, updatedAt: deletedAt } : transaction),
            budgets: dataset.budgets.map((budget) => budget.categoryId === id ? { ...budget, categoryId: fallback.id, updatedAt: deletedAt } : budget),
            categoryDeletionTombstones: [...dataset.categoryDeletionTombstones, { recordType: "category", recordId: id, deletedAt }],
            recordTombstones: [...dataset.recordTombstones, { recordType: "category", recordId: id, deletedAt }]
          };
          await commit(next);
          return { ok: true, value: fallback };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      setTransactionFilters: (filters) =>
        set((state) => ({ transactionFilters: { ...state.transactionFilters, ...filters } })),
      clearTransactionFilters: () => set({ transactionFilters: {} })
    };
  });
}

const persistence = new DatasetPersistence(createPersistenceAdapter("anonymous"));
export const useDatasetStore = createDatasetStore(persistence);

export function selectFilteredTransactions(state: DatasetStoreState): Transaction[] {
  return state.dataset ? filterTransactions(state.dataset.transactions, state.transactionFilters) : [];
}
