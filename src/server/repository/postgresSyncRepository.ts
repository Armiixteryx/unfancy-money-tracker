import { Pool, type PoolClient } from "pg";

import type { AcknowledgedChange, PullResponse, PushResponse, ResolveConflictRequest, SyncChange, SyncConflict } from "../../platform/sync/types";
import type { SyncRepository } from "./syncRepository";

type RecordRow = { revision: string; payload: unknown | null; tombstone: boolean };
type DatasetRow = { revision: string; owner_subject: string };
type ChangeRow = { idempotency_key: string; record_type: SyncChange["recordType"]; record_id: string; operation: SyncChange["operation"]; base_revision: string; revision: string; payload: unknown | null; tombstone: boolean; sequence: string };

export class PostgresSyncRepository implements SyncRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 10_000 });
  }

  async push(ownerSubject: string, datasetId: string, changes: readonly SyncChange[]): Promise<PushResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.ensureDataset(client, ownerSubject, datasetId);
      const acknowledged: string[] = [];
      const acknowledgedChanges: AcknowledgedChange[] = [];
      const conflicts: SyncConflict[] = [];

      for (const change of changes) {
        const idempotency = await client.query<{ idempotency_key: string; response: unknown }>(
          "SELECT idempotency_key, response FROM sync_idempotency WHERE dataset_id = $1 AND idempotency_key = $2",
          [datasetId, change.idempotencyKey]
        );
        if (idempotency.rowCount) {
          acknowledged.push(change.idempotencyKey);
          const response = idempotency.rows[0]?.response;
          const revision = typeof response === "object" && response !== null && "revision" in response && typeof response.revision === "number" ? response.revision : change.revision;
          acknowledgedChanges.push({ idempotencyKey: change.idempotencyKey, recordType: change.recordType, recordId: change.recordId, revision });
          continue;
        }

        const current = await client.query<RecordRow>(
          "SELECT revision, payload, tombstone FROM sync_records WHERE dataset_id = $1 AND entity_type = $2 AND record_id = $3 FOR UPDATE",
          [datasetId, change.recordType, change.recordId]
        );
        const currentRow = current.rows[0];
        const currentRevision = currentRow ? Number.parseInt(currentRow.revision, 10) : 0;
        if (change.baseRevision !== currentRevision) {
          conflicts.push({
            recordType: change.recordType,
            recordId: change.recordId,
            localRevision: change.baseRevision,
            cloudRevision: currentRevision,
            localPayload: change.payload,
            cloudPayload: currentRow?.payload ?? null,
            resolution: "pending"
          });
          continue;
        }

        const revision = await this.nextRevision(client, datasetId);
        await client.query(
          `INSERT INTO sync_records (dataset_id, entity_type, record_id, revision, base_revision, operation, payload, tombstone)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
           ON CONFLICT (dataset_id, entity_type, record_id) DO UPDATE SET revision = EXCLUDED.revision, base_revision = EXCLUDED.base_revision, operation = EXCLUDED.operation, payload = EXCLUDED.payload, tombstone = EXCLUDED.tombstone, updated_at = CURRENT_TIMESTAMP`,
          [datasetId, change.recordType, change.recordId, revision, change.baseRevision, change.operation, change.payload === null ? null : JSON.stringify(change.payload), change.tombstone]
        );
        await client.query(
          `INSERT INTO sync_changes (dataset_id, entity_type, record_id, revision, base_revision, operation, payload, tombstone, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
          [datasetId, change.recordType, change.recordId, revision, change.baseRevision, change.operation, change.payload === null ? null : JSON.stringify(change.payload), change.tombstone, change.idempotencyKey]
        );
        await client.query(
          "INSERT INTO sync_idempotency (dataset_id, idempotency_key, response) VALUES ($1, $2, $3::jsonb)",
          [datasetId, change.idempotencyKey, JSON.stringify({ revision })]
        );
        acknowledged.push(change.idempotencyKey);
        acknowledgedChanges.push({ idempotencyKey: change.idempotencyKey, recordType: change.recordType, recordId: change.recordId, revision });
      }

      const cursor = await this.currentCursor(client, datasetId);
      await client.query("COMMIT");
      return { acknowledged, acknowledgedChanges, conflicts, cursor };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async pull(ownerSubject: string, datasetId: string, cursor: string): Promise<PullResponse> {
    const client = await this.pool.connect();
    try {
      await this.assertOwner(client, ownerSubject, datasetId);
      const rows = await client.query<ChangeRow>(
        `SELECT idempotency_key, entity_type AS record_type, record_id, operation, base_revision, revision, payload, tombstone, sequence
         FROM sync_changes WHERE dataset_id = $1 AND sequence > $2 ORDER BY sequence ASC LIMIT 500`,
        [datasetId, cursor]
      );
      const changes: SyncChange[] = rows.rows.map((row) => ({
        idempotencyKey: row.idempotency_key,
        recordType: row.record_type,
        recordId: row.record_id,
        operation: row.operation,
        baseRevision: Number.parseInt(row.base_revision, 10),
        revision: Number.parseInt(row.revision, 10),
        payload: row.payload,
        tombstone: row.tombstone
      }));
      const nextCursor = rows.rows.at(-1)?.sequence ?? cursor;
      return { changes, cursor: nextCursor };
    } finally {
      client.release();
    }
  }

  async resolveConflict(ownerSubject: string, request: ResolveConflictRequest): Promise<PushResponse> {
    const payload = request.choice === "keep_local" ? request.conflict.localPayload : request.conflict.cloudPayload;
    return this.push(ownerSubject, request.datasetId, [{
      idempotencyKey: crypto.randomUUID(),
      recordType: request.conflict.recordType,
      recordId: request.conflict.recordId,
      operation: payload === null ? "delete" : "upsert",
      baseRevision: request.conflict.cloudRevision,
      payload,
      tombstone: payload === null,
      revision: request.conflict.cloudRevision + 1
    }]);
  }

  private async ensureDataset(client: PoolClient, ownerSubject: string, datasetId: string): Promise<void> {
    await client.query("INSERT INTO datasets (dataset_id, owner_subject) VALUES ($1, $2) ON CONFLICT (dataset_id) DO NOTHING", [datasetId, ownerSubject]);
    await this.assertOwner(client, ownerSubject, datasetId);
  }

  private async assertOwner(client: PoolClient, ownerSubject: string, datasetId: string): Promise<void> {
    const result = await client.query<DatasetRow>("SELECT revision, owner_subject FROM datasets WHERE dataset_id = $1", [datasetId]);
    const dataset = result.rows[0];
    if (!dataset || dataset.owner_subject !== ownerSubject) throw new Error("Dataset is not available");
  }

  private async nextRevision(client: PoolClient, datasetId: string): Promise<number> {
    const result = await client.query<DatasetRow>("UPDATE datasets SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE dataset_id = $1 RETURNING revision, owner_subject", [datasetId]);
    return Number.parseInt(result.rows[0]?.revision ?? "0", 10);
  }

  private async currentCursor(client: PoolClient, datasetId: string): Promise<string> {
    const result = await client.query<{ sequence: string }>("SELECT sequence FROM sync_changes WHERE dataset_id = $1 ORDER BY sequence DESC LIMIT 1", [datasetId]);
    return result.rows[0]?.sequence ?? "0";
  }
}
