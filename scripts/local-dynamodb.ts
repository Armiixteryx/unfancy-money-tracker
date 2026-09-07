#!/usr/bin/env node
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  ResourceInUseException,
  waitUntilTableExists
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { DynamoDbSyncRepository } from "../src/server/repository/dynamoDbSyncRepository";

const command = process.argv[2] ?? "help";
const region = process.env.AWS_REGION ?? "us-east-1";
const endpoint = process.env.DYNAMODB_ENDPOINT ?? `http://127.0.0.1:${process.env.DYNAMODB_PORT ?? "8000"}`;
const tableName = process.env.SYNC_TABLE_NAME ?? "unfancy-local-sync";
const client = new DynamoDBClient({
  endpoint,
  region,
  credentials: { accessKeyId: "local", secretAccessKey: "local" }
});

async function main(): Promise<void> {
  if (command === "init") {
    await initialize();
    console.log(`DynamoDB Local table ${tableName} is ready.`);
    return;
  }
  if (command === "health") {
    await waitForEndpoint();
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (response.Table?.TableStatus !== "ACTIVE") throw new Error(`Table ${tableName} is not active`);
    console.log(`DynamoDB Local table ${tableName} is healthy.`);
    return;
  }
  if (command === "seed") {
    await initialize();
    const repository = new DynamoDbSyncRepository(
      DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } }),
      tableName
    );
    await repository.push(
      "local-synthetic-user",
      "00000000-0000-4000-8000-000000000001",
      [{
        idempotencyKey: "00000000-0000-4000-8000-000000000011",
        recordType: "category",
        recordId: "00000000-0000-4000-8000-000000000010",
        operation: "upsert",
        baseRevision: 0,
        revision: 1,
        tombstone: false,
        payload: {
          id: "00000000-0000-4000-8000-000000000010",
          kind: "expense",
          name: "Synthetic category",
          isSystem: false,
          isArchived: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      }]
    );
    console.log(`Synthetic fixture is present in ${tableName}.`);
    return;
  }

  console.log("Usage: pnpm exec tsx scripts/local-dynamodb.ts <init|health|seed>");
}

async function initialize(): Promise<void> {
  await waitForEndpoint();
  try {
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
      BillingMode: "PROVISIONED",
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 10 }
    }));
  } catch (error) {
    if (!(error instanceof ResourceInUseException) && !(error instanceof Error && error.name === "ResourceInUseException")) throw error;
  }
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
}

async function waitForEndpoint(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await client.send(new ListTablesCommand({ Limit: 1 }));
      return;
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("DynamoDB Local did not become available");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "DynamoDB Local command failed");
  process.exitCode = 1;
});
