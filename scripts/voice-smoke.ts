// Synthetic-only provider check. Use --aws-dev only after the slug-capable voice backend deploys.
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { Amplify } from "aws-amplify";
import { fetchAuthSession, signIn, signOut } from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { createUuid } from "../src/platform/identifiers/createUuid";
import { join } from "node:path";
import { createEmptyDataset } from "../src/platform/persistence/datasetPersistence";
import { createCategory } from "../src/domain/categories";
import type { DefaultCategoryKey } from "../src/domain/types";
import { voiceCategoryChoices } from "../src/features/voice/categoryChoices";
import { categoryLabel, i18n } from "../src/localization/i18n";
import { requestVoiceExpense } from "../src/features/voice/api";
import {
  transcribeAudio,
  classifyExpense,
  sanitizeProviderError,
} from "../src/server/voice/providers";
import { voiceResponseSchema, type VoiceRequest } from "../src/contracts/voice";
import {
  evaluateVoiceSmokeResponse,
  expectedSystemExpenseCategoryId,
  parseAwsDevVoiceSettings,
  type AwsDevVoiceSettings,
} from "./voice-smoke-contract";

interface SmokeExample {
  text: string;
  voice: string;
  amount: string;
  currency: string;
  categoryKey?: DefaultCategoryKey;
  customCategory?: boolean;
}

const examples: readonly SmokeExample[] = [
  {
    text: "Almuerzo cuarenta mil pesos",
    voice: "Paulina",
    amount: "40000",
    currency: "COP",
    categoryKey: "food",
  },
  {
    text: "Cena noventa mil pesos",
    voice: "Paulina",
    amount: "90000",
    currency: "COP",
    categoryKey: "food",
  },
  {
    text: "Lunch forty thousand pesos",
    voice: "Samantha",
    amount: "40000",
    currency: "COP",
    categoryKey: "food",
  },
  {
    text: "Taxi doce mil bolívares",
    voice: "Paulina",
    amount: "12000",
    currency: "VES",
    categoryKey: "transport",
  },
  {
    text: "Netflix ten dollars",
    voice: "Samantha",
    amount: "10",
    currency: "USD",
    categoryKey: "subscriptions",
  },
  {
    text: "T shirt eight dollars",
    voice: "Samantha",
    amount: "8",
    currency: "USD",
    categoryKey: "shopping",
  },
  {
    text: "Dog grooming ten dollars",
    voice: "Samantha",
    amount: "10",
    currency: "USD",
    customCategory: true,
  },
  {
    text: "Peluquería para perros diez dólares",
    voice: "Paulina",
    amount: "10",
    currency: "USD",
    customCategory: true,
  },
];

function awsJson<T>(args: readonly string[]): T {
  return JSON.parse(
    execFileSync("aws", [...args], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    }).toString("utf8"),
  ) as T;
}

function resolveAwsDevSettings() {
  const response = awsJson<unknown>([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    "UnfancyMoneyTracker-dev",
    "--region",
    "us-east-1",
    "--output",
    "json",
  ]);
  return parseAwsDevVoiceSettings(response);
}

function cognitoAdmin(
  operation: "admin-create-user" | "admin-set-user-password" | "admin-delete-user",
  region: string,
  input: Record<string, unknown>,
) {
  const directory = mkdtempSync(join(tmpdir(), "unfancy-voice-auth-"));
  try {
    const file = join(directory, "input.json");
    writeFileSync(file, JSON.stringify(input), { mode: 0o600 });
    execFileSync(
      "aws",
      [
        "cognito-idp",
        operation,
        "--region",
        region,
        "--cli-input-json",
        `file://${file}`,
      ],
      { stdio: ["ignore", "ignore", "ignore"], timeout: 30_000 },
    );
  } catch (error) {
    const failure = error as { stderr?: Buffer; signal?: string };
    const code = failure.stderr
      ?.toString()
      .match(/An error occurred \(([A-Za-z]+)\)/)?.[1];
    throw new Error(code ?? (failure.signal ? "timeout" : "command_failed"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function withAwsDevAccessToken(
  settings: AwsDevVoiceSettings,
  run: (accessToken: string) => Promise<void>,
) {
  const username = `synthetic-voice-${randomUUID()}@example.invalid`;
  const password = `Synthetic-Aa1!${randomBytes(32).toString("hex")}`;
  const memory = new Map<string, string>();
  let createAttempted = false;
  let cleanupFailed = false;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: settings.userPoolId,
        userPoolClientId: settings.userPoolClientId,
      },
    },
  });
  cognitoUserPoolsTokenProvider.setKeyValueStorage({
    async getItem(key) {
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
    },
    async removeItem(key) {
      memory.delete(key);
    },
    async clear() {
      memory.clear();
    },
  });
  try {
    createAttempted = true;
    cognitoAdmin("admin-create-user", settings.region, {
      UserPoolId: settings.userPoolId,
      Username: username,
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email", Value: username },
        { Name: "email_verified", Value: "true" },
      ],
    });
    cognitoAdmin("admin-set-user-password", settings.region, {
      UserPoolId: settings.userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    });
    const result = await signIn({
      username,
      password,
      options: { authFlowType: "USER_SRP_AUTH" },
    });
    if (!result.isSignedIn) throw new Error("Synthetic login failed.");
    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken?.toString();
    if (!accessToken) throw new Error("Synthetic login did not return an access token.");
    await run(accessToken);
  } finally {
    try {
      await signOut();
    } catch {
      // Deleting the temporary user below still revokes the session.
    }
    memory.clear();
    if (createAttempted) {
      try {
        cognitoAdmin("admin-delete-user", settings.region, {
          UserPoolId: settings.userPoolId,
          Username: username,
        });
      } catch (error) {
        cleanupFailed =
          !(error instanceof Error && error.message === "UserNotFoundException");
      }
    }
    if (cleanupFailed) {
      process.exitCode = 1;
      console.error("Synthetic AWS dev voice login cleanup failed.");
    }
  }
}

function expectedCategoryId(
  example: SmokeExample,
  categories: ReturnType<typeof createEmptyDataset>["categories"],
  customCategoryId: string,
) {
  if (example.customCategory) return customCategoryId;
  if (!example.categoryKey) throw new Error("Synthetic case has no expected category.");
  return expectedSystemExpenseCategoryId(categories, example.categoryKey);
}

async function runSmoke(endpointOnly: boolean, accessToken: string) {
  if (!endpointOnly) process.env.APP_ENV = "local";
  if (!process.env.EXPO_PUBLIC_VOICE_API_URL)
    process.env.EXPO_PUBLIC_VOICE_API_URL = "http://127.0.0.1:3001";
  const directory = mkdtempSync(join(tmpdir(), "unfancy-voice-smoke-"));
  try {
    const dataset = createEmptyDataset();
    const customCategory = createCategory({ kind: "expense", name: "Pet care" });
    const requestedCases = process.env.VOICE_SMOKE_CASES?.split(",").map(Number);
    if (requestedCases && (requestedCases.length === 0 || requestedCases.some(index => !Number.isInteger(index) || index < 0 || index >= examples.length))) {
      throw new Error("VOICE_SMOKE_CASES must contain valid zero-based case indexes.");
    }
    for (const [index, example] of examples.entries()) {
      if (requestedCases && !requestedCases.includes(index)) continue;
      const raw = join(directory, `${index}.aiff`);
      const speech = spawnSync(
        "say",
        ["-v", example.voice, "-o", raw, example.text],
        { stdio: "ignore" },
      );
      if (speech.status !== 0)
        throw new Error(
          "Synthetic speech generation failed. This smoke script requires macOS say and ffmpeg.",
        );
      // Validate both native and browser containers for Spanish and English.
      for (const format of ["m4a", "webm"] as const) {
        await i18n.changeLanguage(format === "m4a" ? "en" : "es");
        const categories = voiceCategoryChoices([...dataset.categories, customCategory], categoryLabel);
        // Space synthetic probes out; never retry a rejected request.
        if (index > 0 || format === "webm") await delay(15000);
        const path = join(directory, `${index}.${format}`);
        const conversion = spawnSync(
          "ffmpeg",
          [
            "-loglevel",
            "error",
            "-y",
            "-i",
            raw,
            "-c:a",
            format === "m4a" ? "aac" : "libopus",
            path,
          ],
          { stdio: "ignore" },
        );
        if (conversion.status !== 0)
          throw new Error("Synthetic recording conversion failed.");
        const durationResult = spawnSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
          ],
          { encoding: "utf8" },
        );
        const request: VoiceRequest = {
          requestId: createUuid(),
          audio: readFileSync(path).toString("base64"),
          mimeType: format === "m4a" ? "audio/mp4" : "audio/webm;codecs=opus",
          durationMs: Math.ceil(Number(durationResult.stdout) * 1000),
          localDate: "2026-10-02",
          categories,
        };
        const signal = AbortSignal.timeout(27000);
        const targetCategoryId = expectedCategoryId(
          example,
          dataset.categories,
          customCategory.id,
        );
        const fallbackCategoryId = categories.find((choice) => choice.isFallback)?.id;
        if (!fallbackCategoryId) throw new Error("Synthetic fallback category is unavailable.");
        if (!example.customCategory) {
          const expectedChoice = categories.find((choice) => choice.id === targetCategoryId);
          if (!expectedChoice?.localizedNames?.en || !expectedChoice.localizedNames.es)
            throw new Error("Built-in voice category aliases are unavailable.");
        }
        try {
          if (endpointOnly) {
            const result = await requestVoiceExpense(
              request,
              AbortSignal.timeout(30000),
              accessToken,
            );
            const evaluation = evaluateVoiceSmokeResponse(result, {
              requestId: request.requestId,
              amount: example.amount,
              currency: example.currency,
              categoryId: targetCategoryId,
              fallbackCategoryId,
            });
            console.log(
              `Synthetic case ${index + 1}: outcome ${evaluation.outcome}; selected probability unavailable.`,
            );
            if (!evaluation.passed) process.exitCode = 1;
            continue;
          }
          const transcript = await transcribeAudio(request, signal);
          let diagnostic: { outcome: "matched" | "model_fallback" | "below_threshold"; selectedProbability: number; selectedCategoryId: string } | undefined;
          const transaction = await classifyExpense(
            transcript,
            request,
            signal,
            value => { diagnostic = value; },
          );
          voiceResponseSchema.parse({
            requestId: request.requestId,
            transaction,
          });
          const selectedChoice = categories.find(
            (c) => c.id === transaction.categoryId,
          );
          const category = dataset.categories.find(c => c.id === selectedChoice?.id);
          const evaluation = evaluateVoiceSmokeResponse(
            { requestId: request.requestId, transaction },
            {
              requestId: request.requestId,
              amount: example.amount,
              currency: example.currency,
              categoryId: targetCategoryId,
              fallbackCategoryId,
            },
          );
          const outcome = !diagnostic
            ? "missing"
            : diagnostic.selectedCategoryId !== targetCategoryId
              ? diagnostic.outcome === "model_fallback"
                ? "model_fallback"
                : "wrong_selection"
              : diagnostic.outcome === "model_fallback" ||
                  diagnostic.outcome === "below_threshold"
                ? diagnostic.outcome
                : evaluation.outcome;
          const passed =
            evaluation.passed &&
            diagnostic?.selectedCategoryId === targetCategoryId &&
            diagnostic.outcome === "matched" &&
            category?.defaultCategoryKey === example.categoryKey;
          console.log(
            `Synthetic case ${index + 1}: outcome ${outcome}; selected probability ${diagnostic?.selectedProbability.toFixed(3) ?? "unavailable"}.`,
          );
          if (!passed) process.exitCode = 1;
          if (format === "m4a" && [0, 1, 2, 5].includes(index)) {
            for (const [languageIndex, language] of (["en", "es"] as const).entries()) {
              if (languageIndex > 0) await delay(15000);
              await i18n.changeLanguage(language);
              const endpointRequest = { ...request, categories: voiceCategoryChoices([...dataset.categories, customCategory], categoryLabel) };
              const endpointResult = await requestVoiceExpense(
                endpointRequest,
                AbortSignal.timeout(27000),
                accessToken,
              );
              const endpointEvaluation = evaluateVoiceSmokeResponse(endpointResult, {
                requestId: request.requestId,
                amount: example.amount,
                currency: example.currency,
                categoryId: targetCategoryId,
                fallbackCategoryId,
              });
              console.log(
                `Synthetic endpoint case ${index + 1}: outcome ${endpointEvaluation.outcome}; selected probability unavailable.`,
              );
              if (!endpointEvaluation.passed) process.exitCode = 1;
            }
          }
        } catch (error) {
          console.log(
            `Synthetic case ${index + 1}: FAIL; outcome ${sanitizeProviderError(error).code}.`,
          );
          process.exitCode = 1;
        }
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  const awsDevMode = process.argv.includes("--aws-dev");
  const endpointOnly = process.argv.includes("--endpoint-only");
  if (awsDevMode && endpointOnly)
    throw new Error("Choose one voice smoke mode.");
  if (awsDevMode) {
    const settings = resolveAwsDevSettings();
    process.env.EXPO_PUBLIC_VOICE_BACKEND = "dev";
    process.env.EXPO_PUBLIC_VOICE_DEV_API_URL = settings.apiUrl;
    await withAwsDevAccessToken(settings, (accessToken) =>
      runSmoke(true, accessToken),
    );
    return;
  }
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  await runSmoke(endpointOnly, process.env.VOICE_ACCESS_TOKEN ?? "");
}

void main().catch(() => {
  console.error(
    "Synthetic voice smoke failed. Check the configured test mode and local speech tools. Sensitive details are hidden.",
  );
  process.exitCode = 1;
});
