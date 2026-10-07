import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "../../ui/AppText";
import { useAppTheme } from "../../ui/theme";
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";
import { useActiveTrackerSummary } from "../trackers/store";
import { syncState } from "./state";
import { useSync } from "./SyncProvider";

export function TrackerSyncNotice() {
  const { i18n } = useTranslation();
  const { colors } = useAppTheme();
  const tracker = useActiveTrackerSummary();
  const dataset = useLocalDatasetStore(state => state.dataset);
  const { coordinator, status } = useSync();
  if (tracker.kind !== "shared" || !dataset) return null;

  const pending = syncState(dataset).outbox.length;
  const label = status === "syncing" || status === "disabled" ? i18n.t($ => $.ui.syncTrackerSyncing)
    : status === "offline" ? i18n.t($ => $.ui.syncTrackerOffline)
    : status === "auth_required" ? i18n.t($ => $.ui.syncTrackerAuthRequired)
    : status === "different_login" ? i18n.t($ => $.ui.syncTrackerDifferentLogin)
    : status === "conflicts" ? i18n.t($ => $.ui.syncTrackerConflicts)
    : status === "rejected" ? i18n.t($ => $.ui.syncTrackerRejected)
    : status === "error" ? i18n.t($ => $.ui.syncTrackerError)
    : i18n.t($ => $.ui.syncTrackerUpToDate);
  const needsRetry = ["offline", "error", "rejected", "conflicts"].includes(status);
  return <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 6, padding: 12 }}>
    <Text style={{ color: colors.text, fontWeight: "600" }}>{i18n.t($ => $.ui.syncTrackerCloudSyncRequired)}</Text>
    <Text accessibilityRole={status === "error" || status === "rejected" ? "alert" : "text"} style={{ color: colors.muted }}>{label}</Text>
    {pending > 0 ? <Text style={{ color: colors.muted }}>{i18n.t($ => $.ui.syncTrackerPendingChanges, { count: pending })}</Text> : null}
    {needsRetry ? <Pressable accessibilityRole="button" disabled={!coordinator} onPress={() => void coordinator?.run(true)} style={{ alignSelf: "flex-start", borderColor: colors.border, borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 }}><Text style={{ color: colors.text }}>{i18n.t($ => $.ui.syncTrackerRetry)}</Text></Pressable> : null}
  </View>;
}
