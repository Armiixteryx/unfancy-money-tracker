import { describe, expect, it } from "vitest";

import { filterTransactions } from "./transactions";
import type { Transaction } from "./types";

const records: Transaction[] = [
  { id: "11111111-1111-4111-8111-111111111111", amount: "10", currency: "USD", type: "expense", categoryId: "22222222-2222-4222-8222-222222222222", description: "Coffee", date: "2026-07-03", createdAt: "2026-07-03T00:00:00.000Z", updatedAt: "2026-07-03T00:00:00.000Z" },
  { id: "33333333-3333-4333-8333-333333333333", amount: "20", currency: "EUR", type: "income", categoryId: "44444444-4444-4444-8444-444444444444", description: "Contract", date: "2026-07-01", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" }
];

describe("filterTransactions", () => {
  it("filters by category, currency, and inclusive date bounds", () => {
    expect(filterTransactions(records, { categoryId: records[0]!.categoryId, currency: "USD", fromDate: "2026-07-03", toDate: "2026-07-03" })).toEqual([records[0]!]);
  });

  it("matches descriptions case-insensitively and sorts newest first", () => {
    expect(filterTransactions(records, { query: "CONTRACT" }).map((transaction) => transaction.id)).toEqual([records[1]!.id]);
  });
});
