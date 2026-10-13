import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAppConfig } from "../../../app.config";

function expectConfiguredAssetToExist(assetPath: string | undefined): void {
  expect(assetPath).toBeDefined();
  if (assetPath) expect(existsSync(resolve(process.cwd(), assetPath))).toBe(true);
}

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

describe("environment-specific brand assets", () => {
  it("uses clean production artwork for iOS, Android, and web", () => {
    const config = buildAppConfig({} as never, { EXPO_PUBLIC_ENV: "prod" });
    expect(config.icon).toBe("./artifacts/brand-kit/platform/ios/icon-1024-opaque.png");
    expect(config.android?.adaptiveIcon).toMatchObject({
      backgroundColor: "#102A43",
      foregroundImage: "./artifacts/brand-kit/platform/android/foreground-432-adaptive.png",
      monochromeImage: "./artifacts/brand-kit/platform/android/monochrome-432-mask.png"
    });
    expect(config.web?.favicon).toBe("./artifacts/brand-kit/platform/web/favicon-48.png");
    expectConfiguredAssetToExist(config.icon);
    expectConfiguredAssetToExist(config.android?.adaptiveIcon?.foregroundImage);
    expectConfiguredAssetToExist(config.android?.adaptiveIcon?.monochromeImage);
    expectConfiguredAssetToExist(config.web?.favicon);
  });

  it.each([
    ["default", {}],
    ["local", { EXPO_PUBLIC_ENV: "local" }],
    ["development", { EXPO_PUBLIC_ENV: "dev" }],
    ["E2E", { EXPO_PUBLIC_ENV: "dev", UNFANCY_E2E: "1" }]
  ])("uses DEV-ribbon artwork for the %s environment", (_environment, env) => {
    const config = buildAppConfig({} as never, env);
    expect(config.icon).toBe("./artifacts/brand-kit/platform/dev/icon-ios-dev-1024.png");
    expect(config.android?.adaptiveIcon).toMatchObject({
      backgroundColor: "#102A43",
      foregroundImage: "./artifacts/brand-kit/platform/dev/android-foreground-dev-432.png",
      monochromeImage: "./artifacts/brand-kit/platform/dev/android-monochrome-dev-432.png"
    });
    expect(config.web?.favicon).toBe("./artifacts/brand-kit/platform/dev/favicon-dev-48.png");
    expectConfiguredAssetToExist(config.icon);
    expectConfiguredAssetToExist(config.android?.adaptiveIcon?.foregroundImage);
    expectConfiguredAssetToExist(config.android?.adaptiveIcon?.monochromeImage);
    expectConfiguredAssetToExist(config.web?.favicon);
  });
});
