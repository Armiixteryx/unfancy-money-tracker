import { useContext, type ComponentPropsWithRef } from "react";
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextStyle } from "react-native";
import { FontsReadyContext, TextColorContext, typography } from "./designTokens";

type TextProps = ComponentPropsWithRef<typeof NativeText> & { variant?: keyof typeof typography };

function fontStyle(style: TextStyle | undefined, loaded: boolean): TextStyle {
  const display = style?.fontFamily === "Fraunces_400Regular";
  const weight = Number(style?.fontWeight ?? 400);
  return {
    fontFamily: loaded
      ? display ? "Fraunces_400Regular" : weight >= 600 ? "Inter_600SemiBold" : weight >= 500 ? "Inter_500Medium" : "Inter_400Regular"
      : undefined,
    fontWeight: loaded ? "400" : display ? "400" : weight >= 600 ? "600" : weight >= 500 ? "500" : "400",
  };
}

export function AppText({ variant, style, ...props }: TextProps) {
  const loaded = useContext(FontsReadyContext);
  const color = useContext(TextColorContext);
  const semanticStyle = variant ? typography[variant] : undefined;
  const flattened = StyleSheet.flatten?.([semanticStyle, style]);
  return <NativeText {...props} style={[{ ...typography.body, color }, semanticStyle, style, fontStyle(flattened, loaded)]} />;
}

export function AppTextInput({ style, ...props }: ComponentPropsWithRef<typeof NativeTextInput>) {
  const loaded = useContext(FontsReadyContext);
  const color = useContext(TextColorContext);
  return <NativeTextInput {...props} style={[{ ...typography.body, color }, style, fontStyle(StyleSheet.flatten?.(style), loaded)]} />;
}

