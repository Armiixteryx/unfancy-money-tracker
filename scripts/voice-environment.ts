import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { z } from "zod";

const credentialKeys = [
  "AI_GATEWAY_API_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_AUTH_TOKEN",
] as const;

const keysSchema = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/),
  CLOUDFLARE_AUTH_TOKEN: z.string().min(1),
});

type VoiceCredentials = z.infer<typeof keysSchema>;
type CredentialState =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "valid"; credentials: VoiceCredentials };

type VoiceSecret = { ARN?: string; SecretString?: string };

export interface VoiceEnvironmentDependencies {
  environment: NodeJS.ProcessEnv;
  readFile(path: string): string | undefined;
  writeFile(path: string, contents: string): void;
  chmodFile(path: string): void;
  getSecret(secretId: string, region: string): Promise<VoiceSecret>;
  putSecret(
    secretId: string,
    region: string,
    credentials: VoiceCredentials,
  ): Promise<void>;
  log(message: string): void;
}

function credentialState(
  localFile: string | undefined,
  environment: NodeJS.ProcessEnv,
): CredentialState {
  const local = parseEnv(localFile ?? "");
  const supplied = Object.fromEntries(
    credentialKeys.map((key) => [key, local[key] || environment[key]]),
  );
  if (
    !credentialKeys.some(
      (key) =>
        typeof supplied[key] === "string" && supplied[key]!.length > 0,
    )
  ) {
    return { kind: "absent" };
  }
  const parsed = keysSchema.safeParse(supplied);
  return parsed.success
    ? { kind: "valid", credentials: parsed.data }
    : { kind: "invalid" };
}

function expectedTarget(environment: NodeJS.ProcessEnv) {
  const account = environment.CDK_DEFAULT_ACCOUNT;
  const region =
    environment.CDK_DEFAULT_REGION ??
    environment.AWS_REGION ??
    environment.AWS_DEFAULT_REGION;
  if (
    !account ||
    !/^\d{12}$/.test(account) ||
    !region ||
    !/^[a-z]{2,4}(?:-[a-z]+)+-\d$/.test(region)
  ) return undefined;
  return { account, region };
}

function secretMatchesTarget(arn: string | undefined, target: { account: string; region: string }) {
  if (!arn) return false;
  const parts = arn.split(":");
  return (
    parts[2] === "secretsmanager" &&
    parts[3] === target.region &&
    parts[4] === target.account &&
    parts.slice(5).join(":").startsWith("secret:UnfancyMoneyTracker-dev/voice-")
  );
}

async function existingDevSecretIsReady(
  dependencies: VoiceEnvironmentDependencies,
): Promise<boolean> {
  const target = expectedTarget(dependencies.environment);
  if (!target) return false;
  const secret = await dependencies.getSecret(
    "UnfancyMoneyTracker-dev/voice",
    target.region,
  );
  if (!secretMatchesTarget(secret.ARN, target) || !secret.SecretString) {
    return false;
  }
  try {
    return keysSchema.safeParse(JSON.parse(secret.SecretString)).success;
  } catch {
    return false;
  }
}

export async function runVoiceEnvironment(
  args: string[],
  dependencies: VoiceEnvironmentDependencies,
): Promise<void> {
  const [stage, ...flags] = args;
  const local = dependencies.readFile(".env.local");
  const credentials = credentialState(local, dependencies.environment);

  if (stage === "check") {
    if (flags.length === 0) {
      if (credentials.kind !== "valid") throw new Error("Voice credentials are unavailable.");
      dependencies.log("Voice provider credentials are present and valid.");
      return;
    }
    if (flags.length !== 1 || flags[0] !== "--allow-existing-dev-secret") {
      throw new Error("Unsupported voice environment option.");
    }
    if (credentials.kind === "invalid") throw new Error("Voice credentials are invalid.");
    if (credentials.kind === "valid") {
      dependencies.log("Voice provider credentials are present and valid.");
      return;
    }
    if (!(await existingDevSecretIsReady(dependencies))) {
      throw new Error("The existing development voice secret is unavailable.");
    }
    dependencies.log("Existing development voice credentials are ready.");
    return;
  }

  if (!stage) {
    if (flags.length > 0) throw new Error("Unsupported voice environment option.");
    if (credentials.kind !== "valid") throw new Error("Voice credentials are unavailable.");
    const baseContents = dependencies.readFile("sam/env.local.json");
    if (!baseContents) throw new Error("Local SAM environment is unavailable.");
    const base: unknown = JSON.parse(baseContents);
    const environment = z
      .record(z.string(), z.record(z.string(), z.string()))
      .parse(base);
    const outputPath = "sam/env.voice.local.json";
    dependencies.writeFile(
      outputPath,
      JSON.stringify(
        {
          ...environment,
          VoiceExpenseFunction: {
            APP_ENV: "local",
            ...credentials.credentials,
          },
        },
        null,
        2,
      ),
    );
    dependencies.chmodFile(outputPath);
    dependencies.log("Generated private SAM voice environment.");
    return;
  }

  if (stage === "prod") {
    if (dependencies.environment.ALLOW_PROD_DEPLOY !== "1") {
      throw new Error("Production voice credential setup requires ALLOW_PROD_DEPLOY=1.");
    }
    if (flags.length > 0) throw new Error("Unsupported voice environment option.");
    if (credentials.kind === "invalid") throw new Error("Voice credentials are invalid.");
    if (credentials.kind === "absent") throw new Error("Voice credentials are unavailable.");
    const target = expectedTarget(dependencies.environment);
    if (!target) throw new Error("The production AWS target is unavailable.");
    await dependencies.putSecret(
      "UnfancyMoneyTracker-prod/voice",
      target.region,
      credentials.credentials,
    );
    dependencies.log("Updated production voice credentials in Secrets Manager.");
    return;
  }
  if (stage !== "dev") throw new Error("Unsupported voice deployment stage.");
  if (flags.length > 1 || (flags.length === 1 && flags[0] !== "--reuse-existing")) {
    throw new Error("Unsupported voice environment option.");
  }
  if (credentials.kind === "invalid") throw new Error("Voice credentials are invalid.");
  if (credentials.kind === "absent") {
    if (flags[0] !== "--reuse-existing") {
      throw new Error("Voice credentials are unavailable.");
    }
    if (!(await existingDevSecretIsReady(dependencies))) {
      throw new Error("The existing development voice secret is unavailable.");
    }
    dependencies.log("Existing development voice credentials are ready.");
    return;
  }

  const target = expectedTarget(dependencies.environment);
  if (!target) throw new Error("The development AWS target is unavailable.");
  await dependencies.putSecret(
    "UnfancyMoneyTracker-dev/voice",
    target.region,
    credentials.credentials,
  );
  dependencies.log("Updated development voice credentials in Secrets Manager.");
}

function defaultDependencies(): VoiceEnvironmentDependencies {
  return {
    environment: process.env,
    readFile(path) {
      try {
        return readFileSync(path, "utf8");
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return undefined;
        }
        throw error;
      }
    },
    writeFile(path, contents) {
      writeFileSync(path, contents, { mode: 0o600 });
    },
    chmodFile(path) {
      chmodSync(path, 0o600);
    },
    async getSecret(secretId, region) {
      const client = new SecretsManagerClient({ region });
      const secret = await client.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );
      return { ARN: secret.ARN, SecretString: secret.SecretString };
    },
    async putSecret(secretId, region, credentials) {
      const client = new SecretsManagerClient({ region });
      await client.send(
        new PutSecretValueCommand({
          SecretId: secretId,
          SecretString: JSON.stringify(credentials),
        }),
      );
    },
    log(message) {
      console.log(message);
    },
  };
}

async function main() {
  try {
    await runVoiceEnvironment(process.argv.slice(2), defaultDependencies());
  } catch {
    console.error(
      "Voice credential preparation failed. Check local variables and AWS access; credentials and provider errors are hidden.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
