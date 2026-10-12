import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { getRegion, regionForLocale, setRegion } from "../../../localization/region";
import type { Region } from "../../../localization/region";
import { TransactionForm } from "./TransactionForm";

vi.mock("react-native", () => ({
  Pressable: "button",
  ScrollView: "div",
  StyleSheet: { create: (value: unknown) => value, flatten: (value: unknown) => value },
  Text: "span",
  TextInput: "input",
  View: "div",
}));
vi.mock("../../../ui/AppText", () => ({
  AppText: "span",
  AppTextInput: "input",
}));
vi.mock("../../../ui/theme", () => ({
  useAppTheme: () => ({ colors: {} }),
  useThemedStyles: (factory: (colors: unknown) => unknown) => factory({}),
}));

let tree: ReactTestRenderer;
let priorRegion: Region;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  priorRegion = getRegion();
  setRegion(regionForLocale("es-ES"));
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  setRegion(priorRegion);
});

describe("TransactionForm initial values", () => {
  it("formats a planned amount for the device region and includes its currency", async () => {
    const dataset = createEmptyDataset();
    const category = dataset.categories.find((candidate) => candidate.defaultCategoryKey === "food")!;

    await act(async () => {
      tree = create(
        <TransactionForm
          baseCurrency="USD"
          categories={dataset.categories}
          initialValues={{
            amount: "1250.5",
            categoryId: category.id,
            date: "2026-10-08",
            description: "Market visit",
            type: "expense",
            currency: "EUR",
          }}
          onCancel={() => {}}
          onSave={async () => ({ ok: true })}
          selectedCurrencies={["USD"]}
        />,
      );
    });

    const amount = tree.root.findAllByType("input").find((input) => input.props.accessibilityLabel === "Amount");
    const currencyButton = tree.root.findAllByType("button").find((button) =>
      button.props.accessibilityState?.selected === true && button.findAllByType("span").some((span) => span.props.children === "EUR"),
    );

    expect(amount?.props.value).toBe("1250,5");
    expect(currencyButton).toBeDefined();
    expect(tree.root.findAllByType("input").find((input) => input.props.accessibilityLabel === "Description")?.props.value).toBe("Market visit");
    expect(tree.root.findAllByType("input").find((input) => input.props.accessibilityLabel === "Date in YYYY-MM-DD format")?.props.value).toBe("2026-10-08");
  });
});
