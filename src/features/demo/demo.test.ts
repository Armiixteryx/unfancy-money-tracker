import { afterEach, describe, expect, it, vi } from "vitest";
import { demoPersistenceAdapter } from "./persistence";
import { demoExchangeRateProvider } from "./rates";
import { DatasetPersistence } from "../../platform/persistence/datasetPersistence";
import { datasetEnvelopeSchema } from "../../platform/persistence/schema";
import { isDemoRuntime } from "../../platform/runtime/demo";

afterEach(() => vi.unstubAllEnvs());

describe("isolated demo", () => {
  it("requires the explicit demo build target", () => {
    for (const env of [undefined, "local", "dev", "prod"]) {
      vi.stubEnv("EXPO_PUBLIC_ENV", env);
      expect(isDemoRuntime()).toBe(false);
    }
    vi.stubEnv("EXPO_PUBLIC_ENV", "demo");
    expect(isDemoRuntime()).toBe(true);
  });

  it("shares page memory, seeds valid samples, and restores them on explicit reset", async () => {
    const adapter = demoPersistenceAdapter("anonymous");
    expect(demoPersistenceAdapter("anonymous")).toBe(adapter);
    const persistence = new DatasetPersistence(adapter);
    const first = await persistence.hydrate();
    expect(first.status).toBe("ready");
    if (first.status !== "ready") throw new Error("Demo did not hydrate");
    expect(datasetEnvelopeSchema.safeParse(first.dataset).success).toBe(true);
    expect(first.dataset.transactions.length).toBeGreaterThan(0);
    expect(first.dataset.transactions.every(transaction => transaction.currency === "USD")).toBe(true);
    expect(first.dataset.sync?.binding).toBeNull();
    expect(first.dataset.preferences.analyticsConsent).toBe(false);
    await persistence.save({ ...first.dataset, transactions: [] });
    const edited = await persistence.hydrate();
    expect(edited.status === "ready" && edited.dataset.transactions.length).toBe(0);
    await persistence.reset();
    const reset = await persistence.hydrate();
    expect(reset.status === "ready" && reset.dataset.transactions.length).toBe(first.dataset.transactions.length);
    expect(reset.status === "ready" && reset.dataset.datasetId).not.toBe(first.dataset.datasetId);
    expect(await demoPersistenceAdapter("tracker-registry").readSnapshot()).toBeNull();
  });

  it("never fetches currency rates or invents cross-currency totals", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    try {
      expect(await demoExchangeRateProvider.getLatestRate("USD", "USD")).toMatchObject({ rate: "1", provider: "same-currency" });
      await expect(demoExchangeRateProvider.getLatestRate("EUR", "USD")).rejects.toMatchObject({ code: "no_rate_available" });
      await expect(demoExchangeRateProvider.getHistoricalRate("EUR", "USD", "2026-10-01")).rejects.toMatchObject({ code: "no_rate_available" });
      expect(fetcher).not.toHaveBeenCalled();
    } finally { fetcher.mockRestore(); }
  });
});
