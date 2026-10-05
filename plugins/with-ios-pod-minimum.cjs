const { withPodfile } = require("expo/config-plugins");

const marker = "# Unfancy: keep dependency targets within the app's iOS minimum";
const minimum = `    ${marker}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        deployment_target = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if deployment_target && Gem::Version.new(deployment_target) < Gem::Version.new('15.1')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
`;

module.exports = function withIosPodMinimum(config) {
  return withPodfile(config, config => {
    const contents = config.modResults.contents;
    if (contents.includes(marker)) return config;
    const anchor = "  end\nend";
    const index = contents.lastIndexOf(anchor);
    if (index < 0 || !contents.includes("post_install do |installer|")) {
      throw new Error("The Expo Podfile template changed; review the iOS dependency minimum plugin.");
    }
    config.modResults.contents = contents.slice(0, index) + minimum + contents.slice(index);
    return config;
  });
};
