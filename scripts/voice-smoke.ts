// Opt-in, synthetic-only provider check. Never print credentials or provider errors.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createUuid } from "../src/platform/identifiers/createUuid";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createEmptyDataset } from "../src/platform/persistence/datasetPersistence";
import { createCategory } from "../src/domain/categories";
import { voiceCategoryChoices } from "../src/features/voice/categoryChoices";
import { categoryLabel, i18n } from "../src/localization/i18n";
import { requestVoiceExpense } from "../src/features/voice/api";
import {
  transcribeAudio,
  classifyExpense,
  sanitizeProviderError,
} from "../src/server/voice/providers";
import { voiceResponseSchema, type VoiceRequest } from "../src/contracts/voice";
const examples = [
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
async function main() {
  process.loadEnvFile(".env.local");
  process.env.APP_ENV = "local";
  process.env.EXPO_PUBLIC_VOICE_API_URL ??= "http://127.0.0.1:3001";
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
        let stage = "transcription";
        try {
          const transcript = await transcribeAudio(request, signal);
          stage = "classification";
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
          const expectedCategoryId = example.customCategory
            ? customCategory.id
            : dataset.categories.find(candidate => candidate.defaultCategoryKey === example.categoryKey)?.id;
          const outcome = !diagnostic
            ? "missing"
            : diagnostic.selectedCategoryId === expectedCategoryId
              ? diagnostic.outcome
              : diagnostic.outcome === "model_fallback" ? "model_fallback" : "wrong_selection";
          const passed =
            transaction.amount === example.amount &&
            transaction.currency === example.currency &&
            transaction.categoryId === expectedCategoryId &&
            category?.defaultCategoryKey === example.categoryKey &&
            outcome === "matched";
          console.log(
            `Synthetic case ${index + 1}, ${format}: ${passed ? "PASS" : "FAIL"}; outcome ${outcome}; selected probability ${diagnostic?.selectedProbability.toFixed(3) ?? "n/a"}.`,
          );
          if (!passed) process.exitCode = 1;
          if (format === "m4a" && [0, 1, 2, 5].includes(index)) {
            for (const [languageIndex, language] of (["en", "es"] as const).entries()) {
              if (languageIndex > 0) await delay(15000);
              await i18n.changeLanguage(language);
              const endpointRequest = { ...request, categories: voiceCategoryChoices([...dataset.categories, customCategory], categoryLabel) };
              stage = "endpoint";
              const endpointResult = await requestVoiceExpense(endpointRequest, AbortSignal.timeout(27000));
              const endpointExpectedId = example.customCategory
                ? customCategory.id
                : dataset.categories.find(category => category.defaultCategoryKey === example.categoryKey)?.id;
              const endpointOutcome = endpointResult.transaction.categoryId === endpointExpectedId
                ? "matched"
                : endpointResult.transaction.categoryId === endpointRequest.categories.find(choice => choice.isFallback)?.id
                  ? "model_fallback"
                  : "wrong_selection";
              const endpointPassed = endpointResult.transaction.amount === example.amount &&
                endpointResult.transaction.currency === example.currency && endpointOutcome === "matched";
              console.log(`Synthetic endpoint case ${index + 1}, UI ${language}: ${endpointPassed ? "PASS" : "FAIL"}; outcome ${endpointOutcome}.`);
              if (!endpointPassed) process.exitCode = 1;
            }
          }
        } catch (error) {
          console.log(
            `Synthetic example ${index + 1}, ${format}: FAIL (${stage}, ${sanitizeProviderError(error).code}).`,
          );
          process.exitCode = 1;
        }
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
void main().catch(() => {
  console.error(
    "Synthetic voice smoke failed. Check credentials, macOS say, ffmpeg and ffprobe. Provider errors are hidden.",
  );
  process.exitCode = 1;
});
