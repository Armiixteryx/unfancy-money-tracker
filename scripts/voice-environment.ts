import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { z } from "zod";
import {
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
const keysSchema = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/),
  CLOUDFLARE_AUTH_TOKEN: z.string().min(1),
});
async function main() {
  const local = parseEnv(readFileSync(".env.local", "utf8"));
  const keys = keysSchema.parse(
    Object.fromEntries(
      Object.keys(keysSchema.shape).map((key) => [
        key,
        local[key] || process.env[key],
      ]),
    ),
  );
  const stage = process.argv[2];
  if (!stage) {
    const base: unknown = JSON.parse(
      readFileSync("sam/env.local.json", "utf8"),
    );
    const env = z
      .record(z.string(), z.record(z.string(), z.string()))
      .parse(base);
    writeFileSync(
      "sam/env.voice.local.json",
      JSON.stringify(
        { ...env, VoiceExpenseFunction: { APP_ENV: "local", ...keys } },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    chmodSync("sam/env.voice.local.json", 0o600);
    console.log("Generated private SAM voice environment.");
    return;
  }
  if (stage !== "dev")
    throw new Error("Production voice deployment remains deferred.");
  const client = new SecretsManagerClient({});
  await client.send(
    new PutSecretValueCommand({
      SecretId: `UnfancyMoneyTracker-${stage}/voice`,
      SecretString: JSON.stringify(keys),
    }),
  );
  console.log("Updated development voice credentials in Secrets Manager.");
}
void main().catch(() => {
  console.error(
    "Voice credential preparation failed. Check local variables and AWS access; credentials and provider errors are hidden.",
  );
  process.exitCode = 1;
});
