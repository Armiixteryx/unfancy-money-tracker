import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppScreen } from "../src/ui/AppScreen";
import { AppText as Text } from "../src/ui/AppText";
import { SensitiveContent } from "../src/platform/analytics/SensitiveContent";
import { useAppTheme } from "../src/ui/theme";
import { useAuth } from "../src/features/auth/AuthProvider";
import { useTrackers } from "../src/features/trackers/TrackerProvider";
import type { InvitationPreview } from "../src/server/contracts/trackers";
import { TrackerClientError } from "../src/server/contracts/trackers";
import { clearInvitationToken, holdInvitationToken, invitationTokenFromLink, peekInvitationToken } from "../src/features/trackers/invitationHandoff";

export default function JoinTrackerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const auth = useAuth();
  const { client, acceptShared } = useTrackers();
  const { i18n } = useTranslation();
  const { colors } = useAppTheme();
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const es = (i18n.resolvedLanguage ?? i18n.language).toLowerCase().startsWith("es");

  useEffect(() => {
    let alive = true;
    const capture = async (url: string | null) => {
      const captured = url ? invitationTokenFromLink(url) : null;
      if (captured && alive) { holdInvitationToken(captured); setToken(captured); }
      if (Platform.OS === "web" && typeof window !== "undefined" && (window.location.hash || new URLSearchParams(window.location.search).has("token"))) {
        const cleanSearch = new URLSearchParams(window.location.search);
        cleanSearch.delete("token");
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${cleanSearch.size ? `?${cleanSearch}` : ""}`);
      }
    };
    const handoff = peekInvitationToken();
    if (handoff) setToken(handoff);
    void Linking.getInitialURL().then(url => capture(url));
    const subscription = Linking.addEventListener("url", event => { void capture(event.url); });
    if (typeof window !== "undefined" && window.location.hash) void capture(window.location.href);
    const queryToken = typeof params.token === "string" ? params.token : null;
    if (queryToken) {
      if (typeof window !== "undefined") {
        const cleanSearch = new URLSearchParams(window.location.search);
        cleanSearch.delete("token");
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${cleanSearch.size ? `?${cleanSearch}` : ""}`);
      }
      setError("invitation_invalid");
    }
    return () => { alive = false; subscription.remove(); };
  }, [params.token, router]);

  useEffect(() => {
    if (!token || !auth.subject) return;
    let alive = true;
    setPreview(null); setError(null);
    void client.previewInvitation(token).then(value => { if (alive) setPreview(value); }).catch(cause => { if (alive) setError(cause instanceof TrackerClientError ? cause.code : "invitation_preview_failed"); });
    return () => { alive = false; };
  }, [auth.subject, client, token]);

  const accept = async () => {
    if (!token) return;
    setBusy(true); setError(null);
    try { await acceptShared(token); clearInvitationToken(token); setToken(null); router.replace("/(tabs)"); }
    catch (cause) { setError(cause instanceof TrackerClientError ? cause.code : cause instanceof Error ? cause.message : "invitation_accept_failed"); }
    finally { setBusy(false); }
  };

  const message = (english: string, spanish: string) => es ? spanish : english;
  const actionStyle = { borderColor: colors.border, borderRadius: 999, borderWidth: 1, justifyContent: "center" as const, minHeight: 48, paddingHorizontal: 16 };
  return <AppScreen eyebrow={message("Shared tracker invitation", "Invitación a un conjunto compartido")} title={message("Join tracker", "Unirse al conjunto")}>
    <SensitiveContent>
      <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 14, padding: 20 }}>
        {!token ? <Text style={{ color: colors.text }}>{message("Open the invitation link again to continue. The secure token stays only in this page while you decide.", "Abre el enlace de invitación otra vez para continuar. El token seguro solo permanece en esta página mientras decides.")}</Text> : !auth.identity ? <>
          <Text style={{ color: colors.text }}>{message("Sign in to preview and accept this invitation. Keep this page open; the invitation token is held only in memory.", "Inicia sesión para revisar y aceptar esta invitación. Mantén esta página abierta; el token solo se guarda en memoria.")}</Text>
          <Pressable accessibilityRole="button" onPress={auth.open} style={actionStyle}><Text style={{ color: colors.text }}>{message("Sign in", "Iniciar sesión")}</Text></Pressable>
        </> : !preview ? <ActivityIndicator accessibilityLabel={message("Loading invitation", "Cargando invitación")} color={colors.positive} /> : <>
          <Text style={{ color: colors.text }}>{message(`You were invited to “${preview.name}” as ${preview.role}.`, `Te invitaron a “${preview.name}” como ${preview.role === "admin" ? "administrador" : "miembro"}.`)}</Text>
          <Text style={{ color: colors.text }}>{message("Joining syncs this tracker’s transactions, categories, budgets, and currency settings to the cloud. Members can view all records; admins manage the tracker. Your personal tracker and device settings remain separate.", "Al unirte, las transacciones, categorías, presupuestos y monedas de este conjunto se sincronizan con la nube. Los miembros pueden ver todos los registros; los administradores gestionan el conjunto. Tu conjunto personal y preferencias del dispositivo permanecen separados.")}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void accept()} style={[actionStyle, { backgroundColor: colors.accent }]}><Text style={{ color: colors.onPrimary }}>{busy ? message("Joining…", "Uniéndose…") : message("Accept and sync", "Aceptar y sincronizar")}</Text></Pressable>
        </>}
        {error ? <Text accessibilityRole="alert" style={{ color: colors.negative }}>{error.replaceAll("_", " ")}</Text> : null}
      </View>
    </SensitiveContent>
  </AppScreen>;
}
