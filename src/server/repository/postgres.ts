import { readFileSync } from "node:fs";
import { Pool, type PoolConfig } from "pg";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { z } from "zod";

// Repositories receive a plain pg Pool and have no AWS dependency.
export function createPostgresPool(config: PoolConfig): Pool {
  const pool = new Pool({
    ...config,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 60000,
    statement_timeout: 10000,
  });
  pool.on("error", () => {
    /* Deliberately omit database diagnostics and query contents. */
  });
  return pool;
}
const secrets = new SecretsManagerClient({ maxAttempts: 2 });
let pool: Promise<Pool> | null = null;
const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  host: z.string().optional(),
  port: z.number().optional(),
  dbname: z.string().optional(),
});
export function portablePoolConfig(environment: {
  APP_ENV?: string;
  DATABASE_URL?: string;
  PG_CA_FILE?: string;
}): PoolConfig {
  const local = environment.APP_ENV === "local";
  if (!local && !environment.PG_CA_FILE)
    throw new Error("Verified database TLS is required");
  if (environment.DATABASE_URL) {
    const url = new URL(environment.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol))
      throw new Error("Invalid database configuration");
    // pg parses these URL options after PoolConfig and would replace the verified CA.
    if (
      [...url.searchParams.keys()].some((key) =>
        key.toLowerCase().startsWith("ssl"),
      )
    )
      throw new Error("Configure database TLS through PG_CA_FILE");
  }
  return {
    connectionString: environment.DATABASE_URL,
    ssl: environment.PG_CA_FILE
      ? {
          ca: readFileSync(environment.PG_CA_FILE, "utf8"),
          rejectUnauthorized: true,
        }
      : false,
  };
}
export function getPostgresPool(): Promise<Pool> {
  if (!pool)
    pool = configure().catch((error) => {
      pool = null;
      throw error;
    });
  return pool;
}
async function configure(): Promise<Pool> {
  if (
    process.env.APP_ENV === "local" ||
    process.env.DATABASE_URL ||
    (process.env.PGUSER && process.env.PGPASSWORD)
  ) {
    return createPostgresPool(
      portablePoolConfig({
        APP_ENV: process.env.APP_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
        PG_CA_FILE: process.env.PG_CA_FILE,
      }),
    );
  }
  const arn = process.env.DB_SECRET_ARN;
  if (!arn || !process.env.PG_CA_FILE || !process.env.PGHOST)
    throw new Error("Database is not configured");
  const result = await secrets.send(
    new GetSecretValueCommand({ SecretId: arn }),
  );
  const credentials = credentialsSchema.parse(
    JSON.parse(result.SecretString ?? "null"),
  );
  const resultPool = createPostgresPool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "unfancy",
    user: credentials.username,
    password: credentials.password,
    ssl: {
      ca: readFileSync(process.env.PG_CA_FILE, "utf8"),
      rejectUnauthorized: true,
    },
  });
  const started = Date.now();
  try {
    const client = await resultPool.connect();
    client.release();
  } catch (error) {
    await resultPool.end();
    throw error;
  }
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Unfancy/Database",
            Dimensions: [["Worker"]],
            Metrics: [{ Name: "ConnectionLatency", Unit: "Milliseconds" }],
          },
        ],
      },
      Worker: credentials.username === "unfancy_sync" ? "Sync" : "RateCache",
      ConnectionLatency: Date.now() - started,
    }),
  );
  return resultPool;
}
