import { describe, expect, it } from "vitest";
import { createEmptyDataset } from "../platform/persistence/datasetPersistence";
import { canReadTracker, canCreateTrackerTransaction, canManageTrackerSettings, canManageTrackerTransaction } from "./trackerPermissions";
import type { Dataset } from "./types";

const personal = createEmptyDataset();
const shared: Dataset = {
  ...personal,
  tracker: { kind: "shared", name: "Synthetic tracker", accountSubject: "member-sub", membershipId: "019bc9e0-0000-7000-8000-000000000002", role: "member", archived: false, access: "active" },
  transactions: [
    { id: "own", creator: { subject: "member-sub", email: "member@example.invalid" }, amount: "1", currency: "USD", type: "expense", categoryId: "expense-food", description: "Synthetic entry", date: "2026-10-07", createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z" },
    { id: "other", creator: { subject: "other-sub", email: "other@example.invalid" }, amount: "1", currency: "USD", type: "income", categoryId: "income-income", description: "Synthetic entry", date: "2026-10-07", createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z" },
  ],
};

describe("local tracker permissions", () => {
  it("preserves guest personal entry and settings", () => {
    expect(canReadTracker(personal, null)).toBe(true);
    expect(canCreateTrackerTransaction(personal, null)).toBe(true);
    expect(canManageTrackerSettings(personal, null)).toBe(true);
  });
  it("lets members view and add but manage only their own entries", () => {
    expect(canReadTracker(shared, "member-sub")).toBe(true);
    expect(canCreateTrackerTransaction(shared, "member-sub")).toBe(true);
    expect(canManageTrackerSettings(shared, "member-sub")).toBe(false);
    expect(canManageTrackerTransaction(shared, "own", "member-sub")).toBe(true);
    expect(canManageTrackerTransaction(shared, "other", "member-sub")).toBe(false);
    expect(canManageTrackerTransaction(shared, "missing", "member-sub")).toBe(false);
  });
  it("gives admins authority over every entry and tracker settings", () => {
    const admin: Dataset = { ...shared, tracker: { ...shared.tracker!, role: "admin" } };
    expect(canManageTrackerSettings(admin, "member-sub")).toBe(true);
    expect(canManageTrackerTransaction(admin, "other", "member-sub")).toBe(true);
  });
  it("locks archived financial writes and rejects revoked/different accounts", () => {
    const archived: Dataset = { ...shared, tracker: { ...shared.tracker!, archived: true } };
    expect(canReadTracker(archived, "member-sub")).toBe(true);
    expect(canCreateTrackerTransaction(archived, "member-sub")).toBe(false);
    const revoked: Dataset = { ...shared, tracker: { ...shared.tracker!, access: "revoked" } };
    for (const dataset of [revoked, shared]) {
      expect(canReadTracker(dataset, null)).toBe(false);
      expect(canManageTrackerTransaction(dataset, "own", "other-sub")).toBe(false);
    }
    expect(canReadTracker(revoked, "member-sub")).toBe(false);
  });
});
