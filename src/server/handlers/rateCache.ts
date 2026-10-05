import { getPostgresPool } from "../repository/postgres";
import { PostgresRateCache } from "../repository/postgresRateCache";
import { rateCacheOperationSchema } from "../repository/invokedRateCache";
// No public route or function URL: only IAM-authorized InvokeFunction access.
export async function handler(event: unknown) {
  try {
    const operation = rateCacheOperationSchema.parse(event);
    const cache = new PostgresRateCache(await getPostgresPool());
    if (operation.operation === "get") return await cache.get(operation.key);
    await cache.set(operation.key, operation.record);
    return null;
  } catch {
    throw new Error("Rate cache unavailable");
  }
}
