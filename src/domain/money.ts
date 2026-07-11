import Decimal from "decimal.js";

import { currencyPrecision, type CurrencyCode } from "./currency";

export type Money = {
  amount: string;
  currency: CurrencyCode;
};

export class MoneyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyValidationError";
  }
}

const DECIMAL_INPUT = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const SIGNED_DECIMAL_INPUT = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

function assertInput(value: string, allowNegative: boolean): string {
  const candidate = value.trim();
  if (candidate.length === 0) {
    throw new MoneyValidationError("Amount is required");
  }
  if (/[eE]/.test(candidate)) {
    throw new MoneyValidationError("Amount must not use exponent notation");
  }
  if (!(allowNegative ? SIGNED_DECIMAL_INPUT : DECIMAL_INPUT).test(candidate)) {
    throw new MoneyValidationError("Amount must be a decimal number");
  }
  return candidate;
}

function toCanonical(value: Decimal, currency: CurrencyCode): string {
  const fixed = value.toFixed(currencyPrecision(currency));
  const decimalIndex = fixed.indexOf(".");
  if (decimalIndex === -1) {
    return fixed === "-0" ? "0" : fixed;
  }
  const whole = fixed.slice(0, decimalIndex);
  const fraction = fixed.slice(decimalIndex + 1);
  const normalizedFraction = fraction.replace(/0+$/, "");
  if (!normalizedFraction) {
    return whole === "-0" ? "0" : whole;
  }
  return `${whole}.${normalizedFraction}`;
}

function normalizePositiveRate(value: string): string {
  const candidate = assertInput(value, false);
  const decimal = new Decimal(candidate);
  if (!decimal.isFinite() || decimal.isZero() || decimal.isNegative()) {
    throw new MoneyValidationError("Exchange rate must be greater than zero");
  }
  return decimal.toSignificantDigits(24).toString();
}

export function normalizeMoneyAmount(
  value: string,
  currency: CurrencyCode,
  options: { allowNegative?: boolean; allowZero?: boolean } = {}
): string {
  const allowNegative = options.allowNegative ?? true;
  const allowZero = options.allowZero ?? true;
  const candidate = assertInput(value, allowNegative);
  const decimal = new Decimal(candidate);

  if (!decimal.isFinite()) {
    throw new MoneyValidationError("Amount must be finite");
  }
  if (!allowNegative && decimal.isNegative()) {
    throw new MoneyValidationError("Amount must be positive");
  }
  if (!allowZero && decimal.isZero()) {
    throw new MoneyValidationError("Amount must be greater than zero");
  }
  if (decimal.decimalPlaces() > currencyPrecision(currency)) {
    throw new MoneyValidationError(`${currency} supports at most ${currencyPrecision(currency)} decimal places`);
  }

  return toCanonical(decimal, currency);
}

export function createMoney(amount: string, currency: CurrencyCode): Money {
  return {
    amount: normalizeMoneyAmount(amount, currency),
    currency
  };
}

export function createPositiveMoney(amount: string, currency: CurrencyCode): Money {
  return {
    amount: normalizeMoneyAmount(amount, currency, { allowNegative: false, allowZero: false }),
    currency
  };
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new MoneyValidationError("Money values must use the same currency");
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(new Decimal(left.amount).plus(right.amount).toString(), left.currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(new Decimal(left.amount).minus(right.amount).toString(), left.currency);
}

export function convertMoney(money: Money, targetCurrency: CurrencyCode, rate: string): Money {
  if (money.currency === targetCurrency) {
    return createMoney(money.amount, targetCurrency);
  }

  const normalizedRate = normalizePositiveRate(rate);
  const converted = new Decimal(money.amount).times(normalizedRate);
  const precision = currencyPrecision(targetCurrency);
  const rounded = converted.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP);

  return createMoney(rounded.toString(), targetCurrency);
}

export function sumMoney(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce<Money>((total, value) => addMoney(total, value), createMoney("0", currency));
}
