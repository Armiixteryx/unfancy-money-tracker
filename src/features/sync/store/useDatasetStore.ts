import { create } from "zustand";
import { ZodError } from "zod";

import { createTransaction, filterTransactions, updateTransaction, type TransactionFilters } from "../../../domain/transactions";
import type { TransactionInput } from "../../../domain/validation";
import type { Dataset, Transaction } from "../../../domain/types";
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
  setTransactionFilters: (filters: Partial<TransactionFilters>) => void;
  clearTransactionFilters: () => void;
};

type MutationResult<T> = { ok: true; value: T } | { ok: false; message: string };

function safeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) return "Check the highlighted fields and try again.";
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}

function now(): string {
  return new Date().toISOString();
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
