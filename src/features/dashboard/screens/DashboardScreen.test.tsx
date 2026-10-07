import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { createTransaction } from "../../../domain/transactions";
import { createBudget } from "../../../domain/budgets";
import { currentCalendarMonth } from "../../../domain/aggregates";
import { formatMoneyForDisplay } from "../../../domain/money";
import { useLocalDatasetStore } from "../../local-data/store/useLocalDatasetStore";
import { AppText } from "../../../ui/AppText";
import { Button } from "../../../ui/controls";
import { DashboardScreen } from "./DashboardScreen";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const access = vi.hoisted(() => ({ tracker: { datasetId: "00000000-0000-7000-8000-000000000001", kind: "personal" as "personal" | "shared", name: "Personal", role: "admin" as "admin" | "member", membershipId: null as string | null, archived: false }, subject: null as string | null }));
vi.mock("react-native", () => ({
  View: "div", Text: "span", Pressable: "button", Platform: { OS: "web" },
  StyleSheet: { create: (value: unknown) => value }, useWindowDimensions: () => ({ width: 390 }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: navigation.push }) }));
vi.mock("../../../ui/theme", () => ({ useThemedStyles: (factory: (colors: object) => unknown) => factory({}) }));
vi.mock("../../../ui/AppScreen", () => ({
  AppScreen: ({ actions, children }: { actions: React.ReactNode; children: React.ReactNode }) => <div>{actions}{children}</div>,
  EmptyState: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../voice/VoiceEntryButton", () => ({ VoiceEntryButton: () => null }));
vi.mock("../../trackers/store", async importOriginal => ({
  ...await importOriginal<typeof import("../../trackers/store")>(),
  useActiveTrackerSummary: () => access.tracker,
}));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ subject: access.subject }) }));
vi.mock("../../../providers/AnalyticsProvider", () => ({ useAnalytics: () => ({ capture: vi.fn() }) }));
vi.mock("../../exchange-rates/hooks/useExchangeRates", () => ({ useExchangeRates: () => ({ latestRates: new Map(), isLoading: false, hasError: false }) }));

const original = createEmptyDataset();
const month = currentCalendarMonth();
const dependencies = { categories: original.categories };
const categoryId = original.categories.find((category) => category.kind === "expense")!.id;
const budget = createBudget({ amount: "100", currency: "USD", categoryId, month }, dependencies);
const expense = createTransaction({ amount: "10", currency: "USD", type: "expense", categoryId, description: "Synthetic dashboard expense", date: `${month}-04` }, dependencies);
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  navigation.push.mockReset();
  access.tracker = { datasetId: original.datasetId, kind: "personal", name: "Personal", role: "admin", membershipId: null, archived: false };
  access.subject = null;
  useLocalDatasetStore.setState({ dataset: { ...original, transactions: [expense], budgets: [budget] } });
});
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; });

describe("dashboard composition", () => {
  it("places remaining budget before converted supporting metrics", async () => {
    await act(async () => { tree = create(<DashboardScreen />); });
    const headings = tree!.root.findAllByType(AppText).filter((node) => node.props.variant === "heading");
    expect(headings[0]?.props.children).toBe("Remaining budget");
    expect(headings[1]?.props.children).toBe("Base currency snapshot");
    expect(tree!.root.findAllByType(AppText).some((node) => node.props.children === formatMoneyForDisplay({ amount: "90", currency: "USD" }))).toBe(true);
  });
  it("shows a budget-only currency before the first transaction", async () => {
    useLocalDatasetStore.setState({ dataset: { ...original, budgets: [budget], transactions: [] } });
    await act(async () => { tree = create(<DashboardScreen />); });
    expect(tree!.root.findAllByType(AppText).some((node) => node.props.children === formatMoneyForDisplay({ amount: "100", currency: "USD" }))).toBe(true);
  });
  it("opens the existing forms from add and no-budget actions", async () => {
    useLocalDatasetStore.setState({ dataset: { ...original, budgets: [], transactions: [expense] } });
    await act(async () => { tree = create(<DashboardScreen />); });
    const buttons = tree!.root.findAllByType(Button);
    await act(async () => buttons[0]!.props.onPress());
    expect(navigation.push).toHaveBeenLastCalledWith("/transactions?new=1");
    const createBudgetButton = buttons.find((button) => button.props.label === "Create budget")!;
    await act(async () => createBudgetButton.props.onPress());
    expect(navigation.push).toHaveBeenLastCalledWith("/budgets?new=1");
  });
  it("shows shared authorship and avoids opening another member's entry for editing", async () => {
    const membershipId = "018f0fcb-76a9-7000-8000-000000000055";
    access.tracker = { datasetId: original.datasetId, kind: "shared", name: "Family", role: "member", membershipId, archived: false };
    access.subject = "current-subject";
    const sharedExpense = { ...expense, creator: { subject: "other-subject", email: "member@example.invalid" } };
    const tracker = { kind: "shared" as const, name: "Family", accountSubject: access.subject, membershipId, role: "member" as const, archived: false, access: "active" as const };
    useLocalDatasetStore.setState({ dataset: { ...original, tracker, budgets: [], transactions: [sharedExpense] } });
    await act(async () => { tree = create(<DashboardScreen />); });
    expect(tree!.root.findAllByType(AppText).some(node => node.props.children === "member@example.invalid")).toBe(true);
    expect(tree!.root.findAllByType(Button).some(button => button.props.label === "Create budget")).toBe(false);
    const activity = tree!.root.findAllByType("button").find(node => String(node.props.accessibilityLabel).includes("Synthetic dashboard expense"));
    await act(async () => activity!.props.onPress());
    expect(navigation.push).toHaveBeenLastCalledWith(`/transactions?tracker=${original.datasetId}`);
  });
});
