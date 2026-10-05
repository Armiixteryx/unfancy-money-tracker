import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const isProduction = process.env.EXPO_PUBLIC_ENV === "prod";
  return {
    ...config,
    name: isProduction ? "Unfancy Money Tracker" : "Unfancy Money Tracker (Dev)",
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
      bundleIdentifier: isProduction ? "com.unfancy.moneytracker" : "com.unfancy.moneytracker.dev"
    },
    android: {
      package: isProduction ? "com.unfancy.moneytracker" : "com.unfancy.moneytracker.dev",
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
      "./plugins/with-ios-scene.cjs",
      "./plugins/with-ios-pod-minimum.cjs",
      ["expo-localization", { supportedLocales: ["en", "es"] }],
      "expo-router",
      ["expo-audio", { microphonePermission: "Allow Unfancy Money Tracker to record an expense for remote voice processing.", enableAndroidRecording: true }]
    ]
  };
};
