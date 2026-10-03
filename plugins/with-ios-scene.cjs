const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const marker = "// Unfancy single-scene lifecycle compatibility";
const startup = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)`;

const sceneStartup = `${marker}
    sceneLaunchOptions = launchOptions
    return true`;

const sceneMethod = `
  private var sceneLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func connectScene(_ scene: UIWindowScene, options: UIScene.ConnectionOptions) {
    if let window = window {
      window.windowScene = scene
      window.makeKeyAndVisible()
      return
    }
    var launchOptions = sceneLaunchOptions ?? [:]
    if let context = options.urlContexts.first {
      launchOptions[.url] = context.url
      launchOptions[.sourceApplication] = context.options.sourceApplication
      launchOptions[.annotation] = context.options.annotation
    }
    if let activity = options.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityKey": activity,
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType
      ]
    }
    let sceneWindow = UIWindow(windowScene: scene)
    window = sceneWindow
    reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: sceneWindow,
      launchOptions: launchOptions)
    // SDK 54's dev launcher requires its window before delegate subscribers start.
    _ = super.application(UIApplication.shared, didFinishLaunchingWithOptions: launchOptions)
  }
`;

const sceneDelegate = `

class UnfancySceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private var appDelegate: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    appDelegate?.connectScene(windowScene, options: options)
    window = appDelegate?.window
    // SDK 54's launcher waits for the URL callback after didFinishLaunching.
    // UIKit delivers cold URLs only through connectionOptions with scenes.
    if !options.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: options.urlContexts)
    }
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      options[.sourceApplication] = context.options.sourceApplication
      options[.annotation] = context.options.annotation
      _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }
  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }
  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }
  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }
}
`;

function addSceneSupport(contents) {
  if (contents.includes(marker)) {
    const delegateStart = contents.indexOf("class UnfancySceneDelegate: UIResponder, UIWindowSceneDelegate {");
    if (delegateStart < 0) throw new Error("The generated single-scene delegate is missing; regenerate the native project.");
    return contents.slice(0, delegateStart).trimEnd() + sceneDelegate;
  }
  const linkAnchor = "  // Linking API";
  if (!contents.includes(startup) || !contents.includes(linkAnchor)) {
    throw new Error("The Expo iOS AppDelegate template changed; review the single-scene compatibility plugin.");
  }
  return contents.replace(startup, sceneStartup).replace(linkAnchor, sceneMethod + "\n" + linkAnchor).trimEnd() + sceneDelegate;
}

module.exports = function withIosScene(config) {
  config = withInfoPlist(config, config => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: "Default Configuration",
          UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).UnfancySceneDelegate"
        }]
      }
    };
    return config;
  });
  return withAppDelegate(config, config => {
    if (config.modResults.language !== "swift") throw new Error("The single-scene plugin requires the Expo Swift AppDelegate.");
    config.modResults.contents = addSceneSupport(config.modResults.contents);
    return config;
  });
};
module.exports.addSceneSupport = addSceneSupport;
