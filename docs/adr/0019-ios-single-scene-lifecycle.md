# ADR 0019: iOS single-scene lifecycle compatibility

## Status

Accepted.

## Context

David’s iPad runs iPadOS 27 and the development Mac uses Xcode 27. The Expo SDK 54 app compiled and installed, but UIKit stopped it before JavaScript loaded. The device crash report contained `EXC_BREAKPOINT` in `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. Apple requires scene adoption for apps linked against the iOS 27 SDK. The older installed Xcode 16.4 could not build on this Mac, reporting unavailable iOS destinations.

## Decision

Keep the current Expo SDK and add a local prebuild plugin, `plugins/with-ios-scene.cjs`, for a single UIKit window scene. Store the launch options while initializing the existing React Native factory in the application delegate. Create the window from the connecting `UIWindowScene`, merge its cold URL/user activity into the launch options, then start React Native and the existing Expo delegate subscribers. SDK 54's development launcher needs the window and deferred React root before its launch subscriber runs.

Forward scene URL and universal-link callbacks through the existing application delegate, and active/inactive/background/foreground callbacks through Expo's subscriber interface. Preserve one React instance and window across scene reconnection. Multiple scenes remain disabled. Keep category, persistence, language, navigation, and voice-operation behavior unchanged.

The plugin changes the generated Swift file and Info.plist, so native regeneration retains the fix. It is idempotent and fails on an unfamiliar app delegate template. No system-wide Xcode switch or Expo version upgrade is introduced.

## Consequences

The SDK 54 client can adopt the native lifecycle required by iOS 27. This compatibility layer must be reviewed during an Expo upgrade and removed once the selected Expo SDK provides its own scene support. Native checks must include a cold launch, development-client URL, app links, foreground/background behavior, and language rendering; a successful build alone does not verify launch.

References: [Apple scene lifecycle migration](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle), [Expo scene lifecycle guidance](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md).
