import type { PullRequest, PullResponse, PushRequest, PushResponse, ResolveConflictRequest, SyncChange, SyncClient } from "./types";
import { createUuid } from "../identifiers/createUuid";

export class LocalSyncClient implements SyncClient {
  private readonly changes: SyncChange[] = [];
  private readonly records = new Map<string, SyncChange>();
  private cursor = 0;
  private readonly idempotency = new Map<string, { recordType: SyncChange["recordType"]; recordId: string; revision: number }>();

  async push(request: PushRequest): Promise<PushResponse> {
    const acknowledged: string[] = [];
    const acknowledgedChanges: { idempotencyKey: string; recordType: SyncChange["recordType"]; recordId: string; revision: number }[] = [];
    const conflicts: import("./types").SyncConflict[] = [];
    for (const change of request.changes) {
      const previous = this.idempotency.get(change.idempotencyKey);
      if (previous) {
        acknowledged.push(change.idempotencyKey);
        acknowledgedChanges.push({ idempotencyKey: change.idempotencyKey, ...previous });
        continue;
      }
      const key = `${request.datasetId}:${change.recordType}:${change.recordId}`;
      const existing = this.records.get(key);
      const existingRevision = existing?.revision ?? 0;
      if (existing && change.baseRevision !== existingRevision) {
        conflicts.push({ recordType: change.recordType, recordId: change.recordId, localRevision: change.baseRevision, cloudRevision: existingRevision, localPayload: change.payload, cloudPayload: existing.payload, resolution: "pending" });
        continue;
      }
      const next = { ...change, revision: existingRevision + 1 };
      this.records.set(key, next);
      this.changes.push(next);
      this.cursor += 1;
      this.idempotency.set(change.idempotencyKey, { recordType: change.recordType, recordId: change.recordId, revision: next.revision });
      acknowledged.push(change.idempotencyKey);
      acknowledgedChanges.push({ idempotencyKey: change.idempotencyKey, recordType: change.recordType, recordId: change.recordId, revision: next.revision });
    }
    return { acknowledged, acknowledgedChanges, conflicts, cursor: String(this.cursor) };
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
        idempotencyKey: createUuid(),
        recordType: request.conflict.recordType,
        recordId: request.conflict.recordId,
        operation: payload === null ? "delete" : "upsert",
        baseRevision: request.conflict.cloudRevision,
        payload,
        tombstone: payload === null,
        revision: request.conflict.cloudRevision + 1
      }]
    });
  }
}
