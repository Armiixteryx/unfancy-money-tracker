import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyExpense, validateChoice } from "./providers";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
import { voiceCategoryChoices } from "../../features/voice/categoryChoices";
import { categoryLabel, i18n } from "../../localization/i18n";
import { createCategory } from "../../domain/categories";
const dataset = createEmptyDataset();
const categories = voiceCategoryChoices(dataset.categories, category => category.name);
const fallback = categories.find((c) => c.isFallback)!;
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
  it("keeps the category confidence boundary at 0.70", async () => {
    mockAnswers(0.7);
    await expect(classifyExpense("Almuerzo cuarenta mil pesos", request, new AbortController().signal)).resolves.toMatchObject({ categoryId: food.id });
    mockAnswers(0.699);
    await expect(classifyExpense("Almuerzo cuarenta mil pesos", request, new AbortController().signal)).resolves.toMatchObject({ categoryId: fallback.id });
  });
  it("uses ordinary built-in labels as choices and marks only Uncategorized as the fallback", async () => {
    mockAnswers();
    await classifyExpense("Almuerzo cuarenta mil pesos", request, new AbortController().signal);
    const criteria = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).questions.category.criteria;
    expect(criteria[food.id]).toContain("Food / Comida");
    expect(criteria[fallback.id]).toBe("Uncategorized / Sin categoría: only if no other category matches");
    expect(Object.values(criteria).filter(value => String(value).includes("only if no other category matches"))).toHaveLength(1);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(body.questions.category.instructions).toContain("English, Spanish, or mixed speech");
    expect(body.questions.category.instructions).toContain("Choose the closest reasonable category");
    expect(body.questions.category.instructions).toContain("dinner/cena");
    expect(body.questions.category.instructions).toContain("Food/Comida covers meals (including breakfast/desayuno");
  });
  it("classifies the parsed description without amount or currency wording", async () => {
    mockAnswers();
    await classifyExpense("Almuerzo cuarenta mil pesos", request, new AbortController().signal);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).state).toEqual({ expense: "Almuerzo", explicitCurrency: "COP" });
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

describe("bilingual request choices", () => {
  it.each(["en", "es"] as const)("sends built-in aliases under UI language %s", async (language) => {
    await i18n.changeLanguage(language);
    const choices = voiceCategoryChoices(dataset.categories, categoryLabel);
    expect(choices.find(choice => choice.id === food.id)).toMatchObject({ id: food.id, name: language === "en" ? "Food" : "Comida", localizedNames: { en: "Food", es: "Comida" }, isFallback: false });
    expect(choices.find(choice => choice.id === fallback.id)).toMatchObject({ id: fallback.id, name: language === "en" ? "Uncategorized" : "Sin categoría", localizedNames: { en: "Uncategorized", es: "Sin categoría" }, isFallback: true });
    mockAnswers();
    const localizedRequest = { ...request, categories: choices };
    await classifyExpense("Lunch forty thousand pesos", localizedRequest, new AbortController().signal);
    const criteria = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).questions.category.criteria;
    expect(criteria[food.id]).toContain("Food / Comida");
    expect(criteria[fallback.id]).toContain("Uncategorized / Sin categoría");
  });
  it("does not infer aliases for custom or unidentifiable legacy categories", () => {
    const custom = createCategory({ kind: "expense", name: "Veterinary care" });
    const legacy = { ...custom, id: "00000000-0000-4000-8000-000000000099", name: "Legacy rides", defaultCategoryKey: undefined };
    expect(voiceCategoryChoices([...dataset.categories, custom, legacy], category => category.name).find(choice => choice.id === custom.id)).toMatchObject({ name: "Veterinary care", isFallback: false });
    expect(voiceCategoryChoices([...dataset.categories, custom, legacy], category => category.name).find(choice => choice.id === custom.id)).not.toHaveProperty("localizedNames");
    expect(voiceCategoryChoices([...dataset.categories, custom, legacy], category => category.name).find(choice => choice.id === legacy.id)).not.toHaveProperty("localizedNames");
  });
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
