import { AppText as Text } from "../../ui/AppText";
import { useTranslation } from "react-i18next";
import { invalidateAuthentication } from "../../platform/auth/lifecycle";
import { detectIntroduction } from "../../platform/auth/introduction";
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { authClient, getAuthenticatedIdentity } from "../../platform/auth/client";
import { createPersistenceAdapter } from "../../platform/persistence";
import { AuthForm } from "./AuthForm";
const introduction = createPersistenceAdapter("introduction");
const dataset = createPersistenceAdapter("anonymous");
const Context = createContext({ identity: null as string | null, subject: null as string | null, epoch: 0, busy: false, open: () => {}, signOut: async () => {} });
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }: PropsWithChildren) {
  const { i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const signingOut = useRef(false);
  const [ready, setReady] = useState(false);
  const [introduced, setIntroduced] = useState(false);
  const [identity, setIdentity] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const initialize = async () => {
    setFailed(false);
    try {
      const existing = await detectIntroduction(introduction, dataset);
      setIntroduced(existing);
      const [restored, authenticated] = await Promise.all([authClient.restore(), getAuthenticatedIdentity()]);
      setIdentity(restored ?? authenticated?.email ?? null);
      setSubject(authenticated?.subject ?? null);
      setReady(true);
    } catch { setFailed(true); }
  };
  useEffect(() => { void initialize(); }, []);
  const complete = async () => {
    await introduction.writeSnapshot("completed");
    invalidateAuthentication();
    const [restored, authenticated] = await Promise.all([authClient.restore(), getAuthenticatedIdentity()]);
    setIdentity(restored ?? authenticated?.email ?? null);
    setSubject(authenticated?.subject ?? null);
    setIntroduced(true);
    setVisible(false);
    setEpoch(value => value + 1);
  };
  if (!ready) return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>{failed ? <Pressable accessibilityRole="button" onPress={() => void initialize()}><Text>{i18n.resolvedLanguage === "es" ? "No se pudo abrir el almacenamiento local. Reintentar." : "Local storage could not be opened. Retry."}</Text></Pressable> : <ActivityIndicator />}</View>;
  return <Context.Provider value={{ identity, subject, epoch, busy, open: () => { if (!signingOut.current) setVisible(true); }, signOut: async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    setBusy(true);
    invalidateAuthentication();
    setIdentity(null); setSubject(null); setEpoch(value => value + 1);
    try { await authClient.signOut(); } finally { signingOut.current = false; setBusy(false); }
  } }}>
    {introduced ? children : <AuthForm onComplete={complete} />}
    {visible ? <Modal visible={visible} onRequestClose={() => setVisible(false)} animationType="slide"><AuthForm onComplete={complete} onCancel={() => setVisible(false)} /></Modal> : null}
  </Context.Provider>;
}
