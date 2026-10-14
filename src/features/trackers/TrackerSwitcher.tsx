import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "../../ui/AppText";
import { layout, typography } from "../../ui/designTokens";
import { selectionStyles } from "../../ui/selectionStyles";
import { useAppTheme } from "../../ui/theme";
import { SensitiveContent } from "../../platform/analytics/SensitiveContent";
import { selectTracker, useTrackerRegistry } from "./store";

export function TrackerSwitcher() {
  useTranslation();
  const { colors } = useAppTheme();
  const selectedStyles = selectionStyles(colors);
  const summaries = useTrackerRegistry(state => state.summaries);
  const active = useTrackerRegistry(state => state.activeSummary);
  const [visible, setVisible] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionFailed, setSelectionFailed] = useState(false);
  const es = useTranslation().i18n.resolvedLanguage === "es";
  const chooseTracker = async (datasetId: string, membershipId: string | null) => {
    setIsSelecting(true);
    setSelectionFailed(false);
    try {
      if (await selectTracker(datasetId, membershipId)) setVisible(false);
      else setSelectionFailed(true);
    } catch {
      setSelectionFailed(true);
    } finally {
      setIsSelecting(false);
    }
  };
  if (!active || summaries.length < 2) return null;
  return <SensitiveContent>
    <Pressable accessibilityRole="button" accessibilityLabel={es ? `Conjunto activo: ${active.name}. Cambiar conjunto` : `Active tracker: ${active.name}. Switch tracker`} accessibilityState={{ expanded: visible }} onPress={() => setVisible(true)} style={{ alignSelf: "flex-start", borderColor: colors.border, borderRadius: layout.pillRadius, borderWidth: 1, minHeight: layout.touchTarget, justifyContent: "center", paddingHorizontal: 16 }}>
      <Text style={{ color: colors.text }}>{active.name} ⌄</Text>
    </Pressable>
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
      <Pressable accessible={false} onPress={() => setVisible(false)} style={{ alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.cardRadius, borderWidth: 1, gap: 8, maxWidth: 420, padding: 16, width: "100%" }}>
          <Text accessibilityRole="header" style={{ ...typography.heading, color: colors.text, marginBottom: 4 }}>{es ? "Tus conjuntos" : "Your trackers"}</Text>
          {isSelecting ? <Text>{es ? "Cargando conjunto…" : "Loading tracker…"}</Text> : null}
          {selectionFailed ? <Text accessibilityRole="alert">{es ? "No se pudo abrir el conjunto. Inténtalo de nuevo." : "Could not open the tracker. Try again."}</Text> : null}
          {summaries.map(summary => { const selected = summary.datasetId === active.datasetId && summary.membershipId === active.membershipId; return <Pressable key={`${summary.datasetId}:${summary.membershipId ?? "personal"}`} accessibilityRole="button" disabled={isSelecting} accessibilityState={{ disabled: isSelecting, selected }} onPress={() => { void chooseTracker(summary.datasetId, summary.membershipId); }} style={[{ borderColor: colors.border, borderRadius: layout.pillRadius, borderWidth: 1, minHeight: layout.touchTarget, justifyContent: "center", paddingHorizontal: 12 }, selected && selectedStyles.selectedControl]}><Text style={[{ color: colors.text }, selected && selectedStyles.selectedText]}>{summary.name}{summary.archived ? (es ? " · Archivado" : " · Archived") : ""}{summary.role === "admin" && summary.kind === "shared" ? (es ? " · Admin" : " · Admin") : ""}</Text></Pressable>; })}
          <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={{ alignItems: "center", minHeight: layout.touchTarget, justifyContent: "center" }}><Text style={{ color: colors.muted }}>{es ? "Cerrar" : "Close"}</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
  </SensitiveContent>;
}
