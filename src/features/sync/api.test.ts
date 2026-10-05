import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpSyncClient, resolveSyncBackendUrl } from "./api";
vi.mock("../../platform/auth/client", () => ({
  authClient: { accessToken: async () => "synthetic-access" },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("sync endpoint boundary", () => {
  it.each([401, 403])(
    "pauses sync after an authentication rejection (%s)",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response("private response", { status }));
      vi.stubGlobal("fetch", fetcher);
      await expect(
        new HttpSyncClient(() => "https://synthetic.invalid").bootstrap(),
      ).rejects.toThrow("unauthenticated");
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it.each(["dev", "prod"])(
    "requires HTTPS for an explicit %s endpoint",
    (backend) => {
      expect(() =>
        resolveSyncBackendUrl("http://synthetic.invalid", backend),
      ).toThrow("invalid_request");
      expect(resolveSyncBackendUrl("https://synthetic.invalid/", backend)).toBe(
        "https://synthetic.invalid",
      );
    },
  );
  it.each([
    "https://user:secret@synthetic.invalid",
    "https://synthetic.invalid/?private=value",
    "file:///private",
  ])("rejects unsafe explicit configuration", (endpoint) => {
    expect(() => resolveSyncBackendUrl(endpoint, "dev")).toThrow(
      "invalid_request",
    );
  });
  it("retains HTTP for a local development API", () => {
    expect(resolveSyncBackendUrl("http://localhost:3001/", "local")).toBe(
      "http://localhost:3001",
    );
  });
  it("sends access tokens and discards invalid or sensitive error responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("private response", { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    const client = new HttpSyncClient(() => "https://synthetic.invalid");
    await expect(client.bootstrap()).rejects.toThrow("server_error");
    expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe(
      "Bearer synthetic-access",
    );
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ private: "data" }), { status: 200 }),
    );
    await expect(client.bootstrap()).rejects.toThrow("server_error");
  });
});
