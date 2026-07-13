import { describe, expect, it } from "vitest";

import { normalizeDeveloperSeedPath } from "./normalizeDeveloperSeedPath";

describe("developer seed deep links", () => {
  it("normalizes native host-style and path-style custom scheme URLs", () => {
    expect(normalizeDeveloperSeedPath("unfancy-money-tracker://developer-seed?preset=dashboard")).toBe("/developer-seed?preset=dashboard");
    expect(normalizeDeveloperSeedPath("unfancy-money-tracker:///developer-seed?preset=edge-cases")).toBe("/developer-seed?preset=edge-cases");
  });

  it("leaves unrelated paths unchanged", () => {
    expect(normalizeDeveloperSeedPath("unfancy-money-tracker://settings")).toBe("unfancy-money-tracker://settings");
    expect(normalizeDeveloperSeedPath("not a URL")).toBe("not a URL");
  });
});
