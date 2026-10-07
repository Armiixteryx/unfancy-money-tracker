import { isWebRail, layout, typography } from "./designTokens";
import { AppText as Text } from "./AppText";
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemedStyles, type ThemeColors } from "./theme";
import { TrackerSwitcher } from "../features/trackers/TrackerSwitcher";
import { TrackerSyncNotice } from "../features/sync/TrackerSyncNotice";

type AppScreenProps = {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  overlay?: React.ReactNode;
  actions?: React.ReactNode;
};

export function AppScreen({ title, eyebrow, children, overlay, actions }: AppScreenProps) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = isWebRail(Platform.OS, width);
  const padding = isDesktopWeb ? layout.desktopPadding : layout.mobilePadding;

  return (
    <View style={[styles.root, isDesktopWeb && { paddingLeft: layout.railWidth }]}>
      <ScrollView
        className="ph-no-capture"
        {...{"ph-no-capture": true}}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top + 16, isDesktopWeb ? 40 : 24),
            paddingBottom: Math.max(insets.bottom, 32),
            paddingLeft: padding,
            paddingRight: padding
          }
        ]}
        style={styles.container}
      >
        <View style={styles.header}>
          <View style={styles.headingCopy}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text accessibilityRole="header" style={[styles.title, isDesktopWeb && styles.desktopTitle]}>
              {title}
            </Text>
          </View>
          {actions ? <View style={styles.headerActions}>{actions}</View> : null}
        </View>
        <TrackerSwitcher />
        <TrackerSyncNotice />
        {children}
      </ScrollView>
      {overlay ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.overlay,
            {
              bottom: Math.max(insets.bottom, 16),
              left: isDesktopWeb ? layout.railWidth : 0
            }
          ]}
        >
          {overlay}
        </View>
      ) : null}
    </View>
  );
}


export function EmptyState({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.emptyState}>
      <View accessibilityElementsHidden style={styles.emptyIcon}>
        <Ionicons color={styles.emptyIconGlyph.color} name="receipt-outline" size={30} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {children ? <View style={styles.emptyAction}>{children}</View> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, minWidth: 0 },
  overlay: { alignItems: "center", paddingHorizontal: 16, position: "absolute", right: 0 },
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { minHeight: "100%", maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center", gap: 24 },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 },
  headingCopy: { flexShrink: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  eyebrow: { color: colors.muted, fontSize: 14, fontWeight: "600", marginBottom: 6 },
  title: { ...typography.heading, color: colors.text, fontSize: 32, lineHeight: 40, letterSpacing: -1.2 },
  desktopTitle: { fontSize: 40, lineHeight: 48, letterSpacing: -1.8 },
  emptyState: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 300,
    padding: 24
  },
  emptyIcon: { alignItems: "center", backgroundColor: colors.infoSubtle, borderRadius: 12, height: 64, justifyContent: "center", marginBottom: 20, width: 64 },
  emptyIconGlyph: { color: colors.accent },
  emptyTitle: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400", textAlign: "center" },
  emptyDescription: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 8, maxWidth: 420, textAlign: "center" },
  emptyAction: { marginTop: 24, alignItems: "center", gap: 12 }
});
