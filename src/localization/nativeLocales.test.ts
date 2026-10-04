import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { z } from "zod";

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve("expo/package.json"));
const { getResolvedLocalesAsync } = expoRequire("@expo/config-plugins/build/utils/locales") as {
  getResolvedLocalesAsync: (
    projectRoot: string,
    locales: Record<string, string>,
    platform: "android" | "ios",
  ) => Promise<unknown>;
};
const projectRoot = fileURLToPath(new URL("../../", import.meta.url).href);
const locales = {
  en: "./src/localization/native/en.json",
  es: "./src/localization/native/es.json",
};
const resolvedSchema = z.record(z.string(), z.record(z.string(), z.string()));

it("preserves localized iOS microphone text without adding iOS keys to Android resources", async () => {
  const ios = resolvedSchema.parse(await getResolvedLocalesAsync(projectRoot, locales, "ios"));
  const android = resolvedSchema.parse(await getResolvedLocalesAsync(projectRoot, locales, "android"));
  expect(ios.en?.NSMicrophoneUsageDescription).toContain("record an expense");
  expect(ios.es?.NSMicrophoneUsageDescription).toContain("grabe un gasto");
  expect(android).toEqual({ en: {}, es: {} });
});
