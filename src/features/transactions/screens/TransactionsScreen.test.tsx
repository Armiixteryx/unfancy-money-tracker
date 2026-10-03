import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Modal, Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { createTransaction } from "../../../domain/transactions";
import { useLocalDatasetStore } from "../../local-data/store/useLocalDatasetStore";
import { TransactionForm } from "../components/TransactionForm";
import { TransactionsScreen } from "./TransactionsScreen";
const navigation = vi.hoisted(() => ({
  params: {} as { edit?: string; new?: string },
  width: 1200,
  setParams: vi.fn(),
}));
vi.mock("react-native", () => ({
  Modal: "dialog",
  Pressable: "button",
  ScrollView: "div",
  Text: "span",
  TextInput: "input",
  View: "div",
  StyleSheet: { create: (value: unknown) => value },
  useWindowDimensions: () => ({ width: navigation.width }),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => navigation.params,
  useRouter: () => ({ setParams: navigation.setParams }),
}));
vi.mock("../../../ui/theme", () => ({
  useAppTheme: () => ({ colors: {} }),
  useThemedStyles: (factory: (value: unknown) => unknown) => factory({}),
}));
vi.mock("../../../ui/AppScreen", () => ({
  AppScreen: ({ children }: { children: React.ReactNode }) => children,
  EmptyState: () => null,
}));
vi.mock("../../../ui/Snackbar", () => ({ Snackbar: () => null }));
vi.mock("../../../providers/AnalyticsProvider", () => ({
  useAnalytics: () => ({ capture: vi.fn() }),
}));
vi.mock("../../voice/VoiceEntryButton", () => ({
  VoiceEntryButton: () => null,
}));
vi.mock("../components/TransactionForm", () => ({
  TransactionForm: () => null,
}));
vi.mock("../components/TransactionRow", () => ({ TransactionRow: () => null }));
vi.mock("../components/DateFilterPicker", () => ({
  DateFilterPicker: () => null,
}));
const dataset = createEmptyDataset();
const transaction = createTransaction(
  {
    amount: "10",
    currency: "USD",
    type: "expense",
    categoryId: dataset.categories.find((c) => c.kind === "expense")!.id,
    description: "Synthetic",
    date: "2026-10-02",
  },
  { categories: dataset.categories },
);
let tree: ReactTestRenderer;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  navigation.params = { edit: transaction.id };
  navigation.width = 1200;
  navigation.setParams.mockReset();
  navigation.setParams.mockImplementation((params) =>
    Object.assign(navigation.params, params),
  );
  useLocalDatasetStore.setState({
    dataset: { ...dataset, transactions: [transaction] },
    transactionFilters: {},
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
});
describe("voice Edit route", () => {
  it.each([400, 1200])(
    "opens the existing form at width %s and consumes Edit once",
    async (width) => {
      navigation.width = width;
      await act(async () => {
        tree = create(<TransactionsScreen />);
      });
      expect(tree.root.findByType(TransactionForm).props.transaction.id).toBe(
        transaction.id,
      );
      expect(navigation.setParams).toHaveBeenCalledOnce();
      expect(navigation.params.edit).toBeUndefined();
      if (width < 900)
        expect(tree.root.findByType(Modal).props.visible).toBe(true);
      else expect(tree.root.findAllByType(Modal)).toHaveLength(0);
      await act(async () => {
        useLocalDatasetStore.setState({
          dataset: {
            ...dataset,
            transactions: [transaction],
            preferences: { ...dataset.preferences, theme: "dark" },
          },
        });
      });
      expect(navigation.setParams).toHaveBeenCalledOnce();
    },
  );
  it("handles a record deleted before Edit or while the form is open", async () => {
    await act(async () => {
      tree = create(<TransactionsScreen />);
    });
    await act(async () => {
      useLocalDatasetStore.setState({ dataset });
    });
    expect(tree.root.findAllByType(TransactionForm)).toHaveLength(0);
    expect(
      tree.root
        .findAllByType(Text)
        .some(
          (node) =>
            node.props.children === "This transaction is no longer available.",
        ),
    ).toBe(true);
    await act(async () => {
      tree.unmount();
      navigation.params = { edit: transaction.id };
      tree = create(<TransactionsScreen />);
    });
    expect(tree.root.findAllByType(TransactionForm)).toHaveLength(0);
    expect(navigation.params.edit).toBeUndefined();
  });
});
