import { aggregateCategorySpending, aggregateMonthByCurrency, type CategoryAggregate, type CurrencyAggregate } from "./aggregates";
import type { Category, Transaction } from "./types";

export type ReportPeriod = "3m" | "6m" | "12m";

export type MonthlyReportPoint = {
  month: `${number}-${number}`;
  aggregates: readonly CurrencyAggregate[];
};

export function shiftCalendarMonth(month: `${number}-${number}`, offset: number): `${number}-${number}` {
  const [yearText, monthText] = month.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` as `${number}-${number}`;
}



export function monthlyReport(
  transactions: readonly Transaction[],
  anchorMonth: `${number}-${number}`,
  count: number
): MonthlyReportPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const month = shiftCalendarMonth(anchorMonth, index - count + 1);
    return { month, aggregates: aggregateMonthByCurrency(transactions, month) };
  });
}

export function categoryReport(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  month: `${number}-${number}`
): CategoryAggregate[] {
  return aggregateCategorySpending(transactions, categories, month);
}

export function reportObservation(point: MonthlyReportPoint): { transactionCount: number; currencies: readonly string[] } {
  return {
    transactionCount: point.aggregates.reduce((total, aggregate) => total + aggregate.transactionCount, 0),
    currencies: point.aggregates.map(aggregate => aggregate.currency)
  };
}
