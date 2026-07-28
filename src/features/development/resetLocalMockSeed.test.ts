import { describe, expect, it, vi } from "vitest";

import { resetLocalMockSeedSession } from "./resetLocalMockSeed";

describe("resetLocalMockSeedSession", () => {
  it("clears only the local auth session and account namespace before seeding", async () => {
    const signOut = vi.fn().mockResolvedValue({ status: "completed" });
    const switchToAnonymousNamespace = vi.fn().mockResolvedValue({ ok: true, value: { datasetId: "anonymous-dataset" } });

    const result = await resetLocalMockSeedSession({ signOut }, switchToAnonymousNamespace);

    expect(result.ok).toBe(true);
    expect(signOut).toHaveBeenCalledOnce();
    expect(switchToAnonymousNamespace).toHaveBeenCalledWith(true);
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(switchToAnonymousNamespace.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY);
  });

  it("does not clear the local account cache if sign-out fails", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("local sign-out failed"));
    const switchToAnonymousNamespace = vi.fn();

    await expect(resetLocalMockSeedSession({ signOut }, switchToAnonymousNamespace)).rejects.toThrow("local sign-out failed");
    expect(switchToAnonymousNamespace).not.toHaveBeenCalled();
  });
});
