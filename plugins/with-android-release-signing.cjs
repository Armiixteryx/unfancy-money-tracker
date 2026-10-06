const { withAppBuildGradle } = require("expo/config-plugins");
const marker = "// Unfancy: production signing comes from private build environment";

function configureReleaseSigning(contents) {
  if (contents.includes(marker)) return contents;
  const anchor = "    buildTypes {";
  if (!contents.includes(anchor) || !/release\s*\{[\s\S]*?signingConfig signingConfigs\.debug/.test(contents)) {
    throw new Error("The Expo Gradle template changed; review production signing.");
  }
  const configuration = `    ${marker}
    signingConfigs {
        release {
            def releaseStore = System.getenv('UNFANCY_ANDROID_KEYSTORE')
            if (releaseStore) {
                storeFile file(releaseStore)
                storePassword System.getenv('UNFANCY_ANDROID_SIGNING_PASSWORD')
                keyAlias 'unfancy-release'
                keyPassword System.getenv('UNFANCY_ANDROID_SIGNING_PASSWORD')
            }
        }
    }
    gradle.taskGraph.whenReady { graph ->
        if (graph.allTasks.any { it.name.toLowerCase().contains('release') } &&
            (!System.getenv('UNFANCY_ANDROID_KEYSTORE') || !System.getenv('UNFANCY_ANDROID_SIGNING_PASSWORD'))) {
            throw new GradleException('Production signing configuration unavailable; configure the private keystore and signing password environment.')
        }
    }
`;
  return contents.replace(
    /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
    "$1signingConfig signingConfigs.release",
  ).replace(anchor, configuration + anchor);
}

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, config => {
    config.modResults.contents = configureReleaseSigning(config.modResults.contents);
    return config;
  });
};
module.exports.configureReleaseSigning = configureReleaseSigning;
