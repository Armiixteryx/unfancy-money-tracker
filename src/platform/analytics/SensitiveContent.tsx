import type { PropsWithChildren } from "react";
import { View } from "react-native";
export function SensitiveContent({ children }: PropsWithChildren) {
  return <View {...{ className: "ph-no-capture ph-mask", dataSet: { sensitive: "auth" } }}>{children}</View>;
}
