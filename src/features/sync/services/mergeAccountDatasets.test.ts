import { describe, expect, it } from "vitest";

import { createMockDataset } from "../../development/mockData";
import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { LocalSyncClient } from "../../../platform/sync/localSyncClient";
import { scopeDatasetToAccount } from "./accountDatasetNamespace";
import { mergeAccountDatasets } from "./mergeAccountDatasets";
import { syncLocalDatasetWithRetry } from "./syncLocalDataset";

describe("mergeAccountDatasets", () => {
  it("queues and uploads local-only records when an account cache was previously synced empty", async () => {
    const accountId = "local-shared-account";
    const now = new Date("2026-07-22T20:00:00.000Z");
    const local = scopeDatasetToAccount(createMockDataset("edge-cases", "00000000-0000-4000-8000-000000000001", { now }), accountId);
    const account = scopeDatasetToAccount(createEmptyDataset(undefined, now.toISOString()), accountId);
    const cachedAccount = {
      ...account,
      sync: { ...account.sync, status: "synced" as const, inboxCursor: "0", lastSyncedAt: now.toISOString() }
    };

    const merged = mergeAccountDatasets(local, cachedAccount);
    const expectedRecords = local.transactions.length + local.categories.length + local.budgets.length + local.recordTombstones.length + 1;

    expect(merged.sync.status).toBe("stale");
    expect(merged.sync.outbox).toHaveLength(expectedRecords);
    expect(merged.sync.outbox.some((change) => change.recordType === "transaction")).toBe(true);
    expect(merged.sync.outbox.some((change) => change.recordType === "category" && change.payload && typeof change.payload === "object" && "isArchived" in change.payload && change.payload.isArchived === true)).toBe(true);
    expect(merged.sync.outbox.some((change) => change.operation === "delete" && change.recordType === "category")).toBe(true);
    expect(merged.sync.outbox.some((change) => change.recordType === "preference")).toBe(true);

    const synced = await syncLocalDatasetWithRetry(merged, new LocalSyncClient());
    expect(synced.push.acknowledged).toHaveLength(expectedRecords);
  });
});
