import { afterEach, describe, expect, it, vi } from "vitest";

import { isLocalDevelopmentRuntime } from "./localDevelopment";

describe("local development runtime", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("only enables development tooling in the explicit local environment", () => {
    vi.stubEnv("EXPO_PUBLIC_ENV", "local");
    expect(isLocalDevelopmentRuntime()).toBe(true);

    vi.stubEnv("EXPO_PUBLIC_ENV", "production");
    expect(isLocalDevelopmentRuntime()).toBe(false);
  });
});
