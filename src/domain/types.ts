import type { CurrencyCode } from "./currency";

export type UUID = string;
export type CalendarDate = string;
export type CalendarMonth = `${number}-${number}`;

export type TransactionType = "income" | "expense";
export type CategoryKind = TransactionType;
export type Theme = "system" | "light" | "dark";

export type Category = {
  id: UUID;
  kind: CategoryKind;
  name: string;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Transaction = {
  id: UUID;
  amount: string;
  currency: CurrencyCode;
  type: TransactionType;
  categoryId: UUID;
  description: string;
  date: CalendarDate;
  createdAt: string;
  updatedAt: string;
};

export type Budget = {
  id: UUID;
  categoryId: UUID;
  month: CalendarMonth;
  amount: string;
  currency: CurrencyCode;
  createdAt: string;
  updatedAt: string;
};

export type CategoryDeletionTombstone = {
  recordType: "category";
  recordId: UUID;
  deletedAt: string;
};

export type Preferences = {
  baseCurrency: CurrencyCode;
  theme: Theme;
  analyticsConsent: boolean;
  firstRunNoticeDismissed: boolean;
};

export type Dataset = {
  schemaVersion: number;
  datasetId: UUID;
  transactions: readonly Transaction[];
  categories: readonly Category[];
  budgets: readonly Budget[];
  categoryDeletionTombstones: readonly CategoryDeletionTombstone[];
  preferences: Preferences;
};
