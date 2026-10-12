import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create as createStore, type StoreApi, type UseBoundStore } from "zustand";

import { createBudget } from "../../../domain/budgets";
import { currentCalendarMonth } from "../../../domain/aggregates";
import type { BudgetPlannedExpense, Dataset } from "../../../domain/types";
import type { DatasetStoreState } from "../../local-data/store/datasetStore";
import type { TrackerSummary } from "../../../server/contracts/trackers";
import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { createTransaction } from "../../../domain/transactions";
import { formatMoneyForDisplay } from "../../../domain/money";
import { trackerRegistryStore } from "../../trackers/store";
import type { RateRecord } from "../../../platform/exchange-rates/types";
import { TransactionForm } from "../../transactions/components/TransactionForm";
import { BudgetForm } from "../components/BudgetForm";
import { PlannedExpenseForm } from "../components/PlannedExpenseForm";
import { BudgetsScreen } from "./BudgetsScreen";

const controls = vi.hoisted(() => ({
  auth: { subject: null as string | null, identity: null as { subject: string } | null },
  initialize: vi.fn(async () => {}),
  rateResult: {
    latestRates: new Map<string, RateRecord>(),
    states: new Map<string, { state: string }>(),
    hasError: false,
    isLoading: false,
    retry: vi.fn(async () => []),
  },
}));

vi.mock("react-native", () => ({
  Modal: "dialog",
  KeyboardAvoidingView: "div",
  Platform: { OS: "web" },
  Pressable: "button",
  ScrollView: "div",
  Text: "span",
  TextInput: "input",
  View: "div",
  StyleSheet: { create: (value: unknown) => value },
  useWindowDimensions: () => ({ width: 1280 }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ setParams: vi.fn() }) }));
vi.mock("../../../ui/theme", () => ({
  useAppTheme: () => ({ colors: {} }),
  useThemedStyles: (factory: (colors: object) => unknown) => factory({}),
}));
vi.mock("../../../ui/AppText", () => ({ AppText: "span", AppTextInput: "input" }));
vi.mock("../../../ui/AppScreen", () => ({
  AppScreen: ({ actions, children }: { actions?: React.ReactNode; children: React.ReactNode }) => <div>{actions}{children}</div>,
  EmptyState: ({ title, description }: { title: string; description: string }) => <div>{title}{description}</div>,
}));
vi.mock("../../../providers/AnalyticsProvider", () => ({ useAnalytics: () => ({ capture: vi.fn() }) }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => controls.auth }));
vi.mock("../../trackers/store", async importOriginal => {
  const actual = await importOriginal<typeof import("../../trackers/store")>();
  return { ...actual, initializeTrackerRegistry: controls.initialize };
});
vi.mock("../../exchange-rates/hooks/useExchangeRates", () => ({
  useExchangeRates: () => controls.rateResult,
  rateRequestKey: ({ currency, date }: { currency: string; date?: string }) => `${currency}:${date ?? "latest"}`,
}));

const source = createEmptyDataset();
const month = currentCalendarMonth();
const foodCategory = source.categories.find(category => category.defaultCategoryKey === "food")!;
const rent: BudgetPlannedExpense = { id: "018f0fcb-0000-7000-8000-000000000101", description: "Rent", amount: "200", currency: "USD" };
const internet: BudgetPlannedExpense = { id: "018f0fcb-0000-7000-8000-000000000102", description: "Internet", amount: "50", currency: "EUR" };
const budget = createBudget({ amount: "250", currency: "USD", categoryId: foodCategory.id, month, plannedExpenses: [rent, internet] }, {
  categories: source.categories,
  idFactory: () => "018f0fcb-0000-7000-8000-000000000201",
});
const spentExpense = createTransaction({
  amount: "10", currency: "USD", type: "expense", categoryId: foodCategory.id, description: "Actual groceries", date: `${month}-04`,
}, { categories: source.categories, idFactory: () => "018f0fcb-0000-7000-8000-000000000301" });
const memberSubject = "shared-member-subject";
const membershipId = "018f0fcb-0000-7000-8000-000000000401";
const trackerSummary: TrackerSummary = {
  datasetId: source.datasetId,
  kind: "personal" as const,
  name: "Personal",
  role: "admin" as const,
  membershipId: null,
  archived: false,
};

let currentStore: UseBoundStore<StoreApi<DatasetStoreState>>;
let tree: ReactTestRenderer | undefined;
let storeActions: {
  addBudget: ReturnType<typeof vi.fn>;
  editBudget: ReturnType<typeof vi.fn>;
  addPlannedExpense: ReturnType<typeof vi.fn>;
  editPlannedExpense: ReturnType<typeof vi.fn>;
  deletePlannedExpense: ReturnType<typeof vi.fn>;
  deleteBudget: ReturnType<typeof vi.fn>;
  addTransactionDurably: ReturnType<typeof vi.fn>;
  copyBudgets: ReturnType<typeof vi.fn>;
  retryLocalSave: ReturnType<typeof vi.fn>;
};

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    ...source,
    budgets: [budget],
    transactions: [spentExpense],
    ...overrides,
  };
}

function makeStore(dataset: Dataset | null, saveStatus: "idle" | "saving" | "error" = "idle") {
  storeActions = {
    addBudget: vi.fn(async () => ({ ok: true, value: budget })),
    editBudget: vi.fn(async () => ({ ok: true, value: budget })),
    addPlannedExpense: vi.fn(async () => ({ ok: true, value: rent })),
    editPlannedExpense: vi.fn(async () => ({ ok: true, value: rent })),
    deletePlannedExpense: vi.fn(async () => ({ ok: true, value: null })),
    deleteBudget: vi.fn(async () => ({ ok: true, value: null })),
    addTransactionDurably: vi.fn(async () => ({ ok: true, value: spentExpense })),
    copyBudgets: vi.fn(async () => ({ ok: true, value: { created: [budget], skipped: 0 } })),
    retryLocalSave: vi.fn(async () => ({ ok: true, value: null })),
  };
  const state = {
    datasetEpoch: 1,
    dataset,
    hydration: dataset ? { status: "ready" as const, dataset } : { status: "loading" as const },
    saveStatus,
    saveError: null,
    transactionFilters: {},
    ...storeActions,
  } as unknown as DatasetStoreState;
  return createStore<DatasetStoreState>(() => state);
}

function configureRegistry(store: UseBoundStore<StoreApi<DatasetStoreState>>, options: { hydration?: "loading" | "ready" | "recovery"; error?: string | null; summary?: TrackerSummary | null } = {}) {
  const summary = options.summary === undefined ? trackerSummary : options.summary;
  trackerRegistryStore.setState({
    hydration: options.hydration ?? "ready",
    error: options.error ?? null,
    registry: summary ? {
      schemaVersion: 1,
      personalDatasetId: source.datasetId,
      personalGeneration: 1,
      activeDatasetId: summary.datasetId,
      activeMembershipId: summary.membershipId,
      sharedTrackers: [],
      inaccessible: [],
      membershipGenerations: {},
      targetGenerations: {},
      ownerSubject: null,
      devicePreferences: { language: "system", theme: "system", analyticsConsent: false, firstRunNoticeDismissed: false },
      sharedNoticeAcceptedAt: null,
    } : null,
    summaries: summary ? [summary] : [],
    activeSummary: summary,
    activeStore: store,
  });
}

function buttonWithText(text: string) {
  return tree!.root.findAllByType("button").find(button => button.findAllByType("span").some(node => node.props.children === text));
}

function textValues(): string[] {
  return tree!.root.findAllByType("span").map(node => typeof node.props.children === "string" ? node.props.children : "");
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  controls.auth.subject = null;
  controls.auth.identity = null;
  controls.initialize.mockClear();
  controls.rateResult.latestRates = new Map();
  controls.rateResult.states = new Map();
  controls.rateResult.hasError = false;
  controls.rateResult.isLoading = false;
  controls.rateResult.retry.mockClear();
  currentStore = makeStore(makeDataset());
  configureRegistry(currentStore);
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});

describe("BudgetsScreen planned expenses", () => {
  it("lets a ready guest create a budget", async () => {
    const unbudgeted = makeStore(makeDataset({ budgets: [] }));
    currentStore = unbudgeted;
    configureRegistry(currentStore);
    await act(async () => { tree = create(<BudgetsScreen />); });
    await act(async () => { await buttonWithText("＋ Create budget")!.props.onPress(); });
    const form = tree!.root.findByType(BudgetForm);
    await act(async () => { await form.props.onSave({ categoryId: foodCategory.id, month, amount: "300", currency: "USD" }); });
    expect(storeActions.addBudget).toHaveBeenCalledWith({ categoryId: foodCategory.id, month, amount: "300", currency: "USD" });
  });

  it("supports planned list CRUD and opens a prefilled expense form", async () => {
    await act(async () => { tree = create(<BudgetsScreen />); });

    const addPlanned = buttonWithText("＋ Add planned expense");
    expect(addPlanned).toBeDefined();
    await act(async () => { addPlanned!.props.onPress(); });
    const addForm = tree!.root.findByType(PlannedExpenseForm);
    expect(addForm.props.categoryName).toBe("Food");
    expect(addForm.props.month).toBe(month);
    expect(addForm.props.defaultCurrency).toBe("USD");
    await act(async () => { await addForm.props.onSave({ description: "Phone plan", amount: "20", currency: "USD" }); });
    expect(storeActions.addPlannedExpense).toHaveBeenCalledWith(budget.id, { description: "Phone plan", amount: "20", currency: "USD" });

    const record = tree!.root.findAllByType("button").find(button => button.props.accessibilityLabel === "Record expense for Rent");
    expect(record).toBeDefined();
    await act(async () => { record!.props.onPress(); });
    const transactionForm = tree!.root.findByType(TransactionForm);
    expect(transactionForm.props.initialValues).toMatchObject({ categoryId: foodCategory.id, description: "Rent", amount: "200", currency: "USD", type: "expense" });
    expect(transactionForm.props.initialValues.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await act(async () => { await transactionForm.props.onSave({ categoryId: foodCategory.id, description: "Rent", amount: "200", currency: "USD", type: "expense", date: transactionForm.props.initialValues.date }); });
    expect(storeActions.addTransactionDurably).toHaveBeenCalledWith(expect.objectContaining({ description: "Rent", categoryId: foodCategory.id }), expect.any(String), 1);
    expect(currentStore.getState().dataset?.budgets[0]?.plannedExpenses).toEqual([rent, internet]);

    const edit = tree!.root.findAllByType("button").find(button => button.props.accessibilityLabel === "Edit planned expense Rent");
    expect(edit).toBeDefined();
    await act(async () => { edit!.props.onPress(); });
    const editForm = tree!.root.findByType(PlannedExpenseForm);
    expect(editForm.props.item).toEqual(rent);
    await act(async () => { await editForm.props.onSave({ description: "Rent revised", amount: "210", currency: "USD" }); });
    expect(storeActions.editPlannedExpense).toHaveBeenCalledWith(budget.id, rent.id, { description: "Rent revised", amount: "210", currency: "USD" });

    const remove = tree!.root.findAllByType("button").find(button => button.props.accessibilityLabel === "Delete planned expense Rent");
    await act(async () => { remove!.props.onPress(); });
    await act(async () => { buttonWithText("Delete planned expense")!.props.onPress(); });
    expect(storeActions.deletePlannedExpense).toHaveBeenCalledWith(budget.id, rent.id);
  });

  it("shows actual spending separately from the converted planned total and flags a stale rate", async () => {
    controls.rateResult.latestRates = new Map([["EUR", {
      base: "EUR", quote: "USD", rate: "1.1", effectiveDate: "2026-10-01", fetchedAt: "2026-10-08T00:00:00.000Z", provider: "frankfurter-blended", status: "stale",
    }]]);
    await act(async () => { tree = create(<BudgetsScreen />); });
    const values = textValues();
    expect(values).toContain(formatMoneyForDisplay({ amount: "10", currency: "USD" }));
    expect(values).toContain(formatMoneyForDisplay({ amount: "255", currency: "USD" }));
    expect(values).toContain(formatMoneyForDisplay({ amount: "5", currency: "USD" }));
    expect(values).toContain("A cached rate is being used and is visibly stale. Refresh from Settings when online.");
  });

  it("withholds the planned total when a required rate is missing and keeps original currency totals visible", async () => {
    controls.rateResult.states = new Map([["EUR:latest", { state: "unavailable" }]]);
    await act(async () => { tree = create(<BudgetsScreen />); });
    const values = textValues();
    expect(values).toContain("No exchange rate is available for EUR. The converted planned total is hidden.");
    expect(values).toContain(formatMoneyForDisplay({ amount: "50", currency: "EUR" }));
    expect(values).not.toContain(formatMoneyForDisplay({ amount: "255", currency: "USD" }));
  });

  it("lets a shared member record an expense while hiding budget and planned-list management", async () => {
    controls.auth.subject = memberSubject;
    controls.auth.identity = { subject: memberSubject };
    const tracker = { kind: "shared" as const, name: "Family", accountSubject: memberSubject, membershipId, role: "member" as const, archived: false, access: "active" as const };
    const summary = { ...trackerSummary, kind: "shared" as const, name: "Family", role: "member" as const, membershipId };
    const shared = makeStore(makeDataset({ tracker }));
    currentStore = shared;
    configureRegistry(currentStore, { summary });
    trackerRegistryStore.setState(state => ({ registry: state.registry ? { ...state.registry, ownerSubject: memberSubject, activeMembershipId: membershipId, sharedTrackers: [summary], activeDatasetId: source.datasetId, membershipGenerations: { [`${source.datasetId}:${membershipId}`]: 1 } } : null }));
    await act(async () => { tree = create(<BudgetsScreen />); });
    expect(buttonWithText("＋ Create budget")).toBeUndefined();
    expect(buttonWithText("＋ Add planned expense")).toBeUndefined();
    expect(tree!.root.findAllByType("button").some(button => button.props.accessibilityLabel === "Record expense for Rent")).toBe(true);
    expect(tree!.root.findAllByType("button").some(button => button.props.accessibilityLabel === "Edit planned expense Rent" || button.props.accessibilityLabel === "Delete planned expense Rent")).toBe(false);
  });

  it("closes an item form and explains when same-tracker sync removes its planned item", async () => {
    await act(async () => { tree = create(<BudgetsScreen />); });
    const edit = tree!.root.findAllByType("button").find(button => button.props.accessibilityLabel === "Edit planned expense Rent");
    await act(async () => { edit!.props.onPress(); });
    expect(tree!.root.findAllByType(PlannedExpenseForm)).toHaveLength(1);
    const currentDataset = currentStore.getState().dataset!;
    await act(async () => {
      currentStore.setState({ dataset: { ...currentDataset, budgets: [{ ...budget, plannedExpenses: [] }] } });
    });
    expect(tree!.root.findAllByType(PlannedExpenseForm)).toHaveLength(0);
    expect(textValues()).toContain("This planned expense is no longer available.");
  });

  it("shows recovery retry when the registry has no dataset", async () => {
    currentStore = makeStore(null);
    configureRegistry(currentStore, { hydration: "recovery", error: "tracker_registry_needs_recovery", summary: null });
    await act(async () => { tree = create(<BudgetsScreen />); });
    expect(tree!.root.findAllByType("span").some(node => node.props.accessibilityRole === "alert")).toBe(true);
    const retry = buttonWithText("Retry tracker setup");
    expect(retry).toBeDefined();
    await act(async () => { await retry!.props.onPress(); });
    expect(controls.initialize).toHaveBeenCalledOnce();
  });

  it("shows hydration while the registry is loading and keeps create unavailable", async () => {
    currentStore = makeStore(null);
    configureRegistry(currentStore, { hydration: "loading", summary: null });
    await act(async () => { tree = create(<BudgetsScreen />); });
    expect(textValues()).toContain("Preparing your tracker. Budget changes will be available when local data is ready.");
    expect(buttonWithText("Retry tracker setup")).toBeUndefined();
    expect(buttonWithText("＋ Create budget")).toBeUndefined();
  });

  it("retries a failed planned add with the same stable item ID", async () => {
    const pendingId = "018f0fcb-0000-7000-8000-000000000501";
    storeActions.addPlannedExpense.mockImplementation(async () => {
      currentStore.setState({ saveStatus: "error", saveError: "local_save_failed_retry_to_save_this_record" });
      return { ok: false, message: "local_save_failed_retry_to_save_this_record", recordId: pendingId };
    });
    await act(async () => { tree = create(<BudgetsScreen />); });
    await act(async () => { buttonWithText("＋ Add planned expense")!.props.onPress(); });
    const form = tree!.root.findByType(PlannedExpenseForm);
    const input = { description: "Phone plan", amount: "20", currency: "USD" as const };
    await act(async () => { await form.props.onSave(input); });
    await act(async () => { await form.props.onSave(input); });
    expect(storeActions.addPlannedExpense).toHaveBeenCalledOnce();
    expect(storeActions.editPlannedExpense).toHaveBeenCalledWith(budget.id, pendingId, input);
  });

  it("discards an in-flight planned save after the active tracker changes", async () => {
    let resolveAdd: ((result: { ok: true; value: BudgetPlannedExpense }) => void) | undefined;
    storeActions.addPlannedExpense.mockImplementation(() => new Promise(resolve => { resolveAdd = resolve; }));
    const originalActions = storeActions;
    await act(async () => { tree = create(<BudgetsScreen />); });
    await act(async () => { buttonWithText("＋ Add planned expense")!.props.onPress(); });
    const form = tree!.root.findByType(PlannedExpenseForm);
    let savePromise!: Promise<unknown>;
    await act(async () => { savePromise = form.props.onSave({ description: "Plan", amount: "2", currency: "USD" }); });

    const otherDataset = createEmptyDataset();
    const otherStore = makeStore(otherDataset);
    const otherActions = storeActions;
    currentStore = otherStore;
    await act(async () => { configureRegistry(otherStore, { summary: { ...trackerSummary, datasetId: otherDataset.datasetId } }); });
    resolveAdd?.({ ok: true, value: rent });
    await act(async () => { await savePromise; });

    expect(originalActions.addPlannedExpense).toHaveBeenCalledOnce();
    expect(otherActions.addPlannedExpense).not.toHaveBeenCalled();
    expect(tree!.root.findAllByType(PlannedExpenseForm)).toHaveLength(0);
  });

  it("keeps a newly opened same-tracker form open when a previous save resolves late", async () => {
    let resolveAdd: ((result: { ok: true; value: BudgetPlannedExpense }) => void) | undefined;
    storeActions.addPlannedExpense.mockImplementation(() => new Promise(resolve => { resolveAdd = resolve; }));
    await act(async () => { tree = create(<BudgetsScreen />); });
    await act(async () => { buttonWithText("＋ Add planned expense")!.props.onPress(); });
    const oldForm = tree!.root.findByType(PlannedExpenseForm);
    let oldSave!: Promise<unknown>;
    await act(async () => { oldSave = oldForm.props.onSave({ description: "Old", amount: "1", currency: "USD" }); });
    await act(async () => { oldForm.props.onCancel(); });
    await act(async () => { buttonWithText("＋ Add planned expense")!.props.onPress(); });
    const newForm = tree!.root.findByType(PlannedExpenseForm);
    resolveAdd?.({ ok: true, value: { ...rent, description: "Old" } });
    await act(async () => { await oldSave; });
    expect(tree!.root.findByType(PlannedExpenseForm)).toBe(newForm);
    expect(tree!.root.findByType(PlannedExpenseForm).props.item).toBeUndefined();
  });

  it("preserves a failed in-flight add ID after closing so a later form retries the same item", async () => {
    const pendingId = "018f0fcb-0000-7000-8000-000000000601";
    let resolveAdd: ((result: { ok: false; message: string; recordId: string }) => void) | undefined;
    storeActions.addPlannedExpense.mockImplementation(() => new Promise(resolve => { resolveAdd = resolve; }));
    await act(async () => { tree = create(<BudgetsScreen />); });
    await act(async () => { buttonWithText("＋ Add planned expense")!.props.onPress(); });
    const oldForm = tree!.root.findByType(PlannedExpenseForm);
    let oldSave!: Promise<unknown>;
    await act(async () => { oldSave = oldForm.props.onSave({ description: "Phone", amount: "20", currency: "USD" }); });
    await act(async () => { oldForm.props.onCancel(); });
    await act(async () => { buttonWithText("＋ Add planned expense")!.props.onPress(); });
    const newForm = tree!.root.findByType(PlannedExpenseForm);
    resolveAdd?.({ ok: false, message: "local_save_failed_retry_to_save_this_record", recordId: pendingId });
    await act(async () => { await oldSave; });
    await act(async () => { await newForm.props.onSave({ description: "Phone", amount: "20", currency: "USD" }); });

    expect(storeActions.addPlannedExpense).toHaveBeenCalledOnce();
    expect(storeActions.editPlannedExpense).toHaveBeenCalledWith(budget.id, pendingId, { description: "Phone", amount: "20", currency: "USD" });
  });
  it("clears a completed retry after its form closes so the next plan is a new item", async () => {
    const pendingId = "018f0fcb-0000-7000-8000-000000000701";
    storeActions.addPlannedExpense.mockResolvedValueOnce({ ok: false, message: "local_save_failed_retry_to_save_this_record", recordId: pendingId });
    await act(async () => { tree = create(<BudgetsScreen />); });
    await act(async () => { buttonWithText("＋ Add planned expense")!.props.onPress(); });
    const form = tree!.root.findByType(PlannedExpenseForm);
    const input = { description: "Phone", amount: "20", currency: "USD" as const };
    await act(async () => { await form.props.onSave(input); });
    let finishRetry!: (result: { ok: true; value: BudgetPlannedExpense }) => void;
    storeActions.editPlannedExpense.mockImplementationOnce(() => new Promise(resolve => { finishRetry = resolve; }));
    let retry!: Promise<unknown>;
    await act(async () => { retry = tree!.root.findByType(PlannedExpenseForm).props.onSave(input); });
    await act(async () => { tree!.root.findByType(PlannedExpenseForm).props.onCancel(); });
    await act(async () => { finishRetry({ ok: true, value: { ...rent, id: pendingId } }); await retry; });
    await act(async () => { buttonWithText("＋ Add planned expense")!.props.onPress(); });
    expect(tree!.root.findByType(PlannedExpenseForm).props.item).toBeUndefined();
    await act(async () => { await tree!.root.findByType(PlannedExpenseForm).props.onSave({ ...input, description: "New plan" }); });
    expect(storeActions.addPlannedExpense).toHaveBeenCalledTimes(2);
    expect(storeActions.editPlannedExpense).toHaveBeenCalledOnce();
  });

});
