import { normalizeAmountDraft } from "./amountInput";
import { localeWithRegion } from "./locale";
import { afterEach, describe, expect, it } from "vitest";
import i18next from "i18next";
import { en, es } from "./catalogs";
import { categoryLabel, i18n, resolveLanguage, translateMessage } from "./i18n";
import { amountDraft, formatCalendarDate, formatMoney, formatMonth, regionForLocale, setRegion } from "./region";
import { archiveCategory, createCategory, renameCategory, seedDefaultCategories } from "../domain/categories";
import { createEmptyDataset, DatasetPersistence, hydrateDataset } from "../platform/persistence/datasetPersistence";
import { MemoryPersistenceAdapter } from "../platform/persistence/memoryPersistenceAdapter";
import { migrateSnapshot } from "../platform/persistence/migrations";
import { createDatasetStore } from "../features/local-data/store/useLocalDatasetStore";
import { createTransaction } from "../domain/transactions";

function leaves(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[`${prefix}${key}`, item]] : Object.entries(leaves(item as object, `${prefix}${key}.`))));
}
afterEach(async () => { await i18n.changeLanguage("en"); setRegion(regionForLocale("en-US")); });

describe("bundled languages", () => {
  it("has complete catalogs with matching interpolation variables", () => {
    const english = leaves(en), spanish = leaves(es);
    expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(english)) {
      expect(spanish[key]).toBeTruthy();
      expect(spanish[key]?.match(/{{[^}]+}}/g)?.sort() ?? []).toEqual(value.match(/{{[^}]+}}/g)?.sort() ?? []);
    }
  });
  it.each([
    ["system", ["fr-FR", "es-MX", "en-US"], "es"],
    ["system", ["en-GB", "es-VE"], "en"],
    ["system", ["ja-JP"], "en"],
    ["system", [], "en"],
    ["en", ["es-VE"], "en"],
    ["es", ["en-US"], "es"]
  ] as const)("resolves %s from device languages", (preference, tags, expected) => {
    expect(resolveLanguage(preference, tags)).toBe(expected);
  });
  it("falls back to English when a Spanish message is missing", async () => {
    const instance = i18next.createInstance();
    await instance.init({ resources: { en: { translation: en }, es: { translation: {} } }, lng: "es", fallbackLng: "en", initAsync: false });
    expect(instance.t($ => $.navigation.settings)).toBe("Settings");
  });
  it("updates already visible codes, successes, and plural notices", async () => {
    const error = "local_save_failed_retry_to_save_this_record";
    expect(translateMessage(error)).toContain("Local save failed");
    await i18n.changeLanguage("es");
    expect(translateMessage(error)).toContain("No se pudo guardar");
    expect(translateMessage("Transaction saved locally.")).toBe("Transacción guardada localmente.");
    expect(i18n.t($ => $.reports.activity, { count: 1, month: "octubre", currencies: "USD" })).toBe("1 transacción registrada en octubre, en USD.");
    expect(i18n.t($ => $.reports.activity, { count: 2, month: "octubre", currencies: "USD" })).toBe("2 transacciones registradas en octubre, en USD.");
    expect(translateMessage("private provider payload", true)).toBe(es.errors.generic);
    expect(translateMessage("amount_precision:JPY:0")).toContain("JPY");
  });
});

describe("regional amounts", () => {
  it("builds device locale tags without Intl.Locale and preserves extensions", () => {
    expect(localeWithRegion("es", "VE")).toBe("es-VE");
    expect(localeWithRegion("zh-Hant-TW-u-nu-hanidec", "HK")).toBe("zh-Hant-HK-u-nu-hanidec");
    expect(localeWithRegion("ar-u-nu-arab", "EG")).toBe("ar-EG-u-nu-arab");
    expect(localeWithRegion("en-GB", null)).toBe("en-GB");
  });
  it("groups exact integer strings with Indian and Spanish conventions", () => {
    expect(formatMoney({ amount: "12345678901234567890.12", currency: "USD" }, regionForLocale("en-IN"))).toBe("1,23,45,67,89,01,23,45,67,890.12 USD");
    expect(formatMoney({ amount: "1234.12", currency: "USD" }, regionForLocale("es-ES"))).toBe("1234,12 USD");
    expect(formatMoney({ amount: "-0.12", currency: "USD" }, regionForLocale("en-US"))).toBe("-0.12 USD");
  });
  const comma = regionForLocale("es-VE"), point = regionForLocale("en-US");
  it("keeps money exact and formatting independent of UI language", async () => {
    const money = { amount: "123456789012345678901234567890.12", currency: "USD" as const };
    const text = formatMoney(money, comma);
    expect(text).toBe("123.456.789.012.345.678.901.234.567.890,12 USD");
    await i18n.changeLanguage("es");
    expect(formatMoney(money, comma)).toBe(text);
    expect(formatMoney(money, point)).toBe("123,456,789,012,345,678,901,234,567,890.12 USD");
    setRegion(point);
    expect(i18n.t($ => $.notices.recordCount, { count: 1234 })).toBe("1,234 registros");
    setRegion(comma);
    expect(i18n.t($ => $.notices.recordCount, { count: 1234 })).toBe("1.234 registros");
  });
  it("normalizes comma, point and localized digits", () => {
    expect(normalizeAmountDraft("12,50", "USD", comma)).toBe("12.5");
    expect(normalizeAmountDraft("12.50", "USD", point)).toBe("12.5");
    expect(normalizeAmountDraft("١٢٫٥٠", "USD", regionForLocale("ar-EG"))).toBe("12.5");
    expect(amountDraft("12.5", comma)).toBe("12,5");
  });
  it.each(["1.000", "1,000.00", "1.000,00", "1e3", "0", "-1", "12,501", "12,500", " 12,5 "])("rejects invalid comma-locale draft %s", value => {
    expect(() => normalizeAmountDraft(value, "USD", comma)).toThrow();
  });
  it("rejects grouping and excess precision in point locales and zero-decimal currencies", () => {
    expect(() => normalizeAmountDraft("1,000", "USD", point)).toThrow();
    expect(() => normalizeAmountDraft("1.000", "USD", point)).toThrow();
    expect(() => normalizeAmountDraft("12.0", "JPY", point)).toThrow();
    expect(normalizeAmountDraft("12", "JPY", point)).toBe("12");
    expect(formatMoney({ amount: "12", currency: "JPY" }, comma)).toBe("12 JPY");
    expect(formatMoney({ amount: "-0.5", currency: "USD" }, point)).toBe("-0.50 USD");
  });
  it("a captured form region keeps its interpretation after regional changes", () => {
    const captured = comma;
    setRegion(point);
    expect(normalizeAmountDraft("12,5", "USD", captured)).toBe("12.5");
  });
  it("treats calendar dates as Gregorian calendar values", () => {
    expect(formatCalendarDate("2026-01-01", point)).toBe("Jan 1, 2026");
    expect(formatMonth("2026-01", point)).toBe("Jan 2026");
  });
});

describe("category provenance and schema 7", () => {
  it("translates new defaults and protected categories while preserving names and IDs", async () => {
    const categories = seedDefaultCategories();
    const food = categories.find(c => c.defaultCategoryKey === "food")!;
    const before = JSON.stringify(categories);
    for (const category of categories) expect(categoryLabel(category)).toBe(en.categories[category.defaultCategoryKey!]);
    await i18n.changeLanguage("es");
    for (const category of categories) expect(categoryLabel(category)).toBe(es.categories[category.defaultCategoryKey!]);
    expect(categoryLabel(food)).toBe("Comida");
    expect(categoryLabel({ ...food, isSystem: false, defaultCategoryKey: undefined })).toBe("Food");
    const custom = createCategory({ kind: "expense", name: "Comida" });
    expect(categoryLabel(custom)).toBe("Comida");
    expect(categoryLabel(renameCategory(custom, "Synthetic name"))).toBe("Synthetic name");
    expect(categoryLabel(archiveCategory(custom))).toBe("Comida");
    expect(JSON.stringify(categories)).toBe(before);
    const choices = categories.filter(c => c.kind === "expense" && !c.isArchived).map(c => ({ id: c.id, name: categoryLabel(c), isFallback: c.defaultCategoryKey === "uncategorized" }));
    expect(choices.find(c => c.id === food.id)?.name).toBe("Comida");
    expect(choices.filter(c => c.isFallback)).toHaveLength(1);
    expect(translateMessage("protected_categories_cannot_be_deleted")).toBe(es.failures.protected_categories_cannot_be_deleted);
  });
  it.each([0, 1, 2, 3, 4, 5])("migrates historical schema %s without inferring names or reseeding deleted defaults", async schemaVersion => {
    const original = createEmptyDataset();
    const category = original.categories.find(c => c.defaultCategoryKey === "food")!;
    const transaction = createTransaction({ amount: "12.5", currency: "USD", type: "expense", categoryId: category.id, description: "Synthetic", date: "2026-01-01" }, { categories: original.categories });
    const raw = { ...original, schemaVersion, transactions: [transaction], categories: original.categories.filter(c => c.defaultCategoryKey !== "housing").map(({ defaultCategoryKey: key, ...rest }) => ({ ...rest, isSystem: key === "uncategorized" })), categoryDeletionTombstones: [{ recordType: "category", recordId: original.categories.find(c => c.defaultCategoryKey === "housing")!.id, deletedAt: new Date().toISOString() }] };
    const migrated = migrateSnapshot(raw);
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.preferences.language).toBe("system");
    expect(migrated.transactions).toEqual([transaction]);
    expect(migrated.categoryDeletionTombstones).toEqual(raw.categoryDeletionTombstones);
    expect(migrated.categories.map(c => [c.id, c.name])).toEqual(raw.categories.map(c => [c.id, c.name]));
    expect(migrated.categories.find(c => c.id === category.id)?.defaultCategoryKey).toBeUndefined();
    expect(migrated.categories.filter(c => c.isSystem).every(c => c.defaultCategoryKey === "uncategorized")).toBe(true);
    const adapter = new MemoryPersistenceAdapter(JSON.stringify(raw));
    expect((await hydrateDataset(adapter)).status).toBe("ready");
    expect(adapter.migrationBackups).toEqual([JSON.stringify(raw)]);
  });
  it("rejects malformed new fields and preserves the recovery snapshot", async () => {
    for (const raw of [
      { ...createEmptyDataset(), preferences: { ...createEmptyDataset().preferences, language: "fr" } },
      { ...createEmptyDataset(), categories: [{ ...createEmptyDataset().categories[0], defaultCategoryKey: "not-valid" }] }
    ]) {
      const adapter = new MemoryPersistenceAdapter(JSON.stringify(raw));
      expect((await hydrateDataset(adapter)).status).toBe("recovery");
      expect(await adapter.readRecoverySnapshot()).toBe(JSON.stringify(raw));
    }
  });
  it("retains an immediate language choice after a failed write and retries its persistence", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => {});
    await store.getState().initialize();
    const write = adapter.writeSnapshot.bind(adapter);
    adapter.writeSnapshot = async () => { throw new Error("Synthetic storage failure"); };
    expect((await store.getState().setPreferences({ language: "es" })).ok).toBe(false);
    expect(store.getState().dataset?.preferences.language).toBe("es");
    expect(store.getState().saveError).toBe("local_save_failed_your_change_is_still_visible_retry_to_save_it");
    adapter.writeSnapshot = write;
    expect((await store.getState().retryLocalSave()).ok).toBe(true);
    const hydrated = await hydrateDataset(adapter);
    expect(hydrated.status === "ready" && hydrated.dataset.preferences.language).toBe("es");
  });
  it("persists language on restart and resets to System", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const store = createDatasetStore(new DatasetPersistence(adapter), async () => {});
    await store.getState().initialize();
    expect((await store.getState().setPreferences({ language: "es" })).ok).toBe(true);
    const restarted = createDatasetStore(new DatasetPersistence(adapter), async () => {});
    await restarted.getState().initialize();
    expect(restarted.getState().dataset?.preferences.language).toBe("es");
    await restarted.getState().resetLocalData();
    expect(restarted.getState().dataset?.preferences.language).toBe("system");
    expect(restarted.getState().dataset?.categories).toHaveLength(12);
    expect(restarted.getState().dataset?.categories.every(category => category.isSystem && !category.isArchived && category.defaultCategoryKey)).toBe(true);
  });
});
