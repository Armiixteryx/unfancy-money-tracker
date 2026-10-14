import type { ConfigContext, ExpoConfig } from "expo/config";

export function buildAppConfig(config: ExpoConfig, env: Record<string, string | undefined> = process.env): ExpoConfig {
  const isProduction = env.EXPO_PUBLIC_ENV === "prod";
  const isE2E = env.UNFANCY_E2E === "1";
  if (isE2E && isProduction) throw new Error("UNFANCY_E2E cannot be used with EXPO_PUBLIC_ENV=prod");
  const applicationId = isE2E ? "com.unfancy.moneytracker.e2e" : isProduction ? "com.unfancy.moneytracker" : "com.unfancy.moneytracker.dev";
  const iconAssets = isProduction
    ? {
        app: "./artifacts/brand-kit/platform/ios/icon-1024-opaque.png",
        androidForeground: "./artifacts/brand-kit/platform/android/foreground-432-adaptive.png",
        androidMonochrome: "./artifacts/brand-kit/platform/android/monochrome-432-mask.png",
        favicon: "./artifacts/brand-kit/platform/web/favicon-48.png"
      }
    : {
        app: "./artifacts/brand-kit/platform/dev/icon-ios-dev-1024.png",
        androidForeground: "./artifacts/brand-kit/platform/dev/android-foreground-dev-432.png",
        androidMonochrome: "./artifacts/brand-kit/platform/dev/android-monochrome-dev-432.png",
        favicon: "./artifacts/brand-kit/platform/dev/favicon-dev-48.png"
      };
  return {
    ...config,
    name: isE2E ? "Unfancy Money Tracker (E2E)" : isProduction ? "Unfancy Money Tracker" : "Unfancy Money Tracker (Dev)",
    slug: "unfancy-money-tracker",
    version: "1.1.2",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    scheme: "unfancy-money-tracker",
    icon: iconAssets.app,
    newArchEnabled: true,
    experiments: {
      autolinkingModuleResolution: true
    },
    ios: {
      supportsTablet: true,
      buildNumber: "6",
      bundleIdentifier: applicationId,
      ...(!isProduction ? { infoPlist: { NSLocalNetworkUsageDescription: "Connect to the local development server to test Unfancy Money Tracker." } } : {})
    },
    android: {
      package: applicationId,
      versionCode: 6,
      adaptiveIcon: {
        backgroundColor: "#102A43",
        foregroundImage: iconAssets.androidForeground,
        monochromeImage: iconAssets.androidMonochrome
      }
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: iconAssets.favicon
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
