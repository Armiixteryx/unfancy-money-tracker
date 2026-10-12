import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannedExpenseForm } from "./PlannedExpenseForm";

vi.mock("react-native", () => ({
  Pressable: "button",
  ScrollView: "div",
  StyleSheet: { create: (value: unknown) => value },
  Text: "span",
  TextInput: "input",
  View: "div",
}));
vi.mock("../../../ui/AppText", () => ({ AppText: "span", AppTextInput: "input" }));
vi.mock("../../../ui/theme", () => ({
  useAppTheme: () => ({ colors: {} }),
  useThemedStyles: (factory: (colors: object) => unknown) => factory({}),
}));

let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});

describe("PlannedExpenseForm", () => {
  it("rejects a zero amount before saving", async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }));
    await act(async () => {
      tree = create(
        <PlannedExpenseForm
          categoryName="Food"
          month="2026-10"
          defaultCurrency="USD"
          selectedCurrencies={["USD"]}
          onCancel={vi.fn()}
          onSave={onSave}
        />,
      );
    });

    const description = tree!.root.findAllByType("input").find(input => input.props.accessibilityLabel === "Description");
    const amount = tree!.root.findAllByType("input").find(input => input.props.accessibilityLabel === "Amount");
    await act(async () => {
      description!.props.onChangeText("Groceries");
      amount!.props.onChangeText("0");
    });
    const save = tree!.root.findAllByType("button").find(button => button.findAllByType("span").some(node => node.props.children === "Save planned expense"));
    await act(async () => { await save!.props.onPress(); });

    expect(onSave).not.toHaveBeenCalled();
    expect(tree!.root.findAllByType("span").some(node => node.props.children === "Amount must be greater than zero")).toBe(true);
  });
});
