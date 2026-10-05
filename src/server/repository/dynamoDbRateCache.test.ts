import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { DynamoDbRateCache } from "./dynamoDbRateCache";
import type { RateRecord } from "../../platform/exchange-rates/types";

const record: RateRecord = { base: "USD", quote: "EUR", rate: "0.91", effectiveDate: "2026-10-02", fetchedAt: "2026-10-04T12:00:00Z", provider: "frankfurter-blended", status: "fresh" };
describe("DynamoDB shared rate cache", () => {
  it("reads strongly consistently and writes validated records without TTL", async () => {
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
    const send = vi.spyOn(client, "send").mockImplementation(async () => ({ Item: { record }, $metadata: {} }));
    const cache = new DynamoDbRateCache(client, "synthetic-rates");
    expect(await cache.get("latest:USD:EUR")).toEqual(record);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetCommand);
    expect(send.mock.calls[0]?.[0].input).toEqual({ TableName: "synthetic-rates", Key: { pk: "latest:USD:EUR" }, ConsistentRead: true });
    await cache.set("latest:USD:EUR", record);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(PutCommand);
    expect(send.mock.calls[1]?.[0].input).toEqual({ TableName: "synthetic-rates", Item: { pk: "latest:USD:EUR", record } });
    client.destroy();
  });

  it("treats malformed stored entries as misses", async () => {
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
    vi.spyOn(client, "send").mockImplementation(async () => ({ Item: { record: { ...record, rate: "0" } }, $metadata: {} }));
    expect(await new DynamoDbRateCache(client, "synthetic-rates").get("latest:USD:EUR")).toBeNull();
    client.destroy();
  });
});
