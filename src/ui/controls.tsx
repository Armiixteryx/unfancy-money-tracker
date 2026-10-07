import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { layout } from "./designTokens";
import { useThemedStyles, type ThemeColors } from "./theme";

type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = "primary", disabled, style, ...props }: ButtonProps) {
  const styles = useThemedStyles(createStyles);
  const filled = variant === "primary" || variant === "danger";
  return (
    <Pressable {...props} accessibilityRole="button" disabled={disabled}
      accessibilityState={{ ...props.accessibilityState, disabled: Boolean(disabled) }}
      style={[styles.button, styles[variant], disabled && styles.disabled, style]}>
      <AppText variant="label" style={[styles.buttonText, filled && styles.filledText]}>{label}</AppText>
    </Pressable>
  );
}

export function Card({ style, ...props }: ViewProps) {
  const styles = useThemedStyles(createStyles);
  return <View {...props} style={[styles.card, style]} />;
}

export function Status({ label, tone = "info" }: { label: string; tone?: "info" | "positive" | "negative" | "warning" }) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.status, styles[`${tone}Status`]]}><AppText variant="caption" style={styles[`${tone}Text`]}>{label}</AppText></View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.cardRadius, padding: 24, gap: 16 },
  button: { alignItems: "center", justifyContent: "center", minHeight: layout.touchTarget, borderRadius: layout.pillRadius, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1 },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.border },
  ghost: { borderColor: "transparent" },
  danger: { backgroundColor: colors.negative, borderColor: colors.negative },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.text, textAlign: "center" }, filledText: { color: colors.onPrimary },
  status: { alignSelf: "flex-start", borderRadius: layout.pillRadius, paddingHorizontal: 12, paddingVertical: 6 },
  infoStatus: { backgroundColor: colors.infoSubtle }, infoText: { color: colors.muted },
  positiveStatus: { backgroundColor: colors.positiveSubtle }, positiveText: { color: colors.positive },
  negativeStatus: { backgroundColor: colors.negativeSubtle }, negativeText: { color: colors.negative },
  warningStatus: { backgroundColor: colors.warningSubtle }, warningText: { color: colors.warning },
});
