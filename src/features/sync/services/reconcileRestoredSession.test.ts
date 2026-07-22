import { describe, expect, it, vi } from "vitest";

import type { AuthSession } from "../../../platform/auth/types";
import { reconcileRestoredSession } from "./reconcileRestoredSession";

const session: AuthSession = {
  accountId: "shared-account",
  status: "verified",
  accessToken: "access-token",
  refreshToken: null,
  expiresAt: null
};

describe("reconcileRestoredSession", () => {
  it("opens the account dataset before a restored signed-in session can sync", async () => {
    const switchToAccountNamespace = vi.fn().mockResolvedValue({ ok: true, value: { datasetId: "account-dataset" } });

    const restored = await reconcileRestoredSession(
      { getSession: vi.fn().mockResolvedValue({ state: "signed_in", session }) },
      switchToAccountNamespace
    );

    expect(switchToAccountNamespace).toHaveBeenCalledWith("shared-account");
    expect(restored.namespaceResult?.ok).toBe(true);
  });

  it("leaves an anonymous dataset selected for a signed-out session", async () => {
    const switchToAccountNamespace = vi.fn();

    const restored = await reconcileRestoredSession(
      { getSession: vi.fn().mockResolvedValue({ state: "signed_out", session: null }) },
      switchToAccountNamespace
    );

    expect(switchToAccountNamespace).not.toHaveBeenCalled();
    expect(restored.namespaceResult).toBeNull();
  });
});
