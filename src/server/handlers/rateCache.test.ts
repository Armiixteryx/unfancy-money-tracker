import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { handler } from "./rateCache";
import { getPostgresPool } from "../repository/postgres";

vi.mock("../repository/postgres", () => ({
  getPostgresPool: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

describe("private rate cache handler diagnostics", () => {
  it("replaces database errors with one fixed diagnostic", async () => {
    const sensitiveDiagnostic =
      "SYNTHETIC_ROW_VALUE user=alice amount=999 description=private";
    const query = vi.fn().mockRejectedValue(new Error(sensitiveDiagnostic));
    vi.mocked(getPostgresPool).mockResolvedValue({ query } as unknown as Pool);

    let failure: unknown;
    try {
      await handler({ operation: "get", key: "latest:USD:COP" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: "Rate cache unavailable" });
    expect((failure as Error).message).not.toContain(sensitiveDiagnostic);
    expect((failure as Error).stack).not.toContain(sensitiveDiagnostic);
    expect("cause" in (failure as Error)).toBe(false);
    expect(query).toHaveBeenCalledOnce();
  });

  it("uses the same fixed diagnostic for invalid invocations", async () => {
    await expect(handler({ operation: "delete", key: "latest:USD:COP" })).rejects.toThrow(
      new Error("Rate cache unavailable"),
    );
    expect(getPostgresPool).not.toHaveBeenCalled();
  });
});
