import type { CurrencyCode } from "./currency";

export type UUID = string;
export type CalendarDate = string;
export type CalendarMonth = `${number}-${number}`;
export type RecordType = "transaction" | "category" | "budget" | "preference";

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

export type RecordTombstone = {
  recordType: RecordType;
  recordId: UUID;
  deletedAt: string;
};

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "stale" | "conflicted" | "error";

export type SyncMetadata = {
  status: SyncStatus;
  inboxCursor: string | null;
  outbox: readonly SyncChange[];
  conflicts: readonly SyncConflict[];
  lastSyncedAt: string | null;
  reason: string | null;
};

export type SyncChange = {
  idempotencyKey: UUID;
  recordType: RecordType;
  recordId: UUID;
  operation: "upsert" | "delete";
  baseRevision: number;
  revision: number;
};

export type SyncConflict = {
  recordType: RecordType;
  recordId: UUID;
  localRevision: number;
  cloudRevision: number;
  resolution: "pending";
};

export type Preferences = {
  baseCurrency: CurrencyCode;
  theme: Theme;
  analyticsConsent: boolean;
};

export type Dataset = {
  schemaVersion: number;
  datasetId: UUID;
  transactions: readonly Transaction[];
  categories: readonly Category[];
  budgets: readonly Budget[];
  categoryDeletionTombstones: readonly RecordTombstone[];
  preferences: Preferences;
  sync: SyncMetadata;
};

