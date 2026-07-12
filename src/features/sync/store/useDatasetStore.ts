import { create } from "zustand";
import { ZodError } from "zod";

import { archiveCategory, createCategory, findUncategorizedCategory, renameCategory } from "../../../domain/categories";
import { budgetKey, createBudget, updateBudget } from "../../../domain/budgets";
import { createTransaction, filterTransactions, updateTransaction, type TransactionFilters } from "../../../domain/transactions";
import type { Budget, Category, Dataset, Preferences, SyncChange, SyncMetadata, Transaction } from "../../../domain/types";
import type { BudgetInput, CategoryInput, TransactionInput } from "../../../domain/validation";
import { createPersistenceAdapter, DatasetPersistence } from "../../../platform/persistence";
import type { HydrationState } from "../../../platform/persistence";
import { createUuid } from "../../../platform/identifiers/createUuid";
import { mergeAccountDatasets } from "../services";

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
  setSyncMetadata: (sync: Partial<SyncMetadata>) => Promise<MutationResult<SyncMetadata>>;
  applyRemoteMerge: (dataset: Dataset) => Promise<MutationResult<Dataset>>;
  switchToAccountNamespace: (accountId: string) => Promise<MutationResult<Dataset>>;
  switchToAnonymousNamespace: (clearAccountCache: boolean) => Promise<MutationResult<Dataset>>;
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

type SyncChangeInput = Pick<SyncChange, "recordType" | "recordId" | "operation" | "payload" | "tombstone">;

function syncKey(recordType: SyncChange["recordType"], recordId: string): string {
  return `${recordType}:${recordId}`;
}

function enqueueSyncChanges(dataset: Dataset, inputs: readonly SyncChangeInput[]): Dataset {
  let outbox = [...dataset.sync.outbox];
  const revisions = { ...dataset.sync.revisions };
  for (const input of inputs) {
    const key = syncKey(input.recordType, input.recordId);
    const previous = outbox.find((change) => syncKey(change.recordType, change.recordId) === key);
    const baseRevision = previous?.baseRevision ?? revisions[key] ?? 0;
    outbox = outbox.filter((change) => syncKey(change.recordType, change.recordId) !== key);
    outbox.push({
      ...input,
      idempotencyKey: createUuid(),
      baseRevision,
      revision: baseRevision + 1
    });
  }
  return {
    ...dataset,
    sync: {
      ...dataset.sync,
      outbox,
      status: "stale",
      reason: "Local changes are waiting for optional cloud sync."
    }
  };
}

export function createDatasetStore(persistence: DatasetPersistence) {
  return create<DatasetStoreState>((set, get) => {
    let initialization: Promise<void> | null = null;
    let activePersistence = persistence;
    let activeNamespace = "anonymous";

    const commit = async (dataset: Dataset): Promise<boolean> => {
      set({ dataset, saveStatus: "saving", saveError: null });
      try {
        await activePersistence.save(dataset);
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
          const result = await activePersistence.hydrate();
          if (result.status === "ready") {
            set({ hydration: result, dataset: result.dataset });
            try {
              await activePersistence.save(result.dataset);
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
        await activePersistence.reset();
        set({ hydration: { status: "loading" }, dataset: null, saveStatus: "idle", saveError: null });
        await get().initialize();
      },
      addTransaction: async (input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        try {
          const transaction = createTransaction(input, { categories: dataset.categories, now });
          const next = enqueueSyncChanges({ ...dataset, transactions: [...dataset.transactions, transaction] }, [{ recordType: "transaction", recordId: transaction.id, operation: "upsert", payload: transaction, tombstone: false }]);
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
          const next = enqueueSyncChanges({
            ...dataset,
            transactions: dataset.transactions.map((candidate) => (candidate.id === id ? transaction : candidate))
          }, [{ recordType: "transaction", recordId: transaction.id, operation: "upsert", payload: transaction, tombstone: false }]);
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
        const next: Dataset = enqueueSyncChanges({
          ...dataset,
          transactions: dataset.transactions.filter((transaction) => transaction.id !== id),
          recordTombstones: [
            ...dataset.recordTombstones,
            { recordType: "transaction", recordId: id, deletedAt: now() }
          ]
        }, [{ recordType: "transaction", recordId: id, operation: "delete", payload: null, tombstone: true }]);
        await commit(next);
        return { ok: true, value: null };
      },
      addBudget: async (input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        try {
          const budget = createBudget(input, { categories: dataset.categories, idFactory: createUuid, now });
          if (dataset.budgets.some((candidate) => budgetKey(candidate) === budgetKey(budget))) {
            return { ok: false, message: "A budget already exists for this category and month." };
          }
          await commit(enqueueSyncChanges({ ...dataset, budgets: [...dataset.budgets, budget] }, [{ recordType: "budget", recordId: budget.id, operation: "upsert", payload: budget, tombstone: false }]));
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
          const next = enqueueSyncChanges({ ...dataset, budgets: dataset.budgets.map((candidate) => (candidate.id === id ? budget : candidate)) }, [{ recordType: "budget", recordId: budget.id, operation: "upsert", payload: budget, tombstone: false }]);
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
        const next: Dataset = enqueueSyncChanges({
          ...dataset,
          budgets: dataset.budgets.filter((budget) => budget.id !== id),
          recordTombstones: [...dataset.recordTombstones, { recordType: "budget", recordId: id, deletedAt }]
        }, [{ recordType: "budget", recordId: id, operation: "delete", payload: null, tombstone: true }]);
        await commit(next);
        return { ok: true, value: null };
      },
      setPreferences: async (preferences) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        const nextPreferences = { ...dataset.preferences, ...preferences };
        await commit(enqueueSyncChanges({ ...dataset, preferences: nextPreferences }, [{ recordType: "preference", recordId: dataset.datasetId, operation: "upsert", payload: nextPreferences, tombstone: false }]));
        return { ok: true, value: nextPreferences };
      },
      setSyncMetadata: async (sync) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        const nextSync = { ...dataset.sync, ...sync };
        await commit({ ...dataset, sync: nextSync });
        return { ok: true, value: nextSync };
      },
      applyRemoteMerge: async (dataset) => {
        await commit(dataset);
        return { ok: true, value: dataset };
      },
      switchToAccountNamespace: async (accountId) => {
        const current = get().dataset;
        if (!current) return { ok: false, message: "Local data is still loading." };
        const nextPersistence = new DatasetPersistence(createPersistenceAdapter(`account:${accountId}`));
        const result = await nextPersistence.hydrate();
        if (result.status !== "ready") return { ok: false, message: "The account cache needs recovery before it can be opened." };
        const hasSnapshot = await nextPersistence.hasSnapshot();
        const merged = hasSnapshot ? mergeAccountDatasets(current, result.dataset) : current;
        activePersistence = nextPersistence;
        activeNamespace = `account:${accountId}`;
        set({ hydration: { status: "ready", dataset: merged }, dataset: merged, saveStatus: "saving", saveError: null });
        try {
          await activePersistence.save(merged);
          set({ saveStatus: "idle" });
          return { ok: true, value: merged };
        } catch {
          set({ saveStatus: "error", saveError: "The account cache could not be saved." });
          return { ok: false, message: "The account cache could not be saved." };
        }
      },
      switchToAnonymousNamespace: async (clearAccountCache) => {
        if (clearAccountCache && activeNamespace !== "anonymous") await activePersistence.reset();
        const nextPersistence = new DatasetPersistence(createPersistenceAdapter("anonymous"));
        const result = await nextPersistence.hydrate();
        if (result.status !== "ready") return { ok: false, message: "The anonymous local cache needs recovery before it can be opened." };
        activePersistence = nextPersistence;
        activeNamespace = "anonymous";
        const nextDataset = result.dataset;
        set({ hydration: { status: "ready", dataset: nextDataset }, dataset: nextDataset, saveStatus: "idle", saveError: null });
        return { ok: true, value: nextDataset };
      },
      addCategory: async (input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "Local data is still loading." };
        try {
          const category = createCategory(input, { idFactory: createUuid, now });
          if (hasDuplicateCategoryName(dataset.categories, category)) return { ok: false, message: "A category with this name already exists." };
          await commit(enqueueSyncChanges({ ...dataset, categories: [...dataset.categories, category] }, [{ recordType: "category", recordId: category.id, operation: "upsert", payload: category, tombstone: false }]));
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
          await commit(enqueueSyncChanges({ ...dataset, categories: dataset.categories.map((candidate) => (candidate.id === id ? category : candidate)) }, [{ recordType: "category", recordId: category.id, operation: "upsert", payload: category, tombstone: false }]));
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
          await commit(enqueueSyncChanges({ ...dataset, categories: dataset.categories.map((candidate) => (candidate.id === id ? category : candidate)) }, [{ recordType: "category", recordId: category.id, operation: "upsert", payload: category, tombstone: false }]));
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
          const updatedTransactions = dataset.transactions.map((transaction) => transaction.categoryId === id ? { ...transaction, categoryId: fallback.id, updatedAt: deletedAt } : transaction);
          const updatedBudgets = dataset.budgets.map((budget) => budget.categoryId === id ? { ...budget, categoryId: fallback.id, updatedAt: deletedAt } : budget);
          const next: Dataset = enqueueSyncChanges({
            ...dataset,
            categories: dataset.categories.filter((category) => category.id !== id),
            transactions: updatedTransactions,
            budgets: updatedBudgets,
            categoryDeletionTombstones: [...dataset.categoryDeletionTombstones, { recordType: "category", recordId: id, deletedAt }],
            recordTombstones: [...dataset.recordTombstones, { recordType: "category", recordId: id, deletedAt }]
          }, [
            { recordType: "category", recordId: id, operation: "delete", payload: null, tombstone: true },
            ...updatedTransactions.filter((transaction, index) => transaction !== dataset.transactions[index]).map((transaction) => ({ recordType: "transaction" as const, recordId: transaction.id, operation: "upsert" as const, payload: transaction, tombstone: false })),
            ...updatedBudgets.filter((budget, index) => budget !== dataset.budgets[index]).map((budget) => ({ recordType: "budget" as const, recordId: budget.id, operation: "upsert" as const, payload: budget, tombstone: false }))
          ]);
          await commit(next);
          return { ok: true, value: fallback };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      setTransactionFilters: (filters) =>
        set((state) => {
          const next = { ...state.transactionFilters, ...filters };
          for (const key of Object.keys(next) as (keyof TransactionFilters)[]) {
            const value = next[key];
            if (value === undefined || value === "" || value === "all") delete next[key];
          }
          return { transactionFilters: next };
        }),
      clearTransactionFilters: () => set({ transactionFilters: {} })
    };
  });
}

const persistence = new DatasetPersistence(createPersistenceAdapter("anonymous"));
export const useDatasetStore = createDatasetStore(persistence);

export function selectFilteredTransactions(state: DatasetStoreState): Transaction[] {
  return state.dataset ? filterTransactions(state.dataset.transactions, state.transactionFilters) : [];
}
