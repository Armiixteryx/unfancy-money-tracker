import { describe, expect, it } from "vitest";

import { LocalSyncClient } from "./localSyncClient";

const datasetId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000002";
const idempotencyKey = "00000000-0000-4000-8000-000000000003";

describe("local sync adapter", () => {
  it("pushes, pulls, and resolves through the record-level boundary", async () => {
    const sync = new LocalSyncClient();
    const pushed = await sync.push({
      datasetId,
      changes: [{ idempotencyKey, recordType: "category", recordId, operation: "upsert", baseRevision: 0, payload: { name: "Synthetic" }, tombstone: false }]
    });
    expect(pushed.acknowledged).toEqual([idempotencyKey]);
    expect((await sync.pull({ datasetId, cursor: "0" })).changes).toHaveLength(1);
  });
});

