// Opt-in, synthetic-only provider check. Never print credentials or provider errors.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createUuid } from "../src/platform/identifiers/createUuid";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createEmptyDataset } from "../src/platform/persistence/datasetPersistence";
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
    category: "Food",
  },
  {
    text: "Cena noventa mil pesos",
    voice: "Paulina",
    amount: "90000",
    currency: "COP",
    category: "Food",
  },
  {
    text: "Taxi doce mil bolívares",
    voice: "Paulina",
    amount: "12000",
    currency: "VES",
    category: "Transport",
  },
  {
    text: "Netflix ten dollars",
    voice: "Samantha",
    amount: "10",
    currency: "USD",
    category: "Subscriptions",
  },
  {
    text: "T shirt eight dollars",
    voice: "Samantha",
    amount: "8",
    currency: "USD",
    category: "Shopping",
  },
];
async function main() {
  process.loadEnvFile(".env.local");
  process.env.APP_ENV = "local";
  const directory = mkdtempSync(join(tmpdir(), "unfancy-voice-smoke-"));
  try {
    const dataset = createEmptyDataset();
    const categories = dataset.categories
      .filter((c) => c.kind === "expense")
      .map(({ id, name, isSystem }) => ({ id, name, isSystem }));
    for (const [index, example] of examples.entries()) {
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
          const transaction = await classifyExpense(
            transcript,
            request,
            signal,
          );
          voiceResponseSchema.parse({
            requestId: request.requestId,
            transaction,
          });
          const category = categories.find(
            (c) => c.id === transaction.categoryId,
          );
          const passed =
            transaction.amount === example.amount &&
            transaction.currency === example.currency &&
            (category?.name === example.category || category?.isSystem);
          console.log(
            `Synthetic example ${index + 1}, ${format}: ${passed ? "PASS" : "FAIL"}; category ${category?.isSystem ? "fallback" : "matched"}.`,
          );
          if (!passed) process.exitCode = 1;
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
