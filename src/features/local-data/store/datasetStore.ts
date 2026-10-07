import { datasetEnvelopeSchema } from "../../../platform/persistence/schema";
import { trackLocalChanges } from "../../sync/state";
import { DomainError, errorCode, errorToken } from "../../../domain/errors";
import { create } from "zustand";
import { ZodError } from "zod";

import { isCurrencyCode, normalizeSelectedCurrencies } from "../../../domain/currency";
import { archiveCategory, createCategory, findUncategorizedCategory, renameCategory } from "../../../domain/categories";
import { budgetKey, createBudget, updateBudget } from "../../../domain/budgets";
import { createTransaction, filterTransactions, updateTransaction, type TransactionFilters } from "../../../domain/transactions";
import type { Budget, Category, Dataset, Preferences, Transaction } from "../../../domain/types";
import { calendarMonthSchema, type BudgetInput, type CategoryInput, type TransactionInput } from "../../../domain/validation";
import { DatasetPersistence, runLegacyAccountCacheCleanup } from "../../../platform/persistence";
import type { HydrationState } from "../../../platform/persistence";
import { createUuid } from "../../../platform/identifiers/createUuid";
import { createMockDataset, type MockDatasetPreset } from "../../development/mockData";
import { isLocalDevelopmentRuntime } from "../../../platform/runtime/localDevelopment";
import { canCreateTrackerTransaction, canManageTrackerSettings, canManageTrackerTransaction } from "../../../domain/trackerPermissions";

type SaveStatus = "idle" | "saving" | "error";

export type DatasetStoreState = {
  datasetEpoch: number;
  updateFromSync: (update: (current: Dataset) => Dataset, replace?: boolean) => Promise<boolean>;
  retryLocalSave: () => Promise<MutationResult<null>>;
  hydration: HydrationState;
  dataset: Dataset | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  transactionFilters: TransactionFilters;
  initialize: () => Promise<void>;
  retryHydration: () => Promise<void>;
  recoverLocalData: () => Promise<void>;
  resetLocalData: () => Promise<void>;
  replaceWithMockData: (preset: MockDatasetPreset) => Promise<MutationResult<Dataset>>;
  addTransaction: (input: TransactionInput, id?: string) => Promise<MutationResult<Transaction>>;
  addTransactionDurably: (input: TransactionInput, id: string, expectedGeneration?: number) => Promise<MutationResult<Transaction>>;
  editTransaction: (id: string, input: TransactionInput) => Promise<MutationResult<Transaction>>;
  deleteTransaction: (id: string) => Promise<MutationResult<null>>;
  addBudget: (input: BudgetInput) => Promise<MutationResult<Budget>>;
  editBudget: (id: string, input: BudgetInput) => Promise<MutationResult<Budget>>;
  copyBudgets: (sourceMonth: string, targetMonth: string) => Promise<MutationResult<CopyBudgetsResult>>;
  deleteBudget: (id: string) => Promise<MutationResult<null>>;
  setPreferences: (preferences: Partial<Preferences>) => Promise<MutationResult<Preferences>>;
  addCategory: (input: CategoryInput) => Promise<MutationResult<Category>>;
  renameCategory: (id: string, name: string) => Promise<MutationResult<Category>>;
  archiveCategory: (id: string) => Promise<MutationResult<Category>>;
  deleteCategory: (id: string) => Promise<MutationResult<Category>>;
  setTransactionFilters: (filters: Partial<TransactionFilters>) => void;
  clearTransactionFilters: () => void;
};

export type CopyBudgetsResult = {
  created: readonly Budget[];
  skipped: number;
};
export type MutationResult<T> = { ok: true; value: T } | { ok: false; message: string; recordId?: string };
export type DevicePreferences = Pick<Preferences, "language" | "theme" | "analyticsConsent" | "firstRunNoticeDismissed">;
export type TrackerPrincipal = { subject: string; email: string } | null;
export type DatasetStoreOptions = {
  principal?: () => TrackerPrincipal;
  getDevicePreferences?: () => DevicePreferences | undefined;
  saveDevicePreferences?: (preferences: DevicePreferences) => Promise<boolean>;
  getTrackerContext?: () => Dataset["tracker"];
  onReset?: (dataset: Dataset) => Promise<void>;
  onTargetInvalidated?: () => Promise<void>;
  onDatasetReplaced?: (dataset: Dataset) => Promise<void>;
  isTargetCurrent?: (expectedGeneration?: number) => boolean;
};

function safeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) return errorCode("Check the highlighted fields and try again.");
  if (error instanceof DomainError) return errorToken(error);
  return errorCode("Something went wrong. Try again.");
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

export function createDatasetStore(
  persistence: DatasetPersistence,
  legacyCleanup: () => Promise<void> = runLegacyAccountCacheCleanup,
  options: DatasetStoreOptions = {},
) {
  return create<DatasetStoreState>((set, get) => {
    let initialization: Promise<void> | null = null;
    let persistenceQueue: Promise<void> = Promise.resolve();
    const serializePersistence = async <T,>(operation: () => Promise<T>): Promise<T> => {
      const result = persistenceQueue.then(operation, operation);
      persistenceQueue = result.then(() => undefined, () => undefined);
      return result;
    };

    const decorate = (dataset: Dataset): Dataset => {
      const devicePreferences = options.getDevicePreferences?.();
      return {
        ...dataset,
        ...(options.getTrackerContext?.() ? { tracker: options.getTrackerContext?.() } : {}),
        preferences: devicePreferences ? { ...dataset.preferences, ...devicePreferences } : dataset.preferences,
      };
    };

    const authorizationView = (dataset: Dataset): Dataset => {
      const tracker = options.getTrackerContext?.();
      return tracker ? { ...dataset, tracker } : dataset;
    };

    const commit = async (requested: Dataset, fromSync = false): Promise<boolean> => {
      const previous = get().dataset;
      if (options.getTrackerContext?.()?.access === "revoked") return false;
      const decorated = decorate(requested);
      const dataset = previous && !fromSync ? trackLocalChanges(previous,decorated) : decorated;
      set({ dataset, saveStatus: "saving", saveError: null });
      try {
        await serializePersistence(() => persistence.save(dataset));
        const currentTarget = options.getTrackerContext?.();
        if (currentTarget?.access === "revoked") {
          const retained = decorate(get().dataset ?? dataset);
          set({ dataset: retained, hydration: { status: "ready", dataset: retained }, saveStatus: "idle", saveError: null });
          return false;
        }
        if (get().dataset === dataset) set({ saveStatus: "idle" });
        return true;
      } catch {
        if (get().dataset === dataset) set({ saveStatus: "error", saveError: "local_save_failed_your_change_is_still_visible_retry_to_save_it" });
        return false;
      }
    };

    return {
      datasetEpoch: 0,
      updateFromSync: async (update, replace = false) => {
        const current=get().dataset;
        if (!current || get().saveStatus !== "idle") return false;
        const next=decorate(datasetEnvelopeSchema.parse(update(current)) as Dataset);
        if (!replace) return commit(next,true);
        await options.onTargetInvalidated?.();
        set({ datasetEpoch:get().datasetEpoch+1,dataset:null,hydration:{ status:"loading" },saveStatus:"saving" });
        try {
          await serializePersistence(() => persistence.save(next));
          await options.onDatasetReplaced?.(next);
          set({ dataset:next,hydration:{ status:"ready",dataset:next },saveStatus:"idle",saveError:null });
          return true;
        } catch {
          set({ dataset:current,hydration:{ status:"ready",dataset:current },saveStatus:"error",saveError:"local_save_failed_retry_to_save_your_change" });
          return false;
        }
      },
      retryLocalSave: async () => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        return await commit(dataset) ? { ok: true, value: null } : { ok: false, message: "local_save_failed_retry_to_save_your_change" };
      },
      hydration: { status: "loading" },
      dataset: null,
      saveStatus: "idle",
      saveError: null,
      transactionFilters: {},
      initialize: async () => {
        if (initialization) return initialization;
        if (get().hydration.status === "ready") return;
        initialization = (async () => {
          set({ hydration: { status: "loading" } });
          try {
            await legacyCleanup();
          } catch {
            set({ hydration: { status: "recovery", errorCode: "legacy_cleanup_failed", backupAvailable: false }, dataset: null });
            return;
          }
          const result = await persistence.hydrate();
          if (result.status === "ready") {
            const hydratedDataset = decorate(result.dataset);
            set({ hydration: { status: "ready", dataset: hydratedDataset }, dataset: hydratedDataset,saveStatus:"saving" });
            try {
              await serializePersistence(() => persistence.save(hydratedDataset));
              set({ saveStatus:"idle" });
            } catch {
              set({ saveStatus: "error", saveError: "local_data_could_not_be_saved_retry_from_settings" });
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
      recoverLocalData: async () => {
        await options.onTargetInvalidated?.();
        set({ datasetEpoch: get().datasetEpoch + 1 });
        await serializePersistence(() => persistence.restoreRecoverySnapshot());
        set({ hydration: { status: "loading" }, dataset: null, saveStatus: "idle", saveError: null });
        await get().initialize();
        const restored = get().dataset;
        if (restored) await options.onDatasetReplaced?.(restored);
      },
      resetLocalData: async () => {
        const previous = get().dataset;
        await options.onTargetInvalidated?.();
        set({ datasetEpoch: get().datasetEpoch + 1, dataset: null, hydration: { status: "loading" } });
        try { await serializePersistence(() => persistence.reset()); } catch {
          set({ dataset: previous, hydration: previous ? { status: "ready", dataset: previous } : { status: "recovery", errorCode: "storage_unavailable", backupAvailable: true }, saveStatus: "error", saveError: "local_reset_failed_your_records_remain_available" });
          throw new Error("Local reset failed. Try again.");
        }
        set({ hydration: { status: "loading" }, dataset: null, saveStatus: "idle", saveError: null });
        await get().initialize();
        const resetDataset = get().dataset;
        if (resetDataset) await options.onReset?.(resetDataset);
      },
      replaceWithMockData: async (preset) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        if (!isLocalDevelopmentRuntime()) return { ok: false, message: "mock_data_is_available_only_in_the_local_development_environment" };
        if (dataset.sync?.binding) return { ok: false, message: "confirm_a_local_reset_before_replacing_synced_records_with_fixtures" };
        await options.onTargetInvalidated?.();
        set({ datasetEpoch: get().datasetEpoch + 1 });
        const next = createMockDataset(preset, dataset.datasetId);
        const saved = await commit(next);
        return saved ? { ok: true, value: next } : { ok: false, message: "mock_data_could_not_be_saved_locally" };
      },
      addTransaction: async (input, id) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        const principal = options.principal?.() ?? null;
        if (!canCreateTrackerTransaction(authorizationView(dataset), principal?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        try {
          const existing = id ? dataset.transactions.find((record) => record.id === id) : undefined;
          const transaction = existing ?? createTransaction(input, { categories: dataset.categories, now, idFactory: id ? () => id : undefined });
          if (!existing && dataset.tracker && principal) transaction.creator = { subject: principal.subject, email: principal.email };
          const saved = await commit(existing ? dataset : { ...dataset, transactions: [...dataset.transactions, transaction] });
          return saved ? { ok: true, value: transaction } : { ok: false, message: "local_save_failed_retry_to_save_this_record", recordId: transaction.id };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      addTransactionDurably: async (input, id, expectedGeneration) => {
        const dataset = get().dataset;
        const epoch = get().datasetEpoch;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        const principal = options.principal?.() ?? null;
        if (!canCreateTrackerTransaction(authorizationView(dataset), principal?.subject ?? null) || (options.isTargetCurrent && !options.isTargetCurrent(expectedGeneration))) return { ok: false, message: "tracker_permission_denied" };
        const existing = dataset.transactions.find(record => record.id === id);
        if (existing) {
          if (get().saveStatus !== "idle") {
            const retried = await get().retryLocalSave();
            return retried.ok ? { ok: true, value: existing } : { ok: false, message: retried.message, recordId: id };
          }
          return { ok: true, value: existing };
        }
        if (get().saveStatus !== "idle") return { ok: false, message: "local_data_has_unsaved_changes" };
        try {
          const transaction = createTransaction(input, { categories: dataset.categories, now, idFactory: () => id });
          if (dataset.tracker && principal) transaction.creator = { subject: principal.subject, email: principal.email };
          const next = trackLocalChanges(dataset, { ...dataset, transactions: [...dataset.transactions, transaction] });
          set({ saveStatus: "saving", saveError: null });
          set({ dataset: next, hydration: { status: "ready", dataset: next }, saveStatus: "saving", saveError: null });
          await serializePersistence(() => persistence.save(next));
          if (get().datasetEpoch !== epoch || get().dataset !== next) {
            return { ok: false, message: "local_data_changed_during_save" };
          }
          if (options.isTargetCurrent && !options.isTargetCurrent(expectedGeneration)) {
            const retained = decorate(next);
            set({ dataset: retained, hydration: { status: "ready", dataset: retained }, saveStatus: "idle", saveError: null });
            return { ok: false, message: "tracker_membership_changed", recordId: id };
          }
          set({ dataset: next, saveStatus: "idle", saveError: null });
          return { ok: true, value: transaction };
        } catch (error) {
          if (get().datasetEpoch === epoch && get().dataset && get().dataset?.transactions.some(record => record.id === id)) set({ saveStatus: "error", saveError: "local_watch_recording_save_failed_recording_retained" });
          return { ok: false, message: safeErrorMessage(error), recordId: id };
        }
      },
      editTransaction: async (id, input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        const existing = dataset.transactions.find((transaction) => transaction.id === id);
        if (!existing) return { ok: false, message: "this_transaction_is_no_longer_available" };
        const principal = options.principal?.() ?? null;
        if (!canManageTrackerTransaction(authorizationView(dataset), id, principal?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        try {
          const transaction = { ...updateTransaction(existing, input, { categories: dataset.categories, now }), ...(existing.creator ? { creator: existing.creator } : {}) };
          const saved = await commit({ ...dataset, transactions: dataset.transactions.map((candidate) => candidate.id === id ? transaction : candidate) });
          return saved ? { ok: true, value: transaction } : { ok: false, message: "local_save_failed_retry_to_save_this_record", recordId: transaction.id };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      deleteTransaction: async (id) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        const existing = dataset.transactions.find((transaction) => transaction.id === id);
        if (!existing) return { ok: false, message: "this_transaction_is_no_longer_available" };
        const principal = options.principal?.() ?? null;
        if (!canManageTrackerTransaction(authorizationView(dataset), id, principal?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        if (!await commit({ ...dataset, transactions: dataset.transactions.filter((transaction) => transaction.id !== id) })) return { ok:false,message:"local_save_failed_retry_to_save_your_change" };
        return { ok: true, value: null };
      },
      addBudget: async (input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        if (!canManageTrackerSettings(authorizationView(dataset), options.principal?.()?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        try {
          const budget = createBudget(input, { categories: dataset.categories, idFactory: createUuid, now });
          if (dataset.budgets.some((candidate) => budgetKey(candidate) === budgetKey(budget))) return { ok: false, message: "duplicate_budget" };
          if (!await commit({ ...dataset, budgets: [...dataset.budgets, budget] })) return { ok:false,message:"local_save_failed_retry_to_save_your_change" };
          return { ok: true, value: budget };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      editBudget: async (id, input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        if (!canManageTrackerSettings(authorizationView(dataset), options.principal?.()?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        const existing = dataset.budgets.find((budget) => budget.id === id);
        if (!existing) return { ok: false, message: "this_budget_is_no_longer_available" };
        try {
          const budget = updateBudget(existing, input, { categories: dataset.categories, now });
          if (dataset.budgets.some((candidate) => candidate.id !== id && budgetKey(candidate) === budgetKey(budget))) return { ok: false, message: "duplicate_budget" };
          if (!await commit({ ...dataset, budgets: dataset.budgets.map((candidate) => candidate.id === id ? budget : candidate) })) return { ok:false,message:"local_save_failed_retry_to_save_your_change" };
          return { ok: true, value: budget };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      copyBudgets: async (sourceMonth, targetMonth) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        if (!canManageTrackerSettings(authorizationView(dataset), options.principal?.()?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        if (!calendarMonthSchema.safeParse(sourceMonth).success || !calendarMonthSchema.safeParse(targetMonth).success) {
          return { ok: false, message: "choose_valid_calendar_months_to_copy_budgets" };
        }
        if (sourceMonth === targetMonth) return { ok: false, message: "source_and_target_months_must_be_different" };

        const sourceBudgets = dataset.budgets.filter((budget) => budget.month === sourceMonth);
        if (sourceBudgets.length === 0) return { ok: false, message: "no_budgets_found_in_the_source_month" };

        const targetKeys = new Set(dataset.budgets.filter((budget) => budget.month === targetMonth).map(budgetKey));
        const created: Budget[] = [];
        let skipped = 0;
        for (const sourceBudget of sourceBudgets) {
          if (targetKeys.has(`${targetMonth}:${sourceBudget.categoryId}`)) {
            skipped += 1;
            continue;
          }
          const category = dataset.categories.find((candidate) => candidate.id === sourceBudget.categoryId);
          if (!category || category.kind !== "expense" || category.isArchived) {
            skipped += 1;
            continue;
          }
          try {
            const budget = createBudget(
              { categoryId: sourceBudget.categoryId, month: targetMonth as `${number}-${number}`, amount: sourceBudget.amount, currency: sourceBudget.currency },
              { categories: dataset.categories, idFactory: createUuid, now }
            );
            created.push(budget);
            targetKeys.add(budgetKey(budget));
          } catch (error) {
            return { ok: false, message: safeErrorMessage(error) };
          }
        }
        if (created.length === 0) return { ok: false, message: "no_budgets_are_available_to_copy" };

        const next = { ...dataset, budgets: [...dataset.budgets, ...created] };
        const saved = await commit(next);
        return saved
          ? { ok: true, value: { created, skipped } }
          : { ok: false, message: "budgets_could_not_be_saved_locally_retry_to_save_your_changes" };
      },
      deleteBudget: async (id) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        if (!canManageTrackerSettings(authorizationView(dataset), options.principal?.()?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        if (!dataset.budgets.some((budget) => budget.id === id)) return { ok: false, message: "this_budget_is_no_longer_available" };
        if (!await commit({ ...dataset, budgets: dataset.budgets.filter((budget) => budget.id !== id) })) return { ok:false,message:"local_save_failed_retry_to_save_your_change" };
        return { ok: true, value: null };
      },
      setPreferences: async (preferences) => {
        if (preferences.language !== undefined && !["system", "en", "es"].includes(preferences.language)) return { ok: false, message: "invalid_language" };
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        const requestedBase = preferences.baseCurrency ?? dataset.preferences.baseCurrency;
        if (!isCurrencyCode(requestedBase)) return { ok: false, message: "choose_a_supported_base_currency" };
        const requestedCurrencies = preferences.selectedCurrencies ?? dataset.preferences.selectedCurrencies;
        if (preferences.selectedCurrencies?.some((currency) => !isCurrencyCode(currency))) {
          return { ok: false, message: "choose_supported_currencies" };
        }
        const normalizedCurrencies = normalizeSelectedCurrencies(requestedCurrencies.filter(isCurrencyCode));
        if (normalizedCurrencies.length === 0) return { ok: false, message: "select_at_least_one_desired_currency" };
        if (preferences.selectedCurrencies && !normalizedCurrencies.includes(dataset.preferences.baseCurrency) && requestedBase === dataset.preferences.baseCurrency) {
          return { ok: false, message: "the_current_base_currency_must_remain_selected" };
        }
        const nextCurrencies = normalizeSelectedCurrencies([...normalizedCurrencies, requestedBase]);
        const nextPreferences = { ...dataset.preferences, ...preferences, baseCurrency: requestedBase, selectedCurrencies: nextCurrencies };
        const deviceKeys = ["language", "theme", "analyticsConsent", "firstRunNoticeDismissed"] as const;
        const deviceChanged = deviceKeys.some(key => preferences[key] !== undefined);
        const currenciesChanged = preferences.baseCurrency !== undefined || preferences.selectedCurrencies !== undefined;
        if (deviceChanged && options.saveDevicePreferences) {
          const devicePreferences = { ...(options.getDevicePreferences?.() ?? {
            language: dataset.preferences.language,
            theme: dataset.preferences.theme,
            analyticsConsent: dataset.preferences.analyticsConsent,
            firstRunNoticeDismissed: dataset.preferences.firstRunNoticeDismissed,
          }), ...Object.fromEntries(deviceKeys.filter(key => preferences[key] !== undefined).map(key => [key, preferences[key]])) } as DevicePreferences;
          if (!await options.saveDevicePreferences(devicePreferences)) return { ok: false, message: "local_save_failed_retry_to_save_your_change" };
        }
        if (currenciesChanged && !canManageTrackerSettings(authorizationView(dataset), options.principal?.()?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        if (currenciesChanged) {
          if (!await commit({ ...dataset, preferences: nextPreferences })) return { ok: false, message: "local_save_failed_retry_to_save_your_change" };
        } else if (deviceChanged && !options.saveDevicePreferences) {
          if (!await commit({ ...dataset, preferences: nextPreferences })) return { ok: false, message: "local_save_failed_retry_to_save_your_change" };
        } else {
          const updated = decorate({ ...dataset, preferences: nextPreferences });
          set({ dataset: updated, hydration: { status: "ready", dataset: updated } });
        }
        return { ok: true, value: nextPreferences };
      },
      addCategory: async (input) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        if (!canManageTrackerSettings(authorizationView(dataset), options.principal?.()?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        try {
          const category = createCategory(input, { idFactory: createUuid, now });
          if (hasDuplicateCategoryName(dataset.categories, category)) return { ok: false, message: "duplicate_category" };
          if (!await commit({ ...dataset, categories: [...dataset.categories, category] })) return { ok:false,message:"local_save_failed_retry_to_save_your_change" };
          return { ok: true, value: category };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      renameCategory: async (id, name) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        if (!canManageTrackerSettings(authorizationView(dataset), options.principal?.()?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        const existing = dataset.categories.find((category) => category.id === id);
        if (!existing) return { ok: false, message: "this_category_is_no_longer_available" };
        try {
          const category = renameCategory(existing, name, now());
          if (hasDuplicateCategoryName(dataset.categories, category)) return { ok: false, message: "duplicate_category" };
          if (!await commit({ ...dataset, categories: dataset.categories.map((candidate) => candidate.id === id ? category : candidate) })) return { ok:false,message:"local_save_failed_retry_to_save_your_change" };
          return { ok: true, value: category };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      archiveCategory: async (id) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        if (!canManageTrackerSettings(authorizationView(dataset), options.principal?.()?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        const existing = dataset.categories.find((category) => category.id === id);
        if (!existing) return { ok: false, message: "this_category_is_no_longer_available" };
        try {
          const category = archiveCategory(existing, now());
          if (!await commit({ ...dataset, categories: dataset.categories.map((candidate) => candidate.id === id ? category : candidate) })) return { ok:false,message:"local_save_failed_retry_to_save_your_change" };
          return { ok: true, value: category };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      deleteCategory: async (id) => {
        const dataset = get().dataset;
        if (!dataset) return { ok: false, message: "local_data_is_still_loading" };
        if (!canManageTrackerSettings(authorizationView(dataset), options.principal?.()?.subject ?? null)) return { ok: false, message: "tracker_permission_denied" };
        const existing = dataset.categories.find((category) => category.id === id);
        if (!existing) return { ok: false, message: "this_category_is_no_longer_available" };
        if (existing.isSystem) return { ok: false, message: "protected_categories_cannot_be_deleted" };
        try {
          const fallback = findUncategorizedCategory(dataset.categories, existing.kind);
          const reassignedKeys=new Set<string>();
          for (const budget of dataset.budgets) {
            const key=`${budget.month}:${budget.categoryId===id ? fallback.id : budget.categoryId}`;
            if (reassignedKeys.has(key)) return { ok:false,message:"duplicate_budget" };
            reassignedKeys.add(key);
          }
          const deletedAt = now();
          const next: Dataset = {
            ...dataset,
            categories: dataset.categories.filter((category) => category.id !== id),
            transactions: dataset.transactions.map((transaction) => transaction.categoryId === id ? { ...transaction, categoryId: fallback.id, updatedAt: deletedAt } : transaction),
            budgets: dataset.budgets.map((budget) => budget.categoryId === id ? { ...budget, categoryId: fallback.id, updatedAt: deletedAt } : budget),
            categoryDeletionTombstones: [...dataset.categoryDeletionTombstones, { recordType: "category", recordId: id, deletedAt }]
          };
          if (!await commit(next)) return { ok:false,message:"local_save_failed_retry_to_save_your_change" };
          return { ok: true, value: fallback };
        } catch (error) {
          return { ok: false, message: safeErrorMessage(error) };
        }
      },
      setTransactionFilters: (filters) => set((state) => {
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

export function selectFilteredTransactions(state: DatasetStoreState): Transaction[] {
  return state.dataset ? filterTransactions(state.dataset.transactions, state.transactionFilters) : [];
}
