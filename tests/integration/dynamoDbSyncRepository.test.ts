import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DynamoDbSyncRepository } from "../../src/server/repository/dynamoDbSyncRepository";
import type { SyncChange } from "../../src/server/contracts/sync";

const endpoint = process.env.DYNAMODB_ENDPOINT ?? "http://127.0.0.1:8000";
const region = process.env.AWS_REGION ?? "us-east-1";
const tableName = `unfancy-sync-test-${process.pid}`;
const datasetId = "00000000-0000-4000-8000-000000000001";
const owner = "integration-owner";
const client = new DynamoDBClient({
  endpoint,
  region,
  credentials: { accessKeyId: "local", secretAccessKey: "local" }
});
const repository = new DynamoDbSyncRepository(
  DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } }),
  tableName
);

beforeAll(async () => {
  await client.send(new CreateTableCommand({
    TableName: tableName,
    KeySchema: [
      { AttributeName: "pk", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" }
    ],
    AttributeDefinitions: [
      { AttributeName: "pk", AttributeType: "S" },
      { AttributeName: "sk", AttributeType: "S" }
    ],
    BillingMode: "PAY_PER_REQUEST"
  }));
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
});

afterAll(async () => {
  await client.send(new DeleteTableCommand({ TableName: tableName }));
  client.destroy();
});

describe("DynamoDbSyncRepository", () => {
  it("stores ordered changes and makes retries idempotent", async () => {
    const change = categoryChange(
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000010",
      "Food"
    );
    const first = await repository.push(owner, datasetId, [change]);
    const repeated = await repository.push(owner, datasetId, [change]);

    expect(first.acknowledgedChanges[0]?.revision).toBe(1);
    expect(repeated.acknowledgedChanges[0]?.revision).toBe(1);
    const pulled = await repository.pull(owner, datasetId, "0");
    expect(pulled.changes).toHaveLength(1);
    expect(pulled.cursor).toBe("1");
  });

  it("returns a conflict without overwriting the cloud record", async () => {
    const recordId = "00000000-0000-4000-8000-000000000020";
    await repository.push(owner, datasetId, [categoryChange(
      "00000000-0000-4000-8000-000000000021",
      recordId,
      "Cloud"
    )]);

    const response = await repository.push(owner, datasetId, [categoryChange(
      "00000000-0000-4000-8000-000000000022",
      recordId,
      "Local",
      0
    )]);
    expect(response.conflicts).toMatchObject([{
      recordId,
      localRevision: 0,
      cloudRevision: 2,
      resolution: "pending"
    }]);
    expect(response.acknowledged).toEqual([]);
  });

  it("isolates identical dataset identifiers by Cognito subject", async () => {
    const otherOwner = "another-integration-owner";
    expect((await repository.pull(otherOwner, datasetId, "0")).changes).toEqual([]);
    await repository.push(otherOwner, datasetId, [categoryChange(
      "00000000-0000-4000-8000-000000000031",
      "00000000-0000-4000-8000-000000000030",
      "Other owner"
    )]);
    expect((await repository.pull(otherOwner, datasetId, "0")).changes).toHaveLength(1);
    expect((await repository.pull(owner, datasetId, "0")).changes).toHaveLength(2);
  });

  it("assigns distinct revisions to concurrent unrelated writes", async () => {
    const responses = await Promise.all([
      repository.push(owner, datasetId, [categoryChange(
        "00000000-0000-4000-8000-000000000041",
        "00000000-0000-4000-8000-000000000040",
        "First"
      )]),
      repository.push(owner, datasetId, [categoryChange(
        "00000000-0000-4000-8000-000000000051",
        "00000000-0000-4000-8000-000000000050",
        "Second"
      )])
    ]);
    const revisions = responses.map((response) => response.acknowledgedChanges[0]?.revision).sort((left, right) => (left ?? 0) - (right ?? 0));
    expect(revisions).toEqual([3, 4]);
  });

  it("keeps handler authentication and error responses at the API boundary", async () => {
    process.env.SYNC_TABLE_NAME = tableName;
    process.env.DYNAMODB_ENDPOINT = endpoint;
    process.env.AWS_REGION = region;
    const { handler } = await import("../../src/server/handlers/sync");

    process.env.APP_ENV = "dev";
    const unauthorized = await handler(apiEvent("/sync/pull", JSON.stringify({ datasetId, cursor: "0" })));
    expect(unauthorized).toMatchObject({ statusCode: 401 });

    process.env.APP_ENV = "local";
    const invalid = await handler(apiEvent("/sync/push", JSON.stringify({ datasetId, changes: [{ sensitive: "not-echoed" }] }), owner));
    expect(invalid).toMatchObject({ statusCode: 400, body: JSON.stringify({ error: "invalid_request" }) });
  });
});

function categoryChange(idempotencyKey: string, recordId: string, name: string, baseRevision = 0): SyncChange {
  return {
    idempotencyKey,
    recordType: "category",
    recordId,
    operation: "upsert",
    baseRevision,
    revision: baseRevision + 1,
    tombstone: false,
    payload: {
      id: recordId,
      kind: "expense",
      name,
      isSystem: false,
      isArchived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  };
}

function apiEvent(path: string, body: string, subject?: string): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: "",
    headers: subject ? { "x-local-subject": subject } : {},
    requestContext: {
      accountId: "offlineContext_accountId",
      apiId: "offlineContext_apiId",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method: "POST",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest"
      },
      requestId: "offlineContext_requestId",
      routeKey: "$default",
      stage: "$default",
      time: "01/Jan/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    body,
    isBase64Encoded: false
  };
}
