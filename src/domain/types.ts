import type { SyncState } from "../features/sync/state";
import type { CurrencyCode } from "./currency";

export type UUID = string;
export type CategoryId = string;
export type CalendarDate = string;
export type CalendarMonth = `${number}-${number}`;

export type TransactionType = "income" | "expense";
export type CategoryKind = TransactionType;
export type LanguagePreference = "system" | "en" | "es";
export const DEFAULT_CATEGORY_KEYS = ["uncategorized", "income", "food", "housing", "transport", "shopping", "utilities", "entertainment", "health", "education", "subscriptions"] as const;
export type DefaultCategoryKey = typeof DEFAULT_CATEGORY_KEYS[number];

export type Theme = "system" | "light" | "dark";

export type Category = {
  id: CategoryId;
  kind: CategoryKind;
  name: string;
  // Stable built-in meaning; translated labels never replace the record UUID or stored name.
  defaultCategoryKey?: DefaultCategoryKey;
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
  categoryId: CategoryId;
  description: string;
  date: CalendarDate;
  createdAt: string;
  updatedAt: string;
};

export type Budget = {
  id: UUID;
  categoryId: CategoryId;
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
  language: LanguagePreference;
  baseCurrency: CurrencyCode;
  selectedCurrencies: CurrencyCode[];
  theme: Theme;
  analyticsConsent: boolean;
  firstRunNoticeDismissed: boolean;
};

export type Dataset = {
  sync?: SyncState;
  schemaVersion: number;
  datasetId: UUID;
  transactions: readonly Transaction[];
  categories: readonly Category[];
  budgets: readonly Budget[];
  categoryDeletionTombstones: readonly CategoryDeletionTombstone[];
  preferences: Preferences;
};
