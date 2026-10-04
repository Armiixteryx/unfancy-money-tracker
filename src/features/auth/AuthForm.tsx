import { SensitiveContent } from "../../platform/analytics/SensitiveContent";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { authClient } from "../../platform/auth/client";
import { useAppTheme } from "../../ui/theme";
type Mode = "login" | "register" | "confirm" | "recover" | "reset";
export function AuthForm({ onComplete, onCancel }: { onComplete: () => Promise<void>; onCancel?: () => void }) {
  const { i18n } = useTranslation();
  const es = i18n.resolvedLanguage === "es";
  const label = (en: string, spanish: string) => es ? spanish : en;
  const { colors } = useAppTheme();
  const [mode, setMode] = useState<Mode>("login");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRequired = ["login", "register", "reset"].includes(mode);
  const codeRequired = ["confirm", "reset"].includes(mode);
  const invalid = label("Check this field.", "Revisa este campo.");
  const password = mode === "login" ? z.string().min(1, invalid) : z.string().min(12, invalid).regex(/[A-Z]/, invalid).regex(/[a-z]/, invalid).regex(/[0-9]/, invalid).regex(/[^A-Za-z0-9\s]/, invalid);
  const schema = z.object({ email: z.email(invalid), password: passwordRequired ? password : z.string(), code: codeRequired ? z.string().regex(/^\d{6}$/, invalid) : z.string() });
  const { control, handleSubmit, formState: { errors }, resetField, getValues } = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", code: "" } });
  const change = (next: Mode) => { setMode(next); setError(null); setNotice(null); resetField("password"); resetField("code"); };
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
      await action();
    } catch { setError(label("Unable to complete this request. Check your connection and details, then try again.", "No se pudo completar la solicitud. Revisa tu conexión y los datos e inténtalo de nuevo.")); }
    finally { setBusy(false); }
  };
  const titles = { login: label("Sign in", "Iniciar sesión"), register: label("Create account", "Crear cuenta"), confirm: label("Confirm email", "Confirmar correo"), recover: label("Recover password", "Recuperar contraseña"), reset: label("Reset password", "Restablecer contraseña") };
  const button = (text: string, action: () => void) => <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={action} style={{ minHeight: 48, justifyContent: "center", padding: 12 }}><Text style={{ color: colors.primary, fontWeight: "700" }}>{text}</Text></Pressable>;
  return <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: colors.canvas }}><SensitiveContent><View style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}>{titles[mode]}</Text>
    <Text style={{ color: colors.muted }}>{label("Login is optional. Your records stay on this device. Sign in to use voice entry.", "La sesión es opcional. Tus registros permanecen en este dispositivo. Inicia sesión para usar la voz.")}</Text>
    {(["email", ...(passwordRequired ? ["password"] : []), ...(codeRequired ? ["code"] : [])] as ("email" | "password" | "code")[]).map(name => {
      const text = name === "email" ? label("Email", "Correo electrónico") : name === "password" ? label("Password", "Contraseña") : label("Confirmation code", "Código de confirmación");
      return <View key={name} style={{ gap: 4 }}><Text style={{ color: colors.text }}>{text}</Text><Controller control={control} name={name} render={({ field }) => <TextInput ref={field.ref} autoFocus={name === "email"} accessibilityLabel={text} accessibilityHint={errors[name]?.message} editable={!busy} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} secureTextEntry={name === "password"} autoCapitalize="none" autoCorrect={false} keyboardType={name === "email" ? "email-address" : name === "code" ? "number-pad" : "default"} style={{ color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 48 }} />} />{errors[name] ? <Text accessibilityRole="alert" style={{ color: colors.negative }}>{errors[name]?.message}</Text> : null}</View>;
    })}
    {mode === "register" || mode === "reset" ? <Text style={{ color: colors.muted }}>{label("Use 12+ characters, uppercase, lowercase, a number and a symbol.", "Usa 12 o más caracteres, mayúscula, minúscula, número y símbolo.")}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: colors.negative }}>{error}</Text> : null}
    {button(busy ? label("Please wait…", "Espera…") : titles[mode], handleSubmit(values => run(async () => {
      if (mode === "login") { const result = await authClient.login(values.email, values.password); if (result === "confirm") change("confirm"); else await onComplete(); }
      if (mode === "register") { await authClient.register(values.email, values.password); change("confirm"); setNotice(label("Check your email for a confirmation code.", "Revisa tu correo para encontrar el código de confirmación.")); }
      if (mode === "confirm") { await authClient.confirm(values.email, values.code); change("login"); setNotice(label("Email confirmed. Sign in to continue.", "Correo confirmado. Inicia sesión para continuar.")); }
      if (mode === "recover") { await authClient.recover(values.email); change("reset"); setNotice(label("If a code can be sent, check your email.", "Si se puede enviar un código, revisa tu correo.")); }
      if (mode === "reset") { await authClient.reset(values.email, values.code, values.password); change("login"); setNotice(label("Password updated. Sign in to continue.", "Contraseña actualizada. Inicia sesión para continuar.")); }
    })))}
    {mode === "login" ? <>{button(titles.register, () => change("register"))}{button(titles.recover, () => change("recover"))}</> : button(titles.login, () => change("login"))}
    {mode === "confirm" ? button(label("Resend code", "Reenviar código"), () => void run(async () => { await authClient.resend(getValues("email")); setNotice(label("If a code can be sent, check your email.", "Si se puede enviar un código, revisa tu correo.")); })) : null}
    {button(onCancel ? label("Cancel", "Cancelar") : label("Skip login", "Omitir inicio de sesión"), () => onCancel ? onCancel() : void run(onComplete))}
  </View></SensitiveContent></ScrollView>;
}
