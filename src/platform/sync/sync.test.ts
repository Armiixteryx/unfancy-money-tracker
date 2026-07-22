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

  it("uses preflight-free requests without credentials only for local web preview", async () => {
    let headers = new Headers();
    const client = new HttpSyncClient("http://127.0.0.1:3001", async () => "synthetic-token", {
      useSimpleLocalRequests: true,
      fetcher: async (_input, init) => {
        headers = new Headers(init?.headers);
        return new Response(JSON.stringify({ acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "0" }), { status: 200 });
      }
    });
    await client.push({ datasetId, changes: [] });
    expect(headers.get("content-type")).toBe("text/plain;charset=UTF-8");
    expect(headers.has("authorization")).toBe(false);
  });

  it("invokes Chrome's fetch with the browser global as its receiver", async () => {
    const fetcher = function(this: unknown): Promise<Response> {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response(JSON.stringify({ acknowledged: [], acknowledgedChanges: [], conflicts: [], cursor: "0" }), { status: 200 }));
    } as typeof fetch;
    const client = new HttpSyncClient("http://127.0.0.1:3001", async () => "synthetic-token", { fetcher, useSimpleLocalRequests: true });
    await client.push({ datasetId, changes: [] });
  });
});
