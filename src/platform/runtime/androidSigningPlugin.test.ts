import { createRequire } from "node:module";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { configureReleaseSigning } = require("../../../plugins/with-android-release-signing.cjs") as { configureReleaseSigning(contents: string): string };
const template = `android {
    signingConfigs { debug { storePassword 'android' } }
    buildTypes {
        debug { signingConfig signingConfigs.debug }
        release {
            signingConfig signingConfigs.debug
        }
    }
}`;
it("uses a separate release identity without embedding private credentials", () => {
  const configured = configureReleaseSigning(template);
  expect(configured).toContain("debug { signingConfig signingConfigs.debug }");
  expect(configured).toContain("release {\n            signingConfig signingConfigs.release");
  expect(configured).toContain("System.getenv('UNFANCY_ANDROID_KEYSTORE')");
  expect(configured).toContain("System.getenv('UNFANCY_ANDROID_SIGNING_PASSWORD')");
  expect(configured).toContain("throw new GradleException('Production signing configuration unavailable");
  expect(configureReleaseSigning(configured)).toBe(configured);
});
it("fails safely when the native template changes", () => {
  expect(() => configureReleaseSigning("unexpected template")).toThrow("Expo Gradle template changed");
});
