import { describe, expect, it } from "vitest";

import { monthlyReport, reportObservation } from "./reports";
import type { Transaction } from "./types";

const baseTransaction: Transaction = {
  id: "00000000-0000-4000-8000-000000000001",
  amount: "25",
  currency: "USD",
  type: "expense",
  categoryId: "00000000-0000-4000-8000-000000000002",
  description: "Synthetic report transaction",
  date: "2026-07-11",
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z"
};

describe("reports", () => {
  it("builds a fixed-length calendar history with empty months included", () => {
    const points = monthlyReport([baseTransaction], "2026-07", 3);
    expect(points.map((point) => point.month)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(points[0]?.aggregates).toEqual([]);
    expect(points[2]?.aggregates[0]?.expenses.amount).toBe("25");
  });

  it("keeps observations factual", () => {
    const point = monthlyReport([baseTransaction], "2026-07", 1)[0];
    expect(point).toBeDefined();
    if (!point) return;
    expect(reportObservation(point)).toEqual({ transactionCount: 1, currencies: ["USD"] });
  });
});
