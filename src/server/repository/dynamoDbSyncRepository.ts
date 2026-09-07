import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient
} from "@aws-sdk/lib-dynamodb";

import { budgetSchema, categorySchema, preferencesSchema, transactionSchema } from "../../platform/persistence/schema";
import type { AcknowledgedChange, PullResponse, PushResponse, ResolveConflictRequest, SyncChange, SyncConflict } from "../contracts/sync";
import type { SyncRepository } from "./syncRepository";

type MetaItem = {
  pk: string;
  sk: "META";
  ownerSubject: string;
  datasetId: string;
  revision: number;
};

type RecordItem = {
  pk: string;
  sk: string;
  revision: number;
  payload: unknown | null;
  tombstone: boolean;
};

type ChangeItem = SyncChange & {
  pk: string;
  sk: string;
};

type IdempotencyItem = {
  pk: string;
  sk: string;
  idempotencyKey: string;
  recordType: SyncChange["recordType"];
  recordId: string;
  revision: number;
};

const MAX_WRITE_ATTEMPTS = 5;
const CHANGE_PAGE_SIZE = 500;
const REVISION_WIDTH = 20;

export class DynamoDbSyncRepository implements SyncRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async push(ownerSubject: string, datasetId: string, changes: readonly SyncChange[]): Promise<PushResponse> {
    const acknowledged: string[] = [];
    const acknowledgedChanges: AcknowledgedChange[] = [];
    const conflicts: SyncConflict[] = [];

    for (const change of changes) {
      validateChange(datasetId, change);
      const result = await this.applyChange(ownerSubject, datasetId, change);
      if ("conflict" in result) {
        conflicts.push(result.conflict);
        continue;
      }
      acknowledged.push(change.idempotencyKey);
      acknowledgedChanges.push({
        idempotencyKey: change.idempotencyKey,
        recordType: change.recordType,
        recordId: change.recordId,
        revision: result.revision
      });
    }

    return {
      acknowledged,
      acknowledgedChanges,
      conflicts,
      cursor: String(await this.currentRevision(ownerSubject, datasetId))
    };
  }

  async pull(ownerSubject: string, datasetId: string, cursor: string): Promise<PullResponse> {
    const numericCursor = Number.parseInt(cursor, 10);
    const pk = datasetKey(ownerSubject, datasetId);
    const response = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "#pk = :pk AND #sk BETWEEN :start AND :end",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExpressionAttributeValues: {
        ":pk": pk,
        ":start": changeKey(numericCursor + 1),
        ":end": "CHANGE#\uffff"
      },
      ConsistentRead: true,
      Limit: CHANGE_PAGE_SIZE
    }));

    const items = (response.Items ?? []) as ChangeItem[];
    const changes = items.map<SyncChange>((item) => ({
      idempotencyKey: item.idempotencyKey,
      recordType: item.recordType,
      recordId: item.recordId,
      operation: item.operation,
      baseRevision: item.baseRevision,
      revision: item.revision,
      payload: item.payload,
      tombstone: item.tombstone
    }));

    return {
      changes,
      cursor: String(changes.at(-1)?.revision ?? numericCursor)
    };
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

  private async applyChange(
    ownerSubject: string,
    datasetId: string,
    change: SyncChange
  ): Promise<{ revision: number } | { conflict: SyncConflict }> {
    const pk = datasetKey(ownerSubject, datasetId);
    const idempotency = await this.getItem<IdempotencyItem>(pk, idempotencyKey(change.idempotencyKey));
    if (idempotency) return { revision: idempotency.revision };

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const [meta, current, repeated] = await Promise.all([
        this.getItem<MetaItem>(pk, "META"),
        this.getItem<RecordItem>(pk, recordKey(change)),
        this.getItem<IdempotencyItem>(pk, idempotencyKey(change.idempotencyKey))
      ]);
      if (repeated) return { revision: repeated.revision };

      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== change.baseRevision) {
        return {
          conflict: {
            recordType: change.recordType,
            recordId: change.recordId,
            localRevision: change.baseRevision,
            cloudRevision: currentRevision,
            localPayload: change.payload,
            cloudPayload: current?.payload ?? null,
            resolution: "pending"
          }
        };
      }

      const datasetRevision = meta?.revision ?? 0;
      const revision = datasetRevision + 1;
      try {
        await this.client.send(new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.tableName,
                Key: { pk, sk: "META" },
                UpdateExpression: "SET #owner = :owner, #dataset = :dataset, #revision = :nextRevision",
                ConditionExpression: "attribute_not_exists(#revision) OR #revision = :expectedRevision",
                ExpressionAttributeNames: {
                  "#owner": "ownerSubject",
                  "#dataset": "datasetId",
                  "#revision": "revision"
                },
                ExpressionAttributeValues: {
                  ":owner": ownerSubject,
                  ":dataset": datasetId,
                  ":expectedRevision": datasetRevision,
                  ":nextRevision": revision
                }
              }
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  pk,
                  sk: recordKey(change),
                  recordType: change.recordType,
                  recordId: change.recordId,
                  operation: change.operation,
                  baseRevision: change.baseRevision,
                  revision,
                  payload: change.payload,
                  tombstone: change.tombstone
                },
                ConditionExpression: change.baseRevision === 0
                  ? "attribute_not_exists(#pk)"
                  : "#revision = :baseRevision",
                ExpressionAttributeNames: change.baseRevision === 0
                  ? { "#pk": "pk" }
                  : { "#revision": "revision" },
                ExpressionAttributeValues: change.baseRevision === 0
                  ? undefined
                  : { ":baseRevision": change.baseRevision }
              }
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  pk,
                  sk: changeKey(revision),
                  idempotencyKey: change.idempotencyKey,
                  recordType: change.recordType,
                  recordId: change.recordId,
                  operation: change.operation,
                  baseRevision: change.baseRevision,
                  revision,
                  payload: change.payload,
                  tombstone: change.tombstone
                },
                ConditionExpression: "attribute_not_exists(#pk)",
                ExpressionAttributeNames: { "#pk": "pk" }
              }
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  pk,
                  sk: idempotencyKey(change.idempotencyKey),
                  idempotencyKey: change.idempotencyKey,
                  recordType: change.recordType,
                  recordId: change.recordId,
                  revision
                },
                ConditionExpression: "attribute_not_exists(#pk)",
                ExpressionAttributeNames: { "#pk": "pk" }
              }
            }
          ]
        }));
        return { revision };
      } catch (error) {
        if (!isTransactionContention(error) || attempt === MAX_WRITE_ATTEMPTS - 1) throw error;
      }
    }

    throw new Error("DynamoDB write attempts were exhausted");
  }

  private async currentRevision(ownerSubject: string, datasetId: string): Promise<number> {
    const meta = await this.getItem<MetaItem>(datasetKey(ownerSubject, datasetId), "META");
    return meta?.revision ?? 0;
  }

  private async getItem<T>(pk: string, sk: string): Promise<T | undefined> {
    const response = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk, sk },
      ConsistentRead: true
    }));
    return response.Item as T | undefined;
  }
}

function validateChange(datasetId: string, change: SyncChange): void {
  if (change.operation === "delete") {
    if (!change.tombstone || change.payload !== null) throw invalidSyncPayload();
    return;
  }
  if (change.tombstone || change.payload === null) throw invalidSyncPayload();

  const schema = change.recordType === "transaction"
    ? transactionSchema
    : change.recordType === "category"
      ? categorySchema
      : change.recordType === "budget"
        ? budgetSchema
        : preferencesSchema;
  const record = schema.parse(change.payload);
  const recordId = change.recordType === "preference"
    ? datasetId
    : "id" in record && typeof record.id === "string"
      ? record.id
      : null;
  if (recordId !== change.recordId) throw invalidSyncPayload();
}

function datasetKey(ownerSubject: string, datasetId: string): string {
  return `OWNER#${ownerSubject}#DATASET#${datasetId}`;
}

function recordKey(change: Pick<SyncChange, "recordType" | "recordId">): string {
  return `RECORD#${change.recordType}#${change.recordId}`;
}

function idempotencyKey(key: string): string {
  return `IDEMPOTENCY#${key}`;
}

function changeKey(revision: number): string {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid dataset revision");
  return `CHANGE#${String(revision).padStart(REVISION_WIDTH, "0")}`;
}

function isTransactionContention(error: unknown): boolean {
  return error instanceof Error && (
    error.name === "TransactionCanceledException"
    || error.name === "TransactionConflictException"
  );
}

function invalidSyncPayload(): Error {
  const error = new Error("Invalid sync payload");
  error.name = "InvalidSyncPayloadError";
  return error;
}
