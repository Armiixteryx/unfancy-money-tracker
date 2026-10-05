import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
export function SensitiveContent({
  children,
  style,
}: PropsWithChildren<{ style?: ViewProps["style"] }>) {
  return (
    <View
      style={style}
      {...{
        className: "ph-no-capture ph-mask",
        dataSet: { sensitive: "auth" },
      }}
    >
      {children}
    </View>
  );
}
