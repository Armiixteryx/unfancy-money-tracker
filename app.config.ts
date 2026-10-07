import type { ConfigContext, ExpoConfig } from "expo/config";

export function buildAppConfig(config: ExpoConfig, env: Record<string, string | undefined> = process.env): ExpoConfig {
  const isProduction = env.EXPO_PUBLIC_ENV === "prod";
  const isE2E = env.UNFANCY_E2E === "1";
  if (isE2E && isProduction) throw new Error("UNFANCY_E2E cannot be used with EXPO_PUBLIC_ENV=prod");
  const applicationId = isE2E ? "com.unfancy.moneytracker.e2e" : isProduction ? "com.unfancy.moneytracker" : "com.unfancy.moneytracker.dev";
  return {
    ...config,
    name: isE2E ? "Unfancy Money Tracker (E2E)" : isProduction ? "Unfancy Money Tracker" : "Unfancy Money Tracker (Dev)",
    slug: "unfancy-money-tracker",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    scheme: "unfancy-money-tracker",
    newArchEnabled: true,
    experiments: {
      autolinkingModuleResolution: true
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: applicationId,
      ...(!isProduction ? { infoPlist: { NSLocalNetworkUsageDescription: "Connect to the local development server to test Unfancy Money Tracker." } } : {})
    },
    android: {
      package: applicationId,
      adaptiveIcon: {
        backgroundColor: "#F7F5F0"
      }
    },
    web: {
      bundler: "metro",
      output: "static"
    },
    locales: { en: "./src/localization/native/en.json", es: "./src/localization/native/es.json" },
    plugins: [
      ...(isProduction ? ["./plugins/with-android-release-signing.cjs"] : []),
      "./plugins/with-ios-scene.cjs",
      "./plugins/with-wear-voice.cjs",
      "./plugins/with-ios-pod-minimum.cjs",
      ["expo-localization", { supportedLocales: ["en", "es"] }],
      "expo-router",
      ["expo-audio", { microphonePermission: "Allow Unfancy Money Tracker to record an expense for remote voice processing.", enableAndroidRecording: true }]
    ]
  };
}

export default ({ config }: ConfigContext): ExpoConfig => buildAppConfig(config as ExpoConfig);
