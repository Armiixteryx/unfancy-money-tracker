import { aggregateCategorySpending, aggregateMonthByCurrency, type CategoryAggregate, type CurrencyAggregate } from "./aggregates";
import type { Category, Transaction } from "./types";

export type ReportPeriod = "3m" | "6m" | "12m";

export type MonthlyReportPoint = {
  month: `${number}-${number}`;
  label: string;
  aggregates: readonly CurrencyAggregate[];
};

export function shiftCalendarMonth(month: `${number}-${number}`, offset: number): `${number}-${number}` {
  const [yearText, monthText] = month.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` as `${number}-${number}`;
}

export function formatMonthLabel(month: `${number}-${number}`): string {
  const [yearText, monthText] = month.split("-");
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1))
  );
}

export function monthlyReport(
  transactions: readonly Transaction[],
  anchorMonth: `${number}-${number}`,
  count: number
): MonthlyReportPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const month = shiftCalendarMonth(anchorMonth, index - count + 1);
    return { month, label: formatMonthLabel(month), aggregates: aggregateMonthByCurrency(transactions, month) };
  });
}

export function categoryReport(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  month: `${number}-${number}`
): CategoryAggregate[] {
  return aggregateCategorySpending(transactions, categories, month);
}

export function reportObservation(point: MonthlyReportPoint): string {
  const count = point.aggregates.reduce((total, aggregate) => total + aggregate.transactionCount, 0);
  if (count === 0) return `No activity was recorded in ${point.label}.`;
  const currencies = point.aggregates.map((aggregate) => aggregate.currency).join(", ");
  return `${count} transaction${count === 1 ? "" : "s"} recorded in ${point.label}, across ${currencies}.`;
}
