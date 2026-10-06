import { AppText as Text } from "./AppText";
import { i18n } from "../localization/i18n";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { useLocalDatasetStore } from "../features/local-data/store/useLocalDatasetStore";
import { useAppTheme, useThemedStyles, type ThemeColors } from "./theme";

export function FirstRunWarning() {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const setPreferences = useLocalDatasetStore((state) => state.setPreferences);

  if (!dataset || dataset.preferences.firstRunNoticeDismissed) return null;

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Ionicons accessibilityElementsHidden color={colors.warning} name="warning-outline" size={22} />
      <Text style={styles.message}>{i18n.t($ => $.ui.commonThisIsNotASeriousApplicationDo)}</Text>
      <Pressable accessibilityLabel={i18n.t($ => $.ui.commonDismissApplicationWarning)} accessibilityRole="button" hitSlop={8} onPress={() => void setPreferences({ firstRunNoticeDismissed: true })} style={styles.dismiss}>
        <Ionicons color={colors.text} name="close" size={20} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  banner: { alignItems: "center", backgroundColor: colors.warningSubtle, borderBottomColor: colors.warning, borderBottomWidth: 1, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  message: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "500", lineHeight: 20 },
  dismiss: { alignItems: "center", justifyContent: "center", minHeight: 40, minWidth: 40 }
});
