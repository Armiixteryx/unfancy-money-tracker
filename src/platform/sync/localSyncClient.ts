import { v4 as uuid } from "uuid";

import type { PullRequest, PullResponse, PushRequest, PushResponse, ResolveConflictRequest, SyncChange, SyncClient } from "./types";

export class LocalSyncClient implements SyncClient {
  private readonly changes: SyncChange[] = [];
  private readonly records = new Map<string, SyncChange>();
  private cursor = 0;

  async push(request: PushRequest): Promise<PushResponse> {
    const acknowledged: string[] = [];
    for (const change of request.changes) {
      const key = `${request.datasetId}:${change.recordType}:${change.recordId}`;
      const existing = this.records.get(key);
      const existingRevision = existing ? existing.baseRevision + 1 : 0;
      if (existing && change.baseRevision !== existingRevision) continue;
      const next = { ...change };
      this.records.set(key, next);
      this.changes.push(next);
      this.cursor += 1;
      acknowledged.push(change.idempotencyKey);
    }
    return { acknowledged, conflicts: [], cursor: String(this.cursor) };
  }

  async pull(request: PullRequest): Promise<PullResponse> {
    const cursor = Number.parseInt(request.cursor, 10);
    const changes = this.changes.slice(cursor);
    return { changes, cursor: String(cursor + changes.length) };
  }

  async resolveConflict(request: ResolveConflictRequest): Promise<PushResponse> {
    const payload = request.choice === "keep_local" ? request.conflict.localPayload : request.conflict.cloudPayload;
    return this.push({
      datasetId: request.datasetId,
      changes: [{
        idempotencyKey: uuid(),
        recordType: request.conflict.recordType,
        recordId: request.conflict.recordId,
        operation: payload === null ? "delete" : "upsert",
        baseRevision: request.conflict.cloudRevision,
        payload,
        tombstone: payload === null
      }]
    });
  }
}

