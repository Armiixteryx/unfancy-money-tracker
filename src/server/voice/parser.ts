import { normalizeMoneyAmount } from "../../domain/money";
import type { VoiceErrorCode } from "../../contracts/voice";
export class VoiceError extends Error {
  constructor(public readonly code: VoiceErrorCode) {
    super(code);
  }
}
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const units: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};
const numberToken = (s: string) =>
  s in units ||
  (s.includes("-") && s.split("-").every((part) => part in units)) ||
  ["mil", "thousand", "hundred", "and", "y", "point", "punto", "coma"].includes(
    s,
  ) ||
  /^\d+(?:[.,]\d+)*$/.test(s);
function integerWords(words: string[]): number {
  if (!words.length) throw new VoiceError("misunderstood");
  let total = 0,
    group = 0,
    previous = -1;
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (word === "and" || word === "y") {
      if (!i || i === words.length - 1) throw new VoiceError("misunderstood");
      continue;
    }
    if (word === "mil" || word === "thousand") {
      if (total || group >= 1000) throw new VoiceError("misunderstood");
      total = (group || 1) * 1000;
      group = 0;
      previous = -1;
      continue;
    }
    if (word === "hundred") {
      if (!group || group > 9) throw new VoiceError("misunderstood");
      group *= 100;
      previous = 100;
      continue;
    }
    const value = units[word];
    if (
      value === undefined ||
      (previous >= 0 &&
        (value >= previous || previous < 20 || (previous < 100 && value >= 10)))
    )
      throw new VoiceError("misunderstood");
    group += value;
    previous = value;
  }
  return total + group;
}
function amountFrom(tokens: string[]): string {
  tokens = tokens.flatMap((token) => token.split("-"));
  if (
    tokens.length === 2 &&
    /^\d{1,3}$/.test(tokens[0]!) &&
    ["mil", "thousand"].includes(tokens[1]!)
  )
    return String(Number(tokens[0]) * 1000);
  if (tokens.length === 1 && /^\d/.test(tokens[0]!)) {
    const value = tokens[0]!;
    if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(value))
      return value.replace(/,/g, "");
    if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(value))
      return value.replace(/\./g, "").replace(",", ".");
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(value))
      return value.replace(/[.,]/g, "");
    if (/^\d+(?:[.,]\d{1,2})?$/.test(value)) return value.replace(",", ".");
    throw new VoiceError("misunderstood");
  }
  if (tokens.some((t) => /^\d/.test(t))) throw new VoiceError("misunderstood");
  const decimal = tokens.findIndex((t) =>
    ["point", "punto", "coma"].includes(t),
  );
  if (decimal < 0) return String(integerWords(tokens));
  const digits = tokens.slice(decimal + 1);
  if (
    !digits.length ||
    digits.length > 2 ||
    digits.some((t) => units[t] === undefined || units[t] > 9)
  )
    throw new VoiceError("misunderstood");
  return `${integerWords(tokens.slice(0, decimal))}.${digits.map((t) => units[t]).join("")}`;
}
export function parseExpense(text: string): {
  description: string;
  amount: string;
  currency: "COP" | "USD" | "VES";
} {
  if (!text.trim() || text.length > 600) throw new VoiceError("misunderstood");
  const tokens = text
    .trim()
    .replace(/[.!?]+$/, "")
    .split(/\s+/);
  const words = tokens.map(fold);
  const currencies = words.flatMap((word, i) =>
    /^(pesos?|dolares?|dollars?|bolivares?|cop|usd|ves)$/.test(word) ? [i] : [],
  );
  if (currencies.length !== 1) throw new VoiceError("misunderstood");
  const end = currencies[0]!;
  const currency = /^(peso|cop)/.test(words[end]!)
    ? "COP"
    : /^(dolar|dollar|usd)/.test(words[end]!)
      ? "USD"
      : "VES";
  const trailing = tokens.slice(end + 1);
  const separator = trailing.findIndex((word) =>
    ["en", "on", "for", "por"].includes(fold(word)),
  );
  const suffix = (separator < 0 ? trailing : trailing.slice(0, separator))
    .map(fold)
    .join(" ");
  if (
    suffix &&
    !{
      COP: ["colombianos", "colombian"],
      USD: ["americanos", "estadounidenses", "us"],
      VES: ["venezolanos"],
    }[currency].includes(suffix)
  )
    throw new VoiceError("unsupported_currency");
  let start = end;
  while (start > 0 && numberToken(words[start - 1]!)) start--;
  if (start === end || ["and", "y"].includes(words[start]!))
    throw new VoiceError("misunderstood");
  const before = tokens.slice(0, start).join(" ");
  const after = separator < 0 ? "" : trailing.slice(separator + 1).join(" ");
  const description = [before, after]
    .filter(Boolean)
    .join(" ")
    .replace(/^(?:gaste|gasté|pague|pagué|spent|paid)(?:\s+|$)/i, "")
    .replace(/\s+(?:por|for|de)$/, "")
    .trim();
  if (
    /\b(?:y|and|plus|mas|tambien|also)\b/i.test(fold(description)) &&
    description
      .split(/\s+/)
      .some(
        (word) => numberToken(fold(word)) && !["y", "and"].includes(fold(word)),
      )
  )
    throw new VoiceError("misunderstood");
  if (/[-+]$/.test(description)) throw new VoiceError("misunderstood");
  if (
    !description ||
    description.length > 200 ||
    /(?:\d\s*(?:y|and)|(?:menos|minus|negative)\s*$)/i.test(description) ||
    /(?:\$|€|£|euros?|yen|mexican|mexicanos?)/i.test(description)
  )
    throw new VoiceError("misunderstood");
  let amount: string;
  try {
    amount = normalizeMoneyAmount(
      amountFrom(words.slice(start, end)),
      currency,
      { allowNegative: false, allowZero: false },
    );
  } catch {
    throw new VoiceError("misunderstood");
  }
  return { description, amount, currency };
}
