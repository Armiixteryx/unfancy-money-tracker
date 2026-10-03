import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { addSceneSupport } = require("../../../plugins/with-ios-scene.cjs") as { addSceneSupport: (contents: string) => string };
const template = `import Expo
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?
  public override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    let factory = ExpoReactNativeFactory(delegate: ReactNativeDelegate())
    reactNativeFactory = factory
    bindReactNativeFactory(factory)
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
  // Linking API
}
`;

describe("iOS scene prebuild compatibility", () => {
  it("regenerates idempotently and starts subscribers after a scene-backed React window", () => {
    const result = addSceneSupport(template);
    expect(addSceneSupport(result)).toBe(result);
    expect(result).not.toContain("UIWindow(frame: UIScreen.main.bounds)");
    const sceneWindow = result.indexOf("UIWindow(windowScene: scene)");
    const reactStartup = result.indexOf("reactNativeFactory?.startReactNative(");
    const subscriberStartup = result.indexOf("super.application(UIApplication.shared, didFinishLaunchingWithOptions: launchOptions)");
    expect(sceneWindow).toBeLessThan(reactStartup);
    expect(reactStartup).toBeLessThan(subscriberStartup);
    expect(result).toContain("launchOptions[.url] = context.url");
    expect(result).toContain("launchOptions[.userActivityDictionary]");
    expect(result).toContain("self.scene(scene, openURLContexts: options.urlContexts)");
    expect(result).toContain("applicationDidEnterBackground(UIApplication.shared)");
    expect(result).toContain("applicationDidBecomeActive(UIApplication.shared)");
  });
  it("rejects template changes instead of generating an app without scene startup", () => {
    expect(() => addSceneSupport(template.replace("window = UIWindow(frame: UIScreen.main.bounds)", "window = customWindow()"))).toThrow("template changed");
  });
});
