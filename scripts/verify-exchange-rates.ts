import { SUPPORTED_CURRENCIES } from "../src/domain/currency";
import { FrankfurterExchangeRateAdapter } from "../src/platform/exchange-rates/frankfurterExchangeRateAdapter";
import { HttpExchangeRateProvider } from "../src/platform/exchange-rates/httpExchangeRateProvider";
import { MemoryRateCache } from "../src/platform/exchange-rates/memoryRateCache";

async function main(): Promise<void> {
const endpoint = process.argv[2];
// Separate clients exercise backend reuse rather than their own in-memory caches.
const createProvider = () => endpoint ? new HttpExchangeRateProvider(endpoint) : new FrankfurterExchangeRateAdapter(new MemoryRateCache());
for (const currency of SUPPORTED_CURRENCIES) {
  const first = await createProvider().getLatestRate(currency, "USD");
  if (first.status !== "fresh" || first.provider !== (currency === "USD" ? "same-currency" : "frankfurter-blended")) throw new Error("Invalid provider or freshness");
  if (endpoint && currency !== "USD") {
    const second = await createProvider().getLatestRate(currency, "USD");
    if (second.fetchedAt !== first.fetchedAt || second.rate !== first.rate) throw new Error("Shared cache reuse failed");
  }
  console.log(`PASS ${currency}/USD latest`);
}
const historical = await createProvider().getHistoricalRate("USD", "VES", "2026-10-04");
if (historical.effectiveDate !== "2026-10-02") throw new Error("Weekend effective date was not preserved");
if (endpoint) {
  const repeated = await createProvider().getHistoricalRate("USD", "VES", "2026-10-04");
  if (repeated.fetchedAt !== historical.fetchedAt) throw new Error("Historical shared cache reuse failed");
}
console.log("PASS weekend effective date and historical reuse");

}
void main().catch(() => { console.error("FAIL exchange-rate verification"); process.exitCode = 1; });
