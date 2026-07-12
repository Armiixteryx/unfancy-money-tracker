import { describe, expect, it } from "vitest";

import { convertMonthAggregate } from "./aggregates";
import type { Transaction } from "./types";

const transactions: Transaction[] = [
  { id: "11111111-1111-4111-8111-111111111111", amount: "100", currency: "USD", type: "income", categoryId: "22222222-2222-4222-8222-222222222222", description: "Salary", date: "2026-07-01", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
  { id: "33333333-3333-4333-8333-333333333333", amount: "20", currency: "EUR", type: "expense", categoryId: "44444444-4444-4444-8444-444444444444", description: "Groceries", date: "2026-07-02", createdAt: "2026-07-02T00:00:00.000Z", updatedAt: "2026-07-02T00:00:00.000Z" }
];

describe("converted month aggregates", () => {
  it("converts available currencies with decimal-safe output", () => {
    const result = convertMonthAggregate(transactions, "2026-07", "USD", (currency) => currency === "EUR" ? {
      base: "EUR",
      quote: "USD",
      rate: "1.1",
      effectiveDate: "2026-07-02",
      fetchedAt: "2026-07-03T00:00:00.000Z",
      provider: "frankfurter-ecb",
      status: "fresh"
    } : undefined);

    expect(result.income.amount).toBe("100");
    expect(result.expenses.amount).toBe("22");
    expect(result.unavailableCurrencies).toEqual([]);
    expect(result.rates).toHaveLength(2);
  });

  it("keeps the combined result visibly incomplete when a rate is missing", () => {
    const result = convertMonthAggregate(transactions, "2026-07", "USD", () => undefined);

    expect(result.income.amount).toBe("100");
    expect(result.expenses.amount).toBe("0");
    expect(result.unavailableCurrencies).toEqual(["EUR"]);
  });
});
