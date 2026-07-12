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
      async push() {
        attempts += 1;
        if (attempts < 3) throw new SyncClientError("offline", "offline");
        return { acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "0" };
      },
      async resolveConflict() { return { acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "0" }; }
    };
    await syncLocalDatasetWithRetry(dataset, client, { initialDelayMs: 10, sleep: async (delay) => { sleeps.push(delay); } });
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([10, 20]);
  });
});
