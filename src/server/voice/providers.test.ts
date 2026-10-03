import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyExpense, validateChoice } from "./providers";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
const dataset = createEmptyDataset();
const categories = dataset.categories
  .filter((c) => c.kind === "expense")
  .map(({ id, name, isSystem }) => ({ id, name, isSystem }));
const fallback = categories.find((c) => c.isSystem)!;
const food = categories.find((c) => c.name === "Food")!;
const request = {
  requestId: dataset.datasetId,
  audio: "AAAA",
  mimeType: "audio/mp4" as const,
  durationMs: 1000,
  localDate: "2026-10-02",
  categories,
};
const choice = (selected: string, keys: string[], probability: number) => ({
  type: "choice",
  choice: selected,
  confidence: 0.5,
  probabilities: Object.fromEntries(
    keys.map((key) => [
      key,
      key === selected ? probability : (1 - probability) / (keys.length - 1),
    ]),
  ),
});
function mockAnswers(categoryProbability = 0.9, currencyProbability = 0.95) {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "0".repeat(32));
  vi.stubEnv("CLOUDFLARE_AUTH_TOKEN", "synthetic");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            answers: {
              category: choice(
                food.id,
                categories.map((c) => c.id),
                categoryProbability,
              ),
              currency: choice(
                "COP",
                ["COP", "USD", "VES", "unknown"],
                currencyProbability,
              ),
            },
          },
        }),
      ),
    ),
  );
}
describe("Clef boundaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("uses selected-option probability as the configured confidence threshold", async () => {
    mockAnswers();
    expect(
      await classifyExpense(
        "Almuerzo cuarenta mil pesos",
        request,
        new AbortController().signal,
      ),
    ).toMatchObject({ amount: "40000", currency: "COP", categoryId: food.id });
  });
  it("falls back on uncertain category and rejects uncertain currency", async () => {
    mockAnswers(0.6);
    expect(
      await classifyExpense(
        "Almuerzo cuarenta mil pesos",
        request,
        new AbortController().signal,
      ),
    ).toMatchObject({ categoryId: fallback.id });
    mockAnswers(0.9, 0.7);
    await expect(
      classifyExpense(
        "Almuerzo cuarenta mil pesos",
        request,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "unsupported_currency" });
  });
  it("uses only Uncategorized without sending an invalid single-choice category question", async () => {
    mockAnswers();
    await classifyExpense(
      "Almuerzo cuarenta mil pesos",
      { ...request, categories: [fallback] },
      new AbortController().signal,
    );
    const mocked = vi.mocked(fetch);
    const init = mocked.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body)).questions.category).toBeUndefined();
  });
  it.each([
    {},
    {
      type: "choice",
      choice: "other",
      confidence: 1,
      probabilities: { a: 1, b: 0 },
    },
    { type: "choice", choice: "a", confidence: 1, probabilities: { a: 0.5 } },
    {
      type: "choice",
      choice: "a",
      confidence: 1,
      probabilities: { a: 1, b: 1 },
    },
  ])("rejects invalid decisions", (value) =>
    expect(() => validateChoice(value, ["a", "b"])).toThrow(),
  );
});

describe("transcription metadata and gateway errors", () => {
  it("maps gateway-specific throttling and exhausted credits without payloads", async () => {
    const { GatewayRateLimitError, GatewayInvalidRequestError } = await import(
      "@ai-sdk/gateway"
    );
    const { sanitizeProviderError } = await import("./providers");
    expect(
      sanitizeProviderError(new GatewayRateLimitError({ message: "private" }))
        .code,
    ).toBe("throttled");
    expect(
      sanitizeProviderError(
        new GatewayInvalidRequestError({ statusCode: 402, message: "private" }),
      ).code,
    ).toBe("credits_exhausted");
  });
  it("rejects silence, invalid metadata and reversed segment timestamps", async () => {
    const { validateTranscriptResult } = await import("./providers");
    expect(
      validateTranscriptResult({
        text: "Synthetic ten dollars",
        language: "en",
        durationInSeconds: 2,
        segments: [],
      }),
    ).toBe("Synthetic ten dollars");
    for (const value of [
      { text: "" },
      { text: "Synthetic", durationInSeconds: 0 },
      { text: "Synthetic", durationInSeconds: NaN },
      {
        text: "Synthetic",
        segments: [{ text: "Synthetic", startSecond: 2, endSecond: 1 }],
      },
    ])
      expect(() => validateTranscriptResult(value)).toThrow();
  });
});
