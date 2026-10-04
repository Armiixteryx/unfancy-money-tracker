import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { DynamoDbRateCache } from "../../src/server/repository/dynamoDbRateCache";
import { FrankfurterExchangeRateAdapter } from "../../src/platform/exchange-rates/frankfurterExchangeRateAdapter";

const client = new DynamoDBClient({ region: "us-east-1", endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://127.0.0.1:8000", credentials: { accessKeyId: "local", secretAccessKey: "local" } });
const tableName = `unfancy-rates-test-${process.pid}`;
const cache = () => new DynamoDbRateCache(DynamoDBDocumentClient.from(client), tableName);
beforeAll(async () => { await client.send(new CreateTableCommand({ TableName: tableName, BillingMode: "PAY_PER_REQUEST", AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }], KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }] })); });
afterAll(async () => { await client.send(new DeleteTableCommand({ TableName: tableName })); client.destroy(); });
it("reuses latest and requested historical records between independent provider instances", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([{ base: "USD", quote: "EUR", rate: 0.91, date: "2026-10-02" }])));
  const first = new FrankfurterExchangeRateAdapter(cache(), fetcher);
  const second = new FrankfurterExchangeRateAdapter(cache(), fetcher);
  const latest = await first.getLatestRate("USD", "EUR");
  expect(await second.getLatestRate("USD", "EUR")).toEqual(latest);
  const historical = await first.getHistoricalRate("USD", "EUR", "2026-10-04");
  expect(await second.getHistoricalRate("USD", "EUR", "2026-10-04")).toEqual(historical);
  expect(historical.effectiveDate).toBe("2026-10-02");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
