import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { AuthActionResult, AuthState } from "../../../platform/auth/types";
import { AuthClientError } from "../../../platform/auth/types";
import type { SyncConflict } from "../../../platform/sync/types";
import { createRuntimeAuthClient, createRuntimeSyncClient, runtimeCloudMode } from "../../../platform/runtime";
import { syncLocalDataset } from "../services";
import { useDatasetStore } from "../store/useDatasetStore";
import { colors } from "../../../ui/theme";
import { useAnalytics } from "../../../providers/AnalyticsProvider";

type AuthMode = "sign_in" | "sign_up" | "confirm_sign_up" | "request_reset" | "confirm_reset";

export function AccountSyncCard() {
  const dataset = useDatasetStore((state) => state.dataset);
  const setSyncMetadata = useDatasetStore((state) => state.setSyncMetadata);
  const analytics = useAnalytics();
  const authClient = useMemo(() => createRuntimeAuthClient(), []);
  const syncClient = useMemo(() => createRuntimeSyncClient(async () => (await authClient.getSession()).session?.accessToken ?? null), [authClient]);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<readonly SyncConflict[]>([]);

  useEffect(() => {
    void authClient.getSession().then((session) => setAuthState(session.state));
  }, [authClient]);

  if (!dataset) return null;

  const runAuthAction = async (action: () => Promise<AuthActionResult>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    if (mode === "sign_in" || mode === "sign_up") void analytics.capture("sync_account_intent", { surface: "sync", actionResult: "started" });
    try {
      const result = await action();
      if (result.status === "confirmation_required") {
        setMode("confirm_sign_up");
        setMessage("Check your email for the confirmation code before cloud sync can begin.");
      } else if (result.status === "code_sent") {
        setMode("confirm_reset");
        setMessage("If the account is eligible, a password reset code was sent.");
      } else if (result.status === "signed_in") {
        setAuthState("signed_in");
        setMessage("Signed in. Your local dataset remains the source of truth while backup runs.");
        await startSync();
      } else {
        setMode("sign_in");
        setMessage("That step is complete. You can continue from the sign-in form.");
      }
    } catch (caught) {
      const authError = caught instanceof AuthClientError ? caught : new AuthClientError("provider_unavailable", "We could not complete that request. Try again later.");
      setAuthState(authError.code === "invalid_credentials" ? "invalid_credentials" : "error");
      setError(authError.message);
    } finally {
      setBusy(false);
    }
  };

  const startSync = async () => {
    setError(null);
    await setSyncMetadata({ status: "syncing", reason: null });
    try {
      const result = await syncLocalDataset(dataset, syncClient);
      setConflicts(result.push.conflicts);
      const hasRemoteChanges = result.pulledChangeCount > result.push.acknowledged.length;
      const status = result.push.conflicts.length > 0 || hasRemoteChanges ? "conflicted" : "synced";
      await setSyncMetadata({ status, inboxCursor: result.cursor, lastSyncedAt: new Date().toISOString(), reason: status === "conflicted" ? "Cloud changes need review before they can be applied." : null });
      setMessage(status === "synced" ? "Local dataset backed up successfully." : "Backup found changes that need review; local records were kept unchanged.");
      if (status === "synced") void analytics.capture("sync_account_completed", { surface: "sync", actionResult: "success", syncStatus: status });
    } catch (caught) {
      const syncError = caught instanceof Error ? caught : new Error("Sync is temporarily unavailable.");
      await setSyncMetadata({ status: "error", reason: syncError.message });
      setError(syncError.message);
    }
  };

  const resolve = async (conflict: SyncConflict, choice: "keep_local" | "keep_cloud") => {
    setBusy(true);
    setError(null);
    try {
      const response = await syncClient.resolveConflict({ datasetId: dataset.datasetId, conflict, choice });
      setConflicts((current) => current.filter((candidate) => candidate !== conflict));
      await setSyncMetadata({ status: response.conflicts.length > 0 ? "conflicted" : "synced", reason: response.conflicts.length > 0 ? "More cloud changes need review." : null, lastSyncedAt: new Date().toISOString() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The conflict could not be resolved.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await authClient.signOut();
      setAuthState("signed_out");
      setConflicts([]);
      setMessage("Signed out. Your local anonymous dataset is still available on this device.");
      await setSyncMetadata({ status: "idle", reason: null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not sign out.");
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.card}>
    <View style={styles.header}><View><Text style={styles.title}>Backup and sync</Text><Text style={styles.description}>Cloud sync is optional and begins only after email confirmation.</Text></View><Text style={styles.mode}>{runtimeCloudMode() === "configured" ? "CLOUD CONFIGURED" : "LOCAL PREVIEW"}</Text></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}
    {authState === "signed_in" || authState === "offline_session" ? <>
      <View style={styles.session}><View style={[styles.dot, dataset.sync.status === "error" ? styles.dotBad : styles.dotGood]} /><View style={styles.sessionCopy}><Text style={styles.sessionTitle}>{authState === "offline_session" ? "Offline session" : "Account connected"}</Text><Text style={styles.helper}>{dataset.sync.status === "synced" ? "The latest local snapshot is backed up." : dataset.sync.status === "syncing" ? "Backing up the local snapshot…" : dataset.sync.status === "conflicted" ? "Review is required before cloud changes can be applied." : "Your local records remain available offline."}</Text></View></View>
      <View style={styles.actions}><Pressable accessibilityRole="button" disabled={busy} onPress={() => void startSync()} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Working…" : "Sync now"}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.secondary}><Text style={styles.secondaryText}>Sign out</Text></Pressable></View>
      {conflicts.length > 0 ? <View style={styles.conflictBox}><Text style={styles.conflictTitle}>{conflicts.length} cloud change{conflicts.length === 1 ? "" : "s"} need a choice</Text>{conflicts.map((conflict) => <View key={`${conflict.recordType}:${conflict.recordId}`} style={styles.conflictRow}><Text style={styles.helper}>A {conflict.recordType} changed in two places. Choose which version to keep.</Text><View style={styles.actions}><Pressable accessibilityRole="button" disabled={busy} onPress={() => void resolve(conflict, "keep_local")} style={styles.secondary}><Text style={styles.secondaryText}>Keep local</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => void resolve(conflict, "keep_cloud")} style={styles.secondary}><Text style={styles.secondaryText}>Keep cloud</Text></Pressable></View></View>)}</View> : null}
    </> : <>
      {mode === "confirm_sign_up" ? <AuthField label="Confirmation code" value={code} onChangeText={setCode} placeholder="Enter the email code" /> : mode === "confirm_reset" ? <><AuthField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" /><AuthField label="Reset code" value={code} onChangeText={setCode} placeholder="Enter the email code" /><AuthField label="New password" value={newPassword} onChangeText={setNewPassword} placeholder="Use a strong password" secureTextEntry /></> : <><AuthField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" /><AuthField label="Password" value={password} onChangeText={setPassword} placeholder="Use a strong password" secureTextEntry />{mode === "sign_in" || mode === "sign_up" ? null : null}</>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void (mode === "sign_in" ? runAuthAction(() => authClient.signIn({ email, password })) : mode === "sign_up" ? runAuthAction(() => authClient.signUp({ email, password })) : mode === "confirm_sign_up" ? runAuthAction(() => authClient.confirmSignUp(email, code)) : mode === "request_reset" ? runAuthAction(() => authClient.requestPasswordReset(email)) : runAuthAction(() => authClient.confirmPasswordReset({ email, code, newPassword })))} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Working…" : mode === "sign_in" ? "Sign in" : mode === "sign_up" ? "Create account" : mode === "confirm_sign_up" ? "Confirm email" : mode === "request_reset" ? "Send reset code" : "Reset password"}</Text></Pressable>
      <View style={styles.linkRow}>{mode !== "confirm_sign_up" && mode !== "confirm_reset" ? <Pressable accessibilityRole="button" onPress={() => { setError(null); setMessage(null); setMode(mode === "sign_in" ? "sign_up" : "sign_in"); }}><Text style={styles.link}>{mode === "sign_in" ? "Create an account" : "Use sign in"}</Text></Pressable> : <Pressable accessibilityRole="button" onPress={() => { setError(null); setMode("sign_in"); }}><Text style={styles.link}>Back to sign in</Text></Pressable>}{mode === "sign_in" ? <Pressable accessibilityRole="button" onPress={() => { setError(null); setMessage(null); setMode("request_reset"); }}><Text style={styles.link}>Forgot password?</Text></Pressable> : null}</View>
    </>}
  </View>;
}

function AuthField({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: "email-address" }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" keyboardType={keyboardType} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#829AB1" secureTextEntry={secureTextEntry} style={styles.input} value={value} /></View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 14, padding: 20 },
  header: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  title: { color: colors.navy, fontSize: 18, fontWeight: "800" },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, maxWidth: 560 },
  mode: { color: colors.sky, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  error: { backgroundColor: "#FFF2F0", borderRadius: 10, color: colors.coral, fontSize: 14, padding: 12 },
  success: { backgroundColor: "#E9F7EF", borderRadius: 10, color: colors.emerald, fontSize: 14, padding: 12 },
  field: { gap: 7 },
  label: { color: colors.navy, fontSize: 12, fontWeight: "800" },
  input: { backgroundColor: "#F8FAFC", borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.navy, minHeight: 44, paddingHorizontal: 12 },
  primary: { alignItems: "center", backgroundColor: colors.navy, borderRadius: 11, justifyContent: "center", minHeight: 44, paddingHorizontal: 15 },
  primaryText: { color: colors.surface, fontSize: 13, fontWeight: "800" },
  secondary: { alignItems: "center", borderColor: colors.border, borderRadius: 11, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 15 },
  secondaryText: { color: colors.navy, fontSize: 13, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  link: { color: colors.sky, fontSize: 13, fontWeight: "800" },
  session: { alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 12, flexDirection: "row", gap: 10, padding: 13 },
  sessionCopy: { flex: 1, gap: 3 },
  sessionTitle: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  dot: { borderRadius: 999, height: 10, width: 10 },
  dotGood: { backgroundColor: colors.emerald },
  dotBad: { backgroundColor: colors.coral },
  conflictBox: { backgroundColor: "#FFF9F8", borderColor: "#F4C7C7", borderRadius: 12, borderWidth: 1, gap: 12, padding: 14 },
  conflictTitle: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  conflictRow: { borderTopColor: "#F4C7C7", borderTopWidth: 1, gap: 9, paddingTop: 12 }
});
