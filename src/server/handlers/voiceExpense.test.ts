import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { createVoiceHandler } from "./voiceExpense";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
import { MAX_AUDIO_BYTES } from "../../contracts/voice";
import { VoiceError } from "../voice/parser";
const dataset = createEmptyDataset();
const categories = dataset.categories
  .filter((c) => c.kind === "expense")
  .map(({ id, name, defaultCategoryKey }) => ({ id, name, isFallback: defaultCategoryKey === "uncategorized" }));
const audio = Buffer.from([
  0, 0, 0, 12, 102, 116, 121, 112, 77, 52, 65, 32,
]).toString("base64");
const request = {
  requestId: dataset.datasetId,
  audio,
  mimeType: "audio/mp4",
  durationMs: 1000,
  localDate: "2026-10-02",
  categories,
};
const event = (body: unknown) =>
  ({
    body: JSON.stringify(body),
    isBase64Encoded: false,
  }) as APIGatewayProxyEventV2;
const transaction = {
  amount: "10",
  currency: "USD" as const,
  type: "expense" as const,
  categoryId: categories[0]!.id,
  description: "Synthetic",
  date: request.localDate,
};
describe("voice handler", () => {
  it("returns only a validated expense and matching request ID", async () => {
    const transcribe = vi.fn().mockResolvedValue("Synthetic ten dollars");
    const classify = vi.fn().mockResolvedValue(transaction);
    const r = await createVoiceHandler({ transcribe, classify })(
      event(request),
    );
    expect(r).toMatchObject({ statusCode: 200 });
    if (typeof r !== "string")
      expect(JSON.parse(r.body as string)).toEqual({
        requestId: request.requestId,
        transaction,
      });
  });
  it.each([
    { ...request, audio: "invalid" },
    { ...request, audio: Buffer.alloc(MAX_AUDIO_BYTES + 1).toString("base64") },
    { ...request, audio: Buffer.from("not an audio file").toString("base64") },
    { ...request, durationMs: 16001 },
    { ...request, localDate: "2026-02-30" },
    { ...request, categories: [categories[0], categories[0]] },
    { ...request, categories: categories.map(category => ({ ...category, isFallback: false })) },
    { ...request, categories: categories.map(category => ({ ...category, isFallback: true })) },
    { ...request, categories: categories.map(({ isFallback, ...category }) => ({ ...category, isSystem: isFallback })) },
    { ...request, mimeType: "text/plain" },
  ])("validates boundaries before providers", async (body) => {
    const transcribe = vi.fn();
    const classify = vi.fn();
    const r = await createVoiceHandler({ transcribe, classify })(event(body));
    expect(r).toMatchObject({ statusCode: 422 });
    expect(transcribe).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
  });
  it("enforces its whole-operation deadline even when a provider ignores cancellation", async () => {
    const transcribe = vi.fn(
      (_request: unknown, _signal: AbortSignal) =>
        new Promise<string>(() => undefined),
    );
    const classify = vi.fn();
    const result = await createVoiceHandler({
      transcribe,
      classify,
      deadlineMs: 5,
    })(event(request));
    expect(result).toMatchObject({ statusCode: 504 });
    expect(classify).not.toHaveBeenCalled();
    expect(transcribe.mock.calls[0]?.[1]?.aborted).toBe(true);
  });
  it("sanitizes provider errors and rejects malformed results", async () => {
    const r = await createVoiceHandler({
      transcribe: vi
        .fn()
        .mockRejectedValue(new Error("private provider payload")),
      classify: vi.fn(),
    })(event(request));
    expect(JSON.stringify(r)).not.toContain("private");
    expect(r).toMatchObject({ statusCode: 503 });
    const malformed = await createVoiceHandler({
      transcribe: vi.fn().mockResolvedValue("text"),
      classify: vi.fn().mockResolvedValue({ ...transaction, type: "income" }),
    })(event(request));
    expect(malformed).toMatchObject({ statusCode: 503 });
  });
  it("preserves sanitized throttling", async () => {
    expect(
      await createVoiceHandler({
        transcribe: vi.fn().mockRejectedValue(new VoiceError("throttled")),
        classify: vi.fn(),
      })(event(request)),
    ).toMatchObject({ statusCode: 429 });
  });
});
