import { describe, expect, it } from "vitest";

import { transactionInputSchema } from "./validation";

const categoryId = "00000000-0000-4000-8000-000000000001";

describe("transaction validation", () => {
  it("accepts a valid positive transaction", () => {
    const result = transactionInputSchema.safeParse({
      amount: "12.50",
      type: "expense",
      categoryId,
      description: "Synthetic test value",
      date: "2026-07-11",
      currency: "USD"
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid dates, zero values, and missing descriptions", () => {
    const result = transactionInputSchema.safeParse({
      amount: "0",
      type: "expense",
      categoryId,
      description: "",
      date: "2026-02-30",
      currency: "USD"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["amount", "description", "date"])
      );
    }
  });
});

