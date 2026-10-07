import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { addDependencies, addComposePlugin, addWearModule, registerPackage } = require('../../../plugins/with-wear-voice.cjs') as { addDependencies(contents: string): string; addComposePlugin(contents: string): string; addWearModule(contents: string): string; registerPackage(contents: string): string };

describe('generated Wear integration', () => {
  it('restores native module wiring without duplication', () => {
    const dependencies = addDependencies('android {\n}\ndependencies {\n}');
    expect(dependencies).toContain('play-services-wearable:20.0.1');
    expect(dependencies).toContain('work-runtime-ktx');
    expect(addDependencies(dependencies)).toBe(dependencies);
    const settings = addWearModule("include ':app'");
    expect(addWearModule(settings)).toBe(settings);
    const main = registerPackage('PackageList(this).packages.apply {\n}');
    expect(main).toContain('WatchAudioBridgePackage()');
    expect(registerPackage(main)).toBe(main);
    const project = addComposePlugin("classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')");
    expect(project).toContain('compose-compiler-gradle-plugin:2.1.20');
    expect(addComposePlugin(project)).toBe(project);
  });
  it('rejects unfamiliar native templates', () => {
    expect(() => registerPackage('unexpected')).toThrow('registration anchor');
    expect(() => addDependencies('unexpected')).toThrow('dependencies anchor');
  });
});
