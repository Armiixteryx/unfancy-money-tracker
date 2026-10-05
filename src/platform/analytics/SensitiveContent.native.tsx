import type { PropsWithChildren } from "react";
import { PostHogMaskView } from "posthog-react-native";
import type { ViewProps } from "react-native";
export function SensitiveContent({
  children,
  style,
}: PropsWithChildren<{ style?: ViewProps["style"] }>) {
  return <PostHogMaskView style={style}>{children}</PostHogMaskView>;
}
