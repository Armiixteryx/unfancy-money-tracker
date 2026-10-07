import type { Dataset } from "./types";

export function canReadTracker(dataset: Dataset, subject: string | null): boolean {
  const tracker = dataset.tracker;
  return !tracker || (tracker.access === "active" && tracker.accountSubject === subject);
}

export function canCreateTrackerTransaction(dataset: Dataset, subject: string | null): boolean {
  return canReadTracker(dataset, subject) && !dataset.tracker?.archived;
}

export function canManageTrackerSettings(dataset: Dataset, subject: string | null): boolean {
  return canCreateTrackerTransaction(dataset, subject) && (!dataset.tracker || dataset.tracker.role === "admin");
}

export function canManageTrackerTransaction(dataset: Dataset, transactionId: string, subject: string | null): boolean {
  if (!canCreateTrackerTransaction(dataset, subject)) return false;
  const transaction = dataset.transactions.find(record => record.id === transactionId);
  if (!transaction) return false;
  return !dataset.tracker || dataset.tracker.role === "admin" || transaction.creator?.subject === subject;
}
