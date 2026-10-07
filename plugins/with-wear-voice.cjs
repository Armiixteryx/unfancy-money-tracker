const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withProjectBuildGradle, withSettingsGradle, withMainApplication, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const marker = '// Unfancy Wear voice';
function addDependencies(contents) {
  if (!contents.includes('dependencies {') || !contents.includes('android {')) {
    throw new Error('Android dependencies anchor unavailable');
  }
  const dependencies = [
    'implementation("com.google.android.gms:play-services-wearable:20.0.1")',
    'implementation("androidx.work:work-runtime-ktx:2.10.1")',
    'testImplementation("junit:junit:4.13.2")',
    'testImplementation("org.json:json:20250517")',
    'coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")',
  ];
  const missing = dependencies.filter(dependency => !contents.includes(dependency));
  if (missing.length) {
    contents = contents.replace('dependencies {', `dependencies {\n    ${marker}\n    ${missing.join('\n    ')}`);
  }
  if (!contents.includes('coreLibraryDesugaringEnabled true')) {
    contents = contents.replace('android {', 'android {\n    compileOptions { coreLibraryDesugaringEnabled true }');
  }
  if (!contents.includes("com.unfancy.moneytracker.watch.PhoneDeviceChecks")) {
    contents = contents.replace("defaultConfig {", "defaultConfig {\n        testInstrumentationRunner 'com.unfancy.moneytracker.watch.PhoneDeviceChecks'");
  }
  return contents;
}
function addComposePlugin(contents) {
  if (contents.includes('compose-compiler-gradle-plugin')) return contents;
  return contents.replace("classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')", "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n    classpath('org.jetbrains.kotlin:compose-compiler-gradle-plugin:2.1.20')");
}
function addWearModule(contents) {
  return contents.includes("include ':wear'") ? contents : `${contents}\n${marker}\ninclude ':wear'\n`;
}
function registerPackage(contents) {
  if (contents.includes('com.unfancy.moneytracker.watch.WatchAudioBridgePackage()')) return contents;
  const anchor = 'PackageList(this).packages.apply {';
  if (!contents.includes(anchor)) throw new Error('Android package registration anchor unavailable');
  return contents.replace(anchor, `${anchor}\n              add(com.unfancy.moneytracker.watch.WatchAudioBridgePackage())`);
}
module.exports = function withWearVoice(config) {
  config = withAppBuildGradle(config, mod => { mod.modResults.contents = addDependencies(mod.modResults.contents); return mod; });
  config = withProjectBuildGradle(config, mod => { mod.modResults.contents = addComposePlugin(mod.modResults.contents); return mod; });
  config = withSettingsGradle(config, mod => { mod.modResults.contents = addWearModule(mod.modResults.contents); return mod; });
  config = withMainApplication(config, mod => { mod.modResults.contents = registerPackage(mod.modResults.contents); return mod; });
  config = withAndroidManifest(config, mod => {
    const application = mod.modResults.manifest.application[0];
    application.service ||= [];
    // WearableListenerService authenticates the Google Play services binder internally.
    // The data-layer requires a matching application ID and signing certificate.
    const name = 'com.unfancy.moneytracker.watch.WatchAudioReceiverService';
    if (!application.service.some(service => service.$['android:name'] === name)) {
      application.service.push({ $: { 'android:name': name, 'android:exported': 'true' }, 'intent-filter': [{ action: [{ $: { 'android:name': 'com.google.android.gms.wearable.DATA_CHANGED' } }, { $: { 'android:name': 'com.google.android.gms.wearable.MESSAGE_RECEIVED' } }], data: [{ $: { 'android:scheme': 'wear', 'android:host': '*', 'android:pathPrefix': '/unfancy/watch' } }] }] });
    }
    return mod;
  });
  return withDangerousMod(config, ['android', mod => {
    const root = mod.modRequest.projectRoot;
    const androidRoot = mod.modRequest.platformProjectRoot;
    fs.cpSync(path.join(root, 'native/wear'), path.join(androidRoot, 'wear'), { recursive: true });
    fs.rmSync(path.join(androidRoot, 'app/src/main/java/com/unfancy/moneytracker/watch'), { recursive: true, force: true });
    fs.cpSync(path.join(root, 'native/android-watch/src/main'), path.join(androidRoot, 'app/src/main'), { recursive: true });
    const tests = path.join(root, 'native/android-watch/src/test');
    if (fs.existsSync(tests)) fs.cpSync(tests, path.join(androidRoot, 'app/src/test'), { recursive: true });
    const deviceTests = path.join(root, 'native/android-watch/src/androidTest');
    if (fs.existsSync(deviceTests)) fs.cpSync(deviceTests, path.join(androidRoot, 'app/src/androidTest'), { recursive: true });
    return mod;
  }]);
};
Object.assign(module.exports, { addDependencies, addComposePlugin, addWearModule, registerPackage });
