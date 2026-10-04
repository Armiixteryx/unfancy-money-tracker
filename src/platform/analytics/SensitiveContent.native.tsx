import type { PropsWithChildren } from "react";
import { PostHogMaskView } from "posthog-react-native";
export function SensitiveContent({ children }: PropsWithChildren) {
  return <PostHogMaskView>{children}</PostHogMaskView>;
}
