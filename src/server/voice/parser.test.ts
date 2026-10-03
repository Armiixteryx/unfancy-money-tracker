import { describe, expect, it } from "vitest";
import { parseExpense } from "./parser";
describe("deterministic voice parsing", () => {
  it.each([
    ["Coffee twenty-five dollars", "25", "USD", "Coffee"],
    ["Almuerzo 40 mil pesos", "40000", "COP", "Almuerzo"],
    ["Almuerzo cuarenta mil pesos", "40000", "COP", "Almuerzo"],
    ["Cena noventa mil pesos", "90000", "COP", "Cena"],
    ["Taxi doce mil bolívares", "12000", "VES", "Taxi"],
    ["Netflix ten dollars", "10", "USD", "Netflix"],
    ["Camiseta ocho dólares", "8", "USD", "Camiseta"],
    ["Coffee twelve point five dollars", "12.5", "USD", "Coffee"],
    ["Café doce coma cinco cero dólares", "12.5", "USD", "Café"],
    ["Lunch 40,000 pesos", "40000", "COP", "Lunch"],
    ["Coffee 1.25 dollars", "1.25", "USD", "Coffee"],
    ["Coffee 1,25 dólares", "1.25", "USD", "Coffee"],
    ["Room 101 hotel 25 dollars", "25", "USD", "Room 101 hotel"],
    ["Gasté cuarenta mil pesos en almuerzo", "40000", "COP", "almuerzo"],
    ["Paid ten dollars for Netflix", "10", "USD", "Netflix"],
    ["Taxi one hundred twenty five bolivares", "125", "VES", "Taxi"],
    ["Lunch cuarenta y dos pesos", "42", "COP", "Lunch"],
  ])("parses %s", (text, amount, currency, description) =>
    expect(parseExpense(text)).toEqual({ amount, currency, description }),
  );
  it.each([
    "",
    "Lunch",
    "forty pesos",
    "Lunch pesos",
    "Lunch zero dollars",
    "Lunch -10 dollars",
    "Lunch minus ten dollars",
    "Lunch ten dollars and taxi five dollars",
    "Lunch five and taxi ten dollars",
    "Lunch 5 and taxi 10 dollars",
    "Lunch twenty thirty dollars",
    "Lunch 1.2345 dollars",
    "Lunch ten euros",
    "Lunch ten pesos mexicanos",
    "Lunch ten dollars canadian",
    "7 eleven 10 dollars",
    "Lunch 5 10 dollars",
  ])("rejects ambiguous/incomplete %s", (text) =>
    expect(() => parseExpense(text)).toThrow(),
  );
});
