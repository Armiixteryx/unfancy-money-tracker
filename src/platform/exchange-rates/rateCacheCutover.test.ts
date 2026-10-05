import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const stores = new Map<string, Map<string, unknown>>();
  const clear = vi.fn();
  const webClear = vi.fn();
  const rates = new Map<string, unknown>([["old", { provider: "frankfurter-ecb" }]]);
  let version = 1;
  const open = vi.fn(async (_name: string, next: number, options: { upgrade: (db: unknown, old: number, next: number, tx: unknown) => void }) => {
    const db = { objectStoreNames: { contains: () => true }, get: async (_store: string, key: string) => rates.get(key), put: async (_store: string, value: unknown, key: string) => rates.set(key, value) };
    if (version < next) {
      options.upgrade(db, version, next, { objectStore: () => ({ clear: () => { webClear(); rates.clear(); } }) });
      version = next;
    }
    return db;
  });
  return { stores, clear, webClear, rates, open };
});
vi.mock("react-native-mmkv", () => ({ MMKV: class {
  private values: Map<string, unknown>;
  constructor({ id }: { id: string }) {
    this.values = mocks.stores.get(id) ?? new Map([["old", "legacy"]]);
    mocks.stores.set(id, this.values);
  }
  getBoolean(key: string) { return this.values.get(key); }
  getString(key: string) { return this.values.get(key); }
  clearAll() { mocks.clear(); this.values.clear(); }
  set(key: string, value: unknown) { this.values.set(key, value); }
  delete(key: string) { this.values.delete(key); }
} }));
vi.mock("idb", () => ({ openDB: mocks.open }));

const record = { base: "USD", quote: "EUR", rate: "0.91", effectiveDate: "2026-10-02", fetchedAt: "2026-10-04T12:00:00Z", provider: "frankfurter-blended", status: "fresh" } as const;
it("clears native rates once and preserves unrelated domain storage", async () => {
  const financial = new Map<string, unknown>([["snapshot", "synthetic records and preferences"]]);
  mocks.stores.set("unfancy.financial", financial);
  const { createRateCache } = await import("./createRateCache.native");
  const cache = createRateCache();
  expect(await cache.get("old")).toBeNull();
  await cache.set("latest:USD:EUR", record);
  expect(await createRateCache().get("latest:USD:EUR")).toEqual(record);
  expect(mocks.clear).toHaveBeenCalledTimes(1);
  expect(mocks.stores.get("unfancy.financial")).toBe(financial);
  expect(financial.get("snapshot")).toBe("synthetic records and preferences");
});
it("upgrades only the web rate database once and preserves newly cached rates", async () => {
  const { createRateCache } = await import("./createRateCache.web");
  const cache = createRateCache();
  expect(await cache.get("old")).toBeNull();
  await cache.set("latest:USD:EUR", record);
  expect(await createRateCache().get("latest:USD:EUR")).toEqual(record);
  expect(mocks.webClear).toHaveBeenCalledTimes(1);
  expect(mocks.open.mock.calls.every(([name]) => name === "unfancy-money-tracker-rates")).toBe(true);
});
