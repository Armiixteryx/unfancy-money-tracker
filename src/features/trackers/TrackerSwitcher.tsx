import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "../../ui/AppText";
import { useAppTheme } from "../../ui/theme";
import { SensitiveContent } from "../../platform/analytics/SensitiveContent";
import { selectTracker, useTrackerRegistry } from "./store";

export function TrackerSwitcher() {
  useTranslation();
  const { colors } = useAppTheme();
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
    <Pressable accessibilityRole="button" accessibilityLabel={es ? `Conjunto activo: ${active.name}. Cambiar conjunto` : `Active tracker: ${active.name}. Switch tracker`} accessibilityState={{ expanded: visible }} onPress={() => setVisible(true)} style={{ alignSelf: "flex-start", borderColor: colors.border, borderRadius: 999, borderWidth: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 16 }}>
      <Text style={{ color: colors.text }}>{active.name} ⌄</Text>
    </Pressable>
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
      <Pressable accessible={false} onPress={() => setVisible(false)} style={{ alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 8, maxWidth: 420, padding: 16, width: "100%" }}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: "600", marginBottom: 4 }}>{es ? "Tus conjuntos" : "Your trackers"}</Text>
          {isSelecting ? <Text>{es ? "Cargando conjunto…" : "Loading tracker…"}</Text> : null}
          {selectionFailed ? <Text accessibilityRole="alert">{es ? "No se pudo abrir el conjunto. Inténtalo de nuevo." : "Could not open the tracker. Try again."}</Text> : null}
          {summaries.map(summary => <Pressable key={`${summary.datasetId}:${summary.membershipId ?? "personal"}`} accessibilityRole="button" disabled={isSelecting} accessibilityState={{ disabled: isSelecting, selected: summary.datasetId === active.datasetId && summary.membershipId === active.membershipId }} onPress={() => { void chooseTracker(summary.datasetId, summary.membershipId); }} style={{ borderColor: colors.border, borderRadius: 10, borderWidth: 1, minHeight: 48, justifyContent: "center", paddingHorizontal: 12 }}><Text style={{ color: colors.text }}>{summary.name}{summary.archived ? (es ? " · Archivado" : " · Archived") : ""}{summary.role === "admin" && summary.kind === "shared" ? (es ? " · Admin" : " · Admin") : ""}</Text></Pressable>)}
          <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={{ alignItems: "center", minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.muted }}>{es ? "Cerrar" : "Close"}</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
  </SensitiveContent>;
}
