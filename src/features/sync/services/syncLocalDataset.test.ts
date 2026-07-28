import { describe, expect, it } from "vitest";

import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { buildInitialSyncChanges, syncLocalDatasetWithRetry } from "./syncLocalDataset";
import { SyncClientError, type SyncClient } from "../../../platform/sync/types";

describe("initial sync changes", () => {
  it("includes local records and preference state without changing the dataset", () => {
    const dataset = createEmptyDataset(() => "11111111-1111-4111-8111-111111111111", "2026-07-01T00:00:00.000Z");
    const changes = buildInitialSyncChanges(dataset);
    expect(changes).toHaveLength(dataset.categories.length + 1);
    expect(changes.some((change) => change.recordType === "preference")).toBe(true);
    expect(changes.every((change) => change.baseRevision === 0)).toBe(true);
  });

  it("retries transient sync failures with bounded exponential delays", async () => {
    const dataset = createEmptyDataset(() => "11111111-1111-4111-8111-111111111111", "2026-07-01T00:00:00.000Z");
    let attempts = 0;
    const sleeps: number[] = [];
    const client: SyncClient = {
      async pull() { return { changes: [], cursor: "0" }; },
      async push(request) {
        attempts += 1;
        if (attempts < 3) throw new SyncClientError("offline", "offline");
        return { acknowledged: request.changes.map((change) => change.idempotencyKey), acknowledgedChanges: request.changes.map((change) => ({ idempotencyKey: change.idempotencyKey, recordType: change.recordType, recordId: change.recordId, revision: 1 })), conflicts: [], cursor: "0" };
      },
      async resolveConflict() { return { acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "0" }; }
    };
    await syncLocalDatasetWithRetry(dataset, client, { initialDelayMs: 10, sleep: async (delay) => { sleeps.push(delay); } });
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([10, 20]);
  });

  it("does not report a successful sync when the server omits outgoing changes", async () => {
    const dataset = createEmptyDataset(() => "11111111-1111-4111-8111-111111111111", "2026-07-01T00:00:00.000Z");
    const client: SyncClient = {
      async pull() { return { changes: [], cursor: "0" }; },
      async push() { return { acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "0" }; },
      async resolveConflict() { return { acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "0" }; }
    };

    await expect(syncLocalDatasetWithRetry(dataset, client)).rejects.toMatchObject({ code: "incomplete_sync" });
  });

  it("does not push duplicate default scaffolding when a fresh device finds cloud data", async () => {
    const dataset = createEmptyDataset(() => "11111111-1111-4111-8111-111111111111", "2026-07-01T00:00:00.000Z");
    const pushedBatchSizes: number[] = [];
    let pullCount = 0;
    const client: SyncClient = {
      async pull() {
        pullCount += 1;
        return pullCount === 1
          ? { changes: [{ idempotencyKey: "22222222-2222-4222-8222-222222222222", recordType: "preference", recordId: dataset.datasetId, operation: "upsert", baseRevision: 0, revision: 1, payload: dataset.preferences, tombstone: false }], cursor: "1" }
          : { changes: [], cursor: "1" };
      },
      async push(request) {
        pushedBatchSizes.push(request.changes.length);
        return { acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "1" };
      },
      async resolveConflict() { return { acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "1" }; }
    };
    const result = await syncLocalDatasetWithRetry(dataset, client);
    expect(pushedBatchSizes).toEqual([0]);
    expect(result.pulledChangeCount).toBe(1);
  });
});
