import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTransaction } from "../../../domain/transactions";
import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { TransactionRow } from "./TransactionRow";

vi.mock("react-native", () => ({
  Pressable: "button",
  StyleSheet: { create: (value: unknown) => value },
  Text: "span",
  View: "div",
}));
vi.mock("../../../ui/AppText", () => ({ AppText: "span" }));
vi.mock("../../../ui/theme", () => ({
  useThemedStyles: (factory: (colors: object) => unknown) => factory({}),
}));

const dataset = createEmptyDataset();
const category = dataset.categories.find((candidate) => candidate.defaultCategoryKey === "food")!;
const transaction = createTransaction({
  amount: "1234.56",
  currency: "USD",
  type: "expense",
  categoryId: category.id,
  description: "Weekly grocery shopping",
  date: "2026-10-08",
}, { categories: dataset.categories });

let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});

describe("TransactionRow responsive layout", () => {
  it.each([[320, true], [400, false]])("places the full amount below the copy only when row width is narrow (%s px)", async (width, isNarrow) => {
    const onPress = vi.fn();
    const onDelete = vi.fn();
    await act(async () => {
      tree = create(
        <TransactionRow
          transaction={transaction}
          category={category}
          onPress={onPress}
          onDelete={onDelete}
          isDeletePending={false}
          onCancelDelete={vi.fn()}
          onConfirmDelete={vi.fn()}
        />,
      );
    });

    const rowContent = tree!.root.findAllByType("div").find((node) => typeof node.props.onLayout === "function");
    await act(async () => {
      rowContent!.props.onLayout({ nativeEvent: { layout: { width } } });
    });

    const amount = tree!.root.findAllByType("span").find((node) => {
      const text = node.children.join("");
      return text.startsWith("−") && text.length > 1;
    });
    expect(amount).toBeDefined();
    expect(amount!.children.join("")).toContain("USD");
    if (isNarrow) {
      expect(amount!.parent!.props.style).toMatchObject({ flex: 1, minWidth: 0 });
      expect(tree!.root.findAllByType("span").find((node) => node.props.children === transaction.description)?.props.numberOfLines).toBeUndefined();
    } else {
      expect(amount!.parent!.type).toBe("button");
      expect(tree!.root.findAllByType("span").find((node) => node.props.children === transaction.description)?.props.numberOfLines).toBe(1);
    }

    const main = tree!.root.findAllByType("button").find((button) => button.props.onPress === onPress);
    const deleteButton = tree!.root.findAllByType("button").find((button) => button.props.onPress === onDelete);
    await act(async () => {
      main!.props.onPress();
      deleteButton!.props.onPress();
    });
    expect(onPress).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
