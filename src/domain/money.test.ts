import { describe, expect, it } from "vitest";

import { addMoney, convertMoney, createPositiveMoney, normalizeMoneyAmount, subtractMoney } from "./money";

describe("money", () => {
  it("normalizes decimal strings without floating point arithmetic", () => {
    expect(normalizeMoneyAmount("0010.5000", "USD", { allowNegative: false, allowZero: false })).toBe("10.5");
    expect(addMoney(createPositiveMoney("0.1", "USD"), createPositiveMoney("0.2", "USD")).amount).toBe("0.3");
  });

  it("rejects exponent notation and over-precision", () => {
    expect(() => normalizeMoneyAmount("1e2", "USD")).toThrow("exponent");
    expect(() => normalizeMoneyAmount("1.001", "USD")).toThrow("at most 2");
    expect(() => createPositiveMoney("0", "USD")).toThrow("greater than zero");
    expect(() => createPositiveMoney("1.5", "JPY")).toThrow("at most 0");
  });

  it("rounds conversions half up at the target currency precision", () => {
    expect(convertMoney(createPositiveMoney("1", "USD"), "EUR", "1.005").amount).toBe("1.01");
    expect(subtractMoney(createPositiveMoney("1.00", "USD"), createPositiveMoney("1.25", "USD")).amount).toBe("-0.25");
  });

  it("requires matching currencies for arithmetic", () => {
    expect(() => addMoney(createPositiveMoney("1", "USD"), createPositiveMoney("1", "EUR"))).toThrow(
      "same currency"
    );
  });
});

