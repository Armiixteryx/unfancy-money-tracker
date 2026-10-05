import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { z } from "zod";
import { rateRecordSchema, type RateCache, type RateRecord } from "../../platform/exchange-rates/types";
import { getPostgresPool } from "./postgres";
import { PostgresRateCache } from "./postgresRateCache";
export const rateCacheOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation:z.literal("get"),key:z.string().min(1).max(128) }).strict(),
  z.object({ operation:z.literal("set"),key:z.string().min(1).max(128),record:rateRecordSchema }).strict()
]);
export class InvokedRateCache implements RateCache {
  constructor(private readonly client: LambdaClient, private readonly functionName: string) {}
  private async invoke(request: z.infer<typeof rateCacheOperationSchema>) {
    const result = await this.client.send(new InvokeCommand({ FunctionName:this.functionName,InvocationType:"RequestResponse",Payload:Buffer.from(JSON.stringify(rateCacheOperationSchema.parse(request))) }));
    if (result.FunctionError || !result.Payload) throw new Error("Rate cache unavailable");
    return JSON.parse(Buffer.from(result.Payload).toString("utf8")) as unknown;
  }
  async get(key: string) { return rateRecordSchema.nullable().parse(await this.invoke({ operation:"get",key })); }
  async set(key: string, record: RateRecord) { await this.invoke({ operation:"set",key,record }); }
}
export function createSharedRateCache(): RateCache {
  if (process.env.APP_ENV === "local") return {
    get:async key => new PostgresRateCache(await getPostgresPool()).get(key),
    set:async (key,record) => new PostgresRateCache(await getPostgresPool()).set(key,record)
  };
  if (!process.env.RATE_CACHE_FUNCTION_NAME) throw new Error("Rate cache is not configured");
  return new InvokedRateCache(new LambdaClient({ maxAttempts:2,requestHandler:{ connectionTimeout:1000,requestTimeout:3000 } }),process.env.RATE_CACHE_FUNCTION_NAME);
}
