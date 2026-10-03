import { afterEach, describe, expect, it, vi } from "vitest";
import { requestVoiceExpense, resolveVoiceExpenseUrl } from "./api";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
const dataset = createEmptyDataset();
const request = {
  requestId: dataset.datasetId,
  audio: "AAAA",
  mimeType: "audio/mp4" as const,
  durationMs: 1000,
  localDate: "2026-10-02",
  categories: dataset.categories
    .filter((c) => c.kind === "expense")
    .map(({ id, name, isSystem }) => ({ id, name, isSystem })),
};
describe("voice request boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it.each([429, 402, 500])(
    "never displays raw provider bodies for HTTP %s",
    async (status) => {
      vi.stubEnv("EXPO_PUBLIC_VOICE_API_URL", "https://synthetic.invalid");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              code: "unavailable",
              message: "private upstream message",
            }),
            { status },
          ),
        ),
      );
      await expect(
        requestVoiceExpense(request, new AbortController().signal),
      ).rejects.toThrow("Voice processing is unavailable");
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it("rejects an invalid result or a different completion UUID", async () => {
    vi.stubEnv("EXPO_PUBLIC_VOICE_API_URL", "https://synthetic.invalid");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            requestId: "00000000-0000-4000-8000-000000000000",
            transaction: {
              amount: "10",
              currency: "USD",
              type: "expense",
              categoryId: request.categories[0]!.id,
              description: "Synthetic",
              date: request.localDate,
            },
          }),
        ),
      ),
    );
    await expect(
      requestVoiceExpense(request, new AbortController().signal),
    ).rejects.toThrow("Voice processing is unavailable");
  });
});

describe("voice endpoint configuration", () => {
  it.each([
    ["https://synthetic.invalid", "https://synthetic.invalid/voice/expense"],
    [
      "https://synthetic.invalid/rates",
      "https://synthetic.invalid/voice/expense",
    ],
    [
      "https://synthetic.invalid/dev/rates/",
      "https://synthetic.invalid/dev/voice/expense",
    ],
    [
      "https://synthetic.invalid/dev/voice/expense",
      "https://synthetic.invalid/dev/voice/expense",
    ],
    ["http://localhost:3001/", "http://localhost:3001/voice/expense"],
  ])(
    "normalizes %s without duplicating service paths",
    (configured, expected) => {
      expect(resolveVoiceExpenseUrl(configured)).toBe(expected);
    },
  );
});
