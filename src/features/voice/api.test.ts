import { afterEach, describe, expect, it, vi } from "vitest";
import { requestVoiceExpense, resolveVoiceExpenseUrl, resolveVoiceBackendUrl } from "./api";
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
    .map(({ id, name, defaultCategoryKey }) => ({ id, name, isFallback: defaultCategoryKey === "uncategorized" })),
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
        requestVoiceExpense(request, new AbortController().signal, "synthetic-access-token"),
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
      requestVoiceExpense(request, new AbortController().signal, "synthetic-access-token"),
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


describe("voice backend selection", () => {
  const urls = { localUrl: "http://localhost:3001", devUrl: "https://dev.invalid/dev/rates/", prodUrl: "https://prod.invalid" };
  it.each([
    [undefined, "http://localhost:3001/voice/expense"],
    ["local", "http://localhost:3001/voice/expense"],
    ["dev", "https://dev.invalid/dev/voice/expense"],
    ["prod", "https://prod.invalid/voice/expense"],
  ])("selects only %s", (backend, expected) => {
    expect(resolveVoiceBackendUrl({ ...urls, backend })).toBe(expected);
  });
  it.each([
    { backend: "invalid" }, { backend: "" },
    { backend: "dev", devUrl: undefined }, { backend: "prod", prodUrl: undefined },
    { backend: "local", localUrl: undefined },
    { backend: "dev", devUrl: "http://dev.invalid" },
    { backend: "prod", prodUrl: "http://prod.invalid" },
    { backend: "dev", devUrl: "private malformed value" },
    { backend: "local", localUrl: "file:///private" },
    { backend: "dev", devUrl: "https://user:secret@dev.invalid" },
  ])("rejects invalid configuration without fallback", (override) => {
    expect(() => resolveVoiceBackendUrl({ ...urls, ...override })).toThrow("Voice entry is not configured. Enter manually.");
  });
  it("does not send a request when the selected endpoint is missing", async () => {
    vi.stubEnv("EXPO_PUBLIC_VOICE_BACKEND", "dev");
    vi.stubEnv("EXPO_PUBLIC_VOICE_DEV_API_URL", "");
    vi.stubEnv("EXPO_PUBLIC_VOICE_API_URL", urls.localUrl);
    vi.stubGlobal("fetch", vi.fn());
    try {
      await expect(requestVoiceExpense(request, new AbortController().signal, "synthetic-access-token")).rejects.toThrow("Voice entry is not configured");
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });
});

it("requires a token before uploading audio", async () => { const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await expect(requestVoiceExpense(request, new AbortController().signal, "")).rejects.toThrow("Sign in"); expect(fetcher).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

it("sends a bearer access token and never retries after rejection", async () => {
  vi.stubEnv("EXPO_PUBLIC_VOICE_API_URL", "https://synthetic.invalid");
  const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(requestVoiceExpense(request, new AbortController().signal, "synthetic-access")).rejects.toThrow("Sign in");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]?.[1]?.headers.Authorization).toBe("Bearer synthetic-access");
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
