import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppText as Text } from "../../ui/AppText";
import { useAppTheme } from "../../ui/theme";
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";

export function DemoBanner() {
  const { i18n } = useTranslation();
  const es = i18n.resolvedLanguage === "es";
  const { colors } = useAppTheme();
  const reset = useLocalDatasetStore(state => state.resetLocalData);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const restart = async () => {
    setBusy(true);
    setFailed(false);
    try { await reset(); setConfirm(false); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return <View style={{ backgroundColor: colors.warningSubtle, borderBottomColor: colors.warning, borderBottomWidth: 1, padding: 12, gap: 8 }}>
    <Text style={{ color: colors.text, fontWeight: "500" }}>{es ? "DEMO · Solo datos de ejemplo. Los cambios se borran al recargar. No ingreses datos financieros reales." : "DEMO · Sample data only. Changes reset on refresh. Do not enter real financial data."}</Text>
    <Text style={{ color: colors.muted }}>{es ? "Sin cuentas, sincronización, grupos, voz, analítica ni conversión de monedas." : "Accounts, sync, shared trackers, voice, analytics, and currency conversion are unavailable."}</Text>
    {confirm ? <>
      <Text style={{ color: colors.text }}>{es ? "¿Borrar los cambios de esta demo y restaurar los ejemplos?" : "Discard this demo’s changes and restore the samples?"}</Text>
      <View style={{ flexDirection: "row", gap: 20 }}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirm(false)}><Text style={{ color: colors.text }}>{es ? "Cancelar" : "Cancel"}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restart()}><Text style={{ color: colors.negative }}>{busy ? (es ? "Restaurando…" : "Resetting…") : (es ? "Confirmar reinicio" : "Confirm reset")}</Text></Pressable>
      </View>
    </> : <Pressable accessibilityRole="button" onPress={() => setConfirm(true)}><Text style={{ color: colors.text, textDecorationLine: "underline" }}>{es ? "Restaurar demo" : "Reset demo"}</Text></Pressable>}
    {failed ? <Text accessibilityRole="alert" style={{ color: colors.negative }}>{es ? "No se pudo restaurar. Reintentar." : "Reset failed. Please retry."}</Text> : null}
  </View>;
}
