import { currencyPrecision, type CurrencyCode } from "../domain/currency";
import { MoneyValidationError, normalizeMoneyAmount } from "../domain/money";
import { getRegion, type Region } from "./region";

export function normalizeAmountDraft(draft: string, currency: CurrencyCode, region: Region = getRegion()): string {
  let value = draft;
  const formatter = new Intl.NumberFormat(region.locale, { useGrouping: false });
  for (let digit = 0; digit <= 9; digit++) value = value.split(formatter.format(digit)).join(String(digit));
  const escaped = region.decimalSeparator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`^(?:[0-9]+(?:${escaped}[0-9]+)?|${escaped}[0-9]+)$`).test(value)) throw new Error("invalid_amount_draft");
  if ((value.split(region.decimalSeparator)[1]?.length ?? 0) > currencyPrecision(currency)) throw new MoneyValidationError(`${currency} supports at most ${currencyPrecision(currency)} decimal places`, { currency, count: currencyPrecision(currency) });
  return normalizeMoneyAmount(value.replace(region.decimalSeparator, "."), currency, { allowNegative: false, allowZero: false });
}
