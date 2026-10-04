const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Metro must use tslib's pure ESM entry; the default export map wraps CJS
// through modules/index.js and fails during Expo static rendering.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "tslib") return { type: "sourceFile", filePath: require.resolve("tslib/tslib.es6.js") };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });

