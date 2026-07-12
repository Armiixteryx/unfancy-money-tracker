import { PostHogProvider } from "posthog-react-native";
import type { PropsWithChildren } from "react";
import type PostHog from "posthog-react-native";

export function PostHogProviderWrapper({ children, client }: PropsWithChildren<{ client?: unknown }>) {
  if (!client) return children;
  return <PostHogProvider client={client as PostHog} autocapture={{ captureTouches: false, captureScreens: false, noCaptureProp: "ph-no-capture", ignoreLabels: ["ph-no-capture"] }}>{children}</PostHogProvider>;
}
