import { describe, expect, it } from "vitest";

import { HttpSyncClient } from "./httpSyncClient";
import { LocalSyncClient } from "./localSyncClient";

const datasetId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000002";
const idempotencyKey = "00000000-0000-4000-8000-000000000003";

describe("local sync adapter", () => {
  it("pushes, pulls, and resolves through the record-level boundary", async () => {
    const sync = new LocalSyncClient();
    const pushed = await sync.push({
      datasetId,
      changes: [{ idempotencyKey, recordType: "category", recordId, operation: "upsert", baseRevision: 0, payload: { name: "Synthetic" }, tombstone: false, revision: 1 }]
    });
    expect(pushed.acknowledged).toEqual([idempotencyKey]);
    expect((await sync.pull({ datasetId, cursor: "0" })).changes).toHaveLength(1);
  });
});

describe("http sync adapter", () => {
  it("validates server responses at the transport boundary", async () => {
    const client = new HttpSyncClient("http://localhost:3001", async () => "synthetic-token", {
      fetcher: async () => new Response(JSON.stringify({ acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "0" }), { status: 200 })
    });
    const response = await client.push({ datasetId, changes: [] });
    expect(response.cursor).toBe("0");
  });

  it("rejects malformed server responses without exposing the body", async () => {
    const client = new HttpSyncClient("http://localhost:3001", async () => "synthetic-token", {
      fetcher: async () => new Response(JSON.stringify({ unexpected: "synthetic" }), { status: 200 })
    });
    await expect(client.push({ datasetId, changes: [] })).rejects.toMatchObject({ code: "invalid_request" });
  });
});
