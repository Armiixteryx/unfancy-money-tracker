import { describe, expect, it } from "vitest";
import { buildAppConfig } from "../../../app.config";

describe("E2E native identity", () => {
  it("uses an isolated dev-only install identity when explicitly enabled", () => {
    const config = buildAppConfig({} as never, { EXPO_PUBLIC_ENV: "dev", UNFANCY_E2E: "1" });
    expect(config.name).toBe("Unfancy Money Tracker (E2E)");
    expect(config.ios?.bundleIdentifier).toBe("com.unfancy.moneytracker.e2e");
    expect(config.android?.package).toBe("com.unfancy.moneytracker.e2e");
    expect(buildAppConfig({} as never, { EXPO_PUBLIC_ENV: "prod" }).ios?.bundleIdentifier).toBe("com.unfancy.moneytracker");
  });

  it("refuses the isolated identity in the production environment", () => {
    expect(() => buildAppConfig({} as never, { EXPO_PUBLIC_ENV: "prod", UNFANCY_E2E: "1" })).toThrow("cannot be used");
  });

  it("describes development LAN access without changing production networking", () => {
    expect(buildAppConfig({} as never, { EXPO_PUBLIC_ENV: "local" }).ios?.infoPlist?.NSLocalNetworkUsageDescription).toBeTruthy();
    expect(buildAppConfig({} as never, { EXPO_PUBLIC_ENV: "prod" }).ios?.infoPlist).toBeUndefined();
  });
});
