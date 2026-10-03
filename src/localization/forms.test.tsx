import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { TransactionForm } from "../features/transactions/components/TransactionForm";
import { BudgetForm } from "../features/budgets/components/BudgetForm";
import { createEmptyDataset } from "../platform/persistence/datasetPersistence";
import { createTransaction } from "../domain/transactions";
import { i18n } from "./i18n";
import { regionForLocale, setRegion } from "./region";

vi.mock("react-native", () => ({
  Pressable: "button", ScrollView: "scroll", Text: "text", TextInput: "input", View: "view",
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock("../ui/theme", () => ({
  useAppTheme: () => ({ colors: {} }),
  useThemedStyles: (factory: (colors: object) => unknown) => factory({})
}));

let tree: ReactTestRenderer | undefined;
const dataset = createEmptyDataset();
const category = dataset.categories.find(c => c.defaultCategoryKey === "food")!;
const transaction = createTransaction({ amount: "12.5", currency: "USD", type: "expense", categoryId: category.id, description: "Synthetic draft", date: "2026-10-03" }, { categories: dataset.categories });
function button(label: string) {
  return tree!.root.findAllByType("button").find(node => node.findAllByType("text").some(text => text.children.join("") === label))!;
}
function text() { return tree!.root.findAllByType("text").map(node => node.children.join("")).join("\n"); }
async function flush() { await new Promise(resolve => setTimeout(resolve, 0)); }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  setRegion(regionForLocale("es-VE"));
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  await i18n.changeLanguage("en");
  setRegion(regionForLocale("en-US"));
});

describe("mounted localized forms", () => {
  it("preserves an edited amount and description across language and region changes and submits canonical input", async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    await act(async () => { tree = create(<I18nextProvider i18n={i18n}><TransactionForm categories={dataset.categories} selectedCurrencies={["USD"]} baseCurrency="USD" transaction={transaction} onSave={save} onCancel={() => {}} /></I18nextProvider>); });
    const amount = () => tree!.root.findAllByType("input").find(node => node.props.keyboardType === "decimal-pad")!;
    expect(amount().props.value).toBe("12,5");
    await act(async () => { amount().props.onChangeText("13,25"); });
    setRegion(regionForLocale("en-US"));
    await act(async () => { await i18n.changeLanguage("es"); });
    expect(amount().props.value).toBe("13,25");
    expect(text()).toContain("Editar transacción");
    expect(text()).toContain("Comida");
    expect(tree!.root.findAllByType("input").some(node => node.props.value === "Synthetic draft")).toBe(true);
    await act(async () => { button("Guardar transacción").props.onPress(); await flush(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ amount: "13.25", description: "Synthetic draft", type: "expense", categoryId: category.id }));
  });
  it("keeps validation and save failures translatable while visible", async () => {
    const save = vi.fn(async () => ({ ok: false as const, message: "local_save_failed_retry_to_save_this_record" }));
    await act(async () => { tree = create(<I18nextProvider i18n={i18n}><TransactionForm categories={dataset.categories} selectedCurrencies={["USD"]} baseCurrency="USD" transaction={transaction} onSave={save} onCancel={() => {}} /></I18nextProvider>); });
    const amount = () => tree!.root.findAllByType("input").find(node => node.props.keyboardType === "decimal-pad")!;
    await act(async () => { amount().props.onChangeText("1.000,25"); button("Save transaction").props.onPress(); await flush(); });
    expect(save).not.toHaveBeenCalled();
    expect(text()).toContain("without grouping separators, for example 12,5");
    await act(async () => { await i18n.changeLanguage("es"); });
    expect(text()).toContain("sin separadores de miles, por ejemplo 12,5");
    await act(async () => { amount().props.onChangeText("13,25"); button("Guardar transacción").props.onPress(); await flush(); });
    expect(text()).toContain("No se pudo guardar localmente");
    await act(async () => { await i18n.changeLanguage("en"); });
    expect(text()).toContain("Local save failed");
    expect(amount().props.value).toBe("13,25");
  });
  it("normalizes budget drafts and uses ISO month entry", async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    await act(async () => { tree = create(<I18nextProvider i18n={i18n}><BudgetForm categories={dataset.categories} budgets={[]} selectedCurrencies={["USD"]} defaultMonth="2026-10" defaultCurrency="USD" onSave={save} onCancel={() => {}} /></I18nextProvider>); });
    const amount = tree!.root.findAllByType("input").find(node => node.props.keyboardType === "decimal-pad")!;
    await act(async () => { amount.props.onChangeText("250,50"); await i18n.changeLanguage("es"); });
    expect(tree!.root.findAllByType("input").some(node => node.props.value === "2026-10")).toBe(true);
    await act(async () => { button("Guardar presupuesto").props.onPress(); await flush(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ amount: "250.5", month: "2026-10" }));
  });
});
