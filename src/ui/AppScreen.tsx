import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "./theme";

type AppScreenProps = {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
};

export function AppScreen({ title, eyebrow, children }: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;

  return (
    <ScrollView
      className="ph-no-capture"
      {...{"ph-no-capture": true}}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 24),
          paddingBottom: Math.max(insets.bottom, 32),
          paddingLeft: isDesktopWeb ? 260 : 24,
          paddingRight: 24
        }
      ]}
      style={styles.container}
    >
      <View style={styles.header}>
        <View>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
        </View>
        <View accessibilityLabel="Local mode" style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Local mode</Text>
        </View>
      </View>
      {children}
    </ScrollView>
  );
}

export function EmptyState({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {children ? <View style={styles.emptyAction}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { minHeight: "100%", maxWidth: 1240, width: "100%", alignSelf: "center", gap: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  eyebrow: { color: colors.muted, fontSize: 14, fontWeight: "600", marginBottom: 6 },
  title: { color: colors.navy, fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
  statusPill: {
    alignItems: "center",
    backgroundColor: "#E9F7EF",
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  statusDot: { backgroundColor: colors.emerald, borderRadius: 999, height: 8, width: 8 },
  statusText: { color: colors.emerald, fontSize: 13, fontWeight: "700" },
  emptyState: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 300,
    padding: 32
  },
  emptyIcon: { backgroundColor: "#ECF2F8", borderRadius: 24, height: 64, marginBottom: 20, width: 64 },
  emptyTitle: { color: colors.navy, fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptyDescription: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 8, maxWidth: 420, textAlign: "center" },
  emptyAction: { marginTop: 24 }
});
