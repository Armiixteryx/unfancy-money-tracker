import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { rateRecordSchema, type RateCache, type RateRecord } from "../../platform/exchange-rates/types";

export class DynamoDbRateCache implements RateCache {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string) {}

  async get(key: string): Promise<RateRecord | null> {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: key }, ConsistentRead: true }));
    const parsed = rateRecordSchema.safeParse(Item?.record);
    return parsed.success ? parsed.data : null;
  }

  async set(key: string, record: RateRecord): Promise<void> {
    const validated = rateRecordSchema.parse(record);
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: { pk: key, record: validated } }));
  }
}

export function createSharedRateCache(): RateCache {
  const tableName = process.env.RATE_CACHE_TABLE_NAME;
  if (!tableName) throw new Error("Rate cache table is not configured.");
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 1000, requestTimeout: 2000 }
  }));
  return new DynamoDbRateCache(client, tableName);
}
