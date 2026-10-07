import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, Share, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { AppText as Text } from "../../ui/AppText";
import { SensitiveContent } from "../../platform/analytics/SensitiveContent";
import { useAppTheme } from "../../ui/theme";
import { useAuth } from "../auth/AuthProvider";
import { selectTracker, removeInaccessibleTracker, trackerRegistryStore, updateTrackerSummary, useActiveTrackerSummary, useTrackerRegistry } from "./store";
import { useTrackers } from "./TrackerProvider";
import type { InvitationResult, TrackerMember, TrackerSummary } from "../../server/contracts/trackers";

export function TrackerManagement() {
  const { i18n } = useTranslation();
  const es = i18n.resolvedLanguage === "es";
  const { colors } = useAppTheme();
  const auth = useAuth();
  const { client, createShared, refresh } = useTrackers();
  const summary = useActiveTrackerSummary();
  const inaccessible = useTrackerRegistry(state => state.inaccessible);
  const [name, setName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [createNotice, setCreateNotice] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<TrackerMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [invitation, setInvitation] = useState<InvitationResult | null>(null);
  const [confirmAction, setConfirmAction] = useState<"archive" | "restore" | "leave" | null>(null);
  const [deleteCopy, setDeleteCopy] = useState<string | null>(null);
  const [removeMember, setRemoveMember] = useState<TrackerMember | null>(null);
  const requestGeneration = useRef(0);
  const admin = summary.kind === "personal" || summary.role === "admin";
  const shared = summary.kind === "shared";
  const scope = useMemo(() => ({ datasetId: summary.datasetId, membershipId: summary.membershipId! }), [summary.datasetId, summary.membershipId]);
  const activeKey = `${summary.datasetId}:${summary.membershipId}`;
  const isCurrentScope = (generation: number, subject: string | null, key: string) =>
    generation === requestGeneration.current && subject === auth.subject &&
    subject === trackerRegistryStore.getState().principal?.subject &&
    key === `${trackerRegistryStore.getState().activeSummary?.datasetId}:${trackerRegistryStore.getState().activeSummary?.membershipId}`;
  const buttonStyle = { borderColor: colors.border, borderRadius: 10, borderWidth: 1, justifyContent: "center" as const, minHeight: 44, paddingHorizontal: 12 };
  const textStyle = { color: colors.text };
  const title = es ? "Conjuntos compartidos" : "Shared trackers";

  const loadMembers = useCallback(async () => {
    const generation = requestGeneration.current;
    const subject = auth.subject;
    const key = `${summary.datasetId}:${summary.membershipId}`;
    if (!shared || !admin || !subject) { setMembers([]); return; }
    try {
      const result = await client.members(scope);
      if (generation === requestGeneration.current && subject === auth.subject && subject === trackerRegistryStore.getState().principal?.subject && key === `${trackerRegistryStore.getState().activeSummary?.datasetId}:${trackerRegistryStore.getState().activeSummary?.membershipId}`) setMembers(result);
    }
    catch (cause) {
      if (generation === requestGeneration.current && subject === auth.subject && subject === trackerRegistryStore.getState().principal?.subject && key === `${trackerRegistryStore.getState().activeSummary?.datasetId}:${trackerRegistryStore.getState().activeSummary?.membershipId}`) setError(cause instanceof Error ? cause.message : "tracker_members_failed");
    }
  }, [admin, auth.subject, client, scope, shared, summary.datasetId, summary.membershipId]);
  useEffect(() => {
    requestGeneration.current += 1;
    setMembers([]); setInvitation(null); setInviteEmail(""); setRenameName(""); setInviteRole("member"); setRemoveMember(null); setDeleteCopy(null); setError(null); setName(""); setCreateNotice(false); setConfirmAction(null); setCreating(false);
    void loadMembers();
    return () => { requestGeneration.current += 1; };
  }, [loadMembers, summary.datasetId, summary.membershipId, auth.subject]);

  const run = async <T,>(operation: () => Promise<T>, onSuccess?: (result: T) => void | Promise<void>) => {
    const generation = requestGeneration.current;
    const subject = auth.subject;
    const key = activeKey;
    setError(null);
    try {
      const result = await operation();
      if (!isCurrentScope(generation, subject, key)) return;
      await onSuccess?.(result);
      if (!isCurrentScope(generation, subject, key)) return;
      await refresh();
      if (isCurrentScope(generation, subject, key)) await loadMembers();
    }
    catch (cause) { if (isCurrentScope(generation, subject, key)) setError(cause instanceof Error ? cause.message : "tracker_operation_failed"); }
  };

  const doCreate = async () => {
    if (!name.trim()) return;
    const generation = requestGeneration.current;
    const subject = auth.subject;
    const key = activeKey;
    setCreating(true);
    try { await createShared(name); if (isCurrentScope(generation, subject, key)) { setName(""); setCreateNotice(false); setError(null); } }
    catch (cause) { if (isCurrentScope(generation, subject, key)) setError(cause instanceof Error ? cause.message : "tracker_create_failed"); }
    finally { if (isCurrentScope(generation, subject, key)) setCreating(false); }
  };

  const doRemove = async () => {
    if (!removeMember) return;
    const member = removeMember;
    setRemoveMember(null);
    await run(async () => { await client.removeMember({ ...scope, targetMembershipId: member.membershipId }); });
  };

  const restoreOrArchive = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    const subject = auth.subject;
    setConfirmAction(null);
    await run(async () => {
      if (action === "leave") {
        await client.leave(scope);
        return undefined;
      } else {
        return action === "archive" ? client.archive(scope) : client.restore(scope);
      }
    }, async updated => {
      if (action === "leave") {
        await refresh().catch(() => undefined);
        const current = trackerRegistryStore.getState();
        if (subject && current.principal?.subject === subject && current.activeSummary?.datasetId === scope.datasetId && current.activeSummary.membershipId === scope.membershipId) {
          await selectTracker(current.registry?.personalDatasetId ?? "", null);
        }
      } else if (updated) await updateTrackerSummary(updated as TrackerSummary);
    });
  };

  return <SensitiveContent>
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 12, padding: 16 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>{title}</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.negative }}>{error.replaceAll("_", " ")}</Text> : null}
      <Text style={{ color: colors.muted }}>{es ? "Cada conjunto compartido se sincroniza con la nube. Los miembros pueden ver todos los datos y registrar ingresos y gastos. Solo los administradores gestionan el conjunto completo." : "Each shared tracker syncs to the cloud. Members can view all data and add income or expenses. Only admins manage the full tracker."}</Text>
      {!auth.identity ? <Text style={{ color: colors.muted }}>{es ? "Inicia sesión para crear o unirte a un conjunto compartido." : "Sign in to create or join a shared tracker."}</Text> : <>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput accessibilityLabel={es ? "Nombre del conjunto" : "Tracker name"} maxLength={80} onChangeText={setName} placeholder={es ? "Nombre del conjunto" : "Tracker name"} placeholderTextColor={colors.placeholder} style={{ borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, flex: 1, minHeight: 46, paddingHorizontal: 12 }} value={name} />
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: creating || !name.trim() }} disabled={creating || !name.trim()} onPress={() => setCreateNotice(true)} style={[buttonStyle, { opacity: creating || !name.trim() ? 0.5 : 1 }]}><Text style={textStyle}>{es ? "Crear" : "Create"}</Text></Pressable>
        </View>
        {shared ? <>
          {admin ? <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}><TextInput accessibilityLabel={es ? "Cambiar nombre" : "Rename tracker"} maxLength={80} onChangeText={setRenameName} placeholder={summary.name} placeholderTextColor={colors.placeholder} style={{ borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, flex: 1, minHeight: 46, paddingHorizontal: 12 }} value={renameName} /><Pressable accessibilityRole="button" disabled={!renameName.trim()} onPress={() => void run(() => client.rename({ ...scope, name: renameName.trim() }), async updated => { await updateTrackerSummary(updated); setRenameName(""); })} style={buttonStyle}><Text style={textStyle}>{es ? "Guardar" : "Save"}</Text></Pressable></View>
            <TextInput accessibilityLabel={es ? "Correo para invitar" : "Email to invite"} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={320} onChangeText={setInviteEmail} placeholder={es ? "Correo para invitar" : "Email to invite"} placeholderTextColor={colors.placeholder} style={{ borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, minHeight: 46, paddingHorizontal: 12 }} value={inviteEmail} />
            <View style={{ flexDirection: "row", gap: 8 }}><Pressable accessibilityRole="radio" accessibilityState={{ checked: inviteRole === "member" }} onPress={() => setInviteRole("member")} style={buttonStyle}><Text style={textStyle}>{es ? "Miembro" : "Member"}</Text></Pressable><Pressable accessibilityRole="radio" accessibilityState={{ checked: inviteRole === "admin" }} onPress={() => setInviteRole("admin")} style={buttonStyle}><Text style={textStyle}>{es ? "Admin" : "Admin"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ disabled: !inviteEmail.trim() }} disabled={!inviteEmail.trim()} onPress={() => void run(() => client.invite({ ...scope, email: inviteEmail.trim(), role: inviteRole }), created => setInvitation(created))} style={buttonStyle}><Text style={textStyle}>{es ? "Invitar" : "Invite"}</Text></Pressable></View>
            {invitation ? <View style={{ gap: 8 }}><Text selectable style={{ color: colors.muted }}>{invitation.url}</Text><Text style={{ color: colors.muted }}>{es ? `Vence: ${invitation.expiresAt}` : `Expires: ${invitation.expiresAt}`}</Text><View style={{ flexDirection: "row", gap: 8 }}><Pressable accessibilityRole="button" onPress={() => void Share.share({ message: invitation.url })} style={buttonStyle}><Text style={textStyle}>{es ? "Compartir invitación" : "Share invitation"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void run(() => client.revokeInvitation({ ...scope, invitationId: invitation.invitationId }), () => setInvitation(null))} style={buttonStyle}><Text style={{ color: colors.negative }}>{es ? "Revocar" : "Revoke"}</Text></Pressable></View></View> : null}
          </View> : null}
          {members.map(member => <View key={member.membershipId} style={{ alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 10 }}>
            <View style={{ flex: 1, minWidth: 160 }}><Text style={textStyle}>{member.email}</Text><Text style={{ color: colors.muted }}>{member.role}</Text></View>
            {admin && member.subject !== auth.subject ? <>
              <Pressable accessibilityRole="button" onPress={() => void run(() => client.setRole({ ...scope, targetMembershipId: member.membershipId, role: member.role === "admin" ? "member" : "admin" }))} style={buttonStyle}><Text style={textStyle}>{member.role === "admin" ? (es ? "Quitar admin" : "Make member") : (es ? "Hacer admin" : "Make admin")}</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setRemoveMember(member)} style={buttonStyle}><Text style={{ color: colors.negative }}>{es ? "Quitar" : "Remove"}</Text></Pressable>
            </> : null}
          </View>)}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {admin ? <Pressable accessibilityRole="button" onPress={() => setConfirmAction(summary.archived ? "restore" : "archive")} style={buttonStyle}><Text style={textStyle}>{summary.archived ? (es ? "Restaurar conjunto" : "Restore tracker") : (es ? "Archivar conjunto" : "Archive tracker")}</Text></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={() => setConfirmAction("leave")} style={buttonStyle}><Text style={{ color: colors.negative }}>{es ? "Salir del conjunto" : "Leave tracker"}</Text></Pressable>
          </View>
        </> : null}
      </>}
      {inaccessible.map(copy => <View key={`${copy.datasetId}:${copy.membershipId}`} style={{ borderColor: colors.negative, borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 }}>
        <Text style={{ color: colors.text }}>{es ? `El acceso a “${copy.name}” terminó. Sus cambios pendientes están bloqueados en este dispositivo.` : `Access to “${copy.name}” ended. Its pending work is locked on this device.`}</Text>
        <Pressable accessibilityRole="button" onPress={() => setDeleteCopy(`${copy.datasetId}:${copy.membershipId}`)} style={buttonStyle}><Text style={{ color: colors.negative }}>{es ? "Eliminar copia local" : "Delete local copy"}</Text></Pressable>
      </View>)}
    </View>

    <Modal transparent visible={createNotice} onRequestClose={() => setCreateNotice(false)} animationType="fade"><View style={{ alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "center", padding: 24 }}><View style={{ backgroundColor: colors.surface, borderRadius: 16, gap: 14, maxWidth: 440, padding: 20, width: "100%" }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 19, fontWeight: "600" }}>{es ? "Crear conjunto compartido" : "Create a shared tracker"}</Text><Text style={{ color: colors.text }}>{es ? "Las transacciones, categorías, presupuestos y monedas se sincronizarán con la nube y estarán disponibles para los miembros. Idioma, tema, consentimiento y avisos siguen siendo locales." : "Transactions, categories, budgets, and currencies will sync to the cloud and be visible to tracker members. Language, theme, consent, and notices stay on this device."}</Text><View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}><Pressable accessibilityRole="button" onPress={() => setCreateNotice(false)} style={buttonStyle}><Text style={textStyle}>{es ? "Cancelar" : "Cancel"}</Text></Pressable><Pressable accessibilityRole="button" disabled={creating} onPress={() => void doCreate()} style={[buttonStyle, { backgroundColor: colors.accent }]}><Text style={{ color: colors.onPrimary }}>{es ? "Crear y sincronizar" : "Create and sync"}</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={confirmAction !== null} onRequestClose={() => setConfirmAction(null)} animationType="fade"><View style={{ alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "center", padding: 24 }}><View style={{ backgroundColor: colors.surface, borderRadius: 16, gap: 14, maxWidth: 440, padding: 20, width: "100%" }}><Text style={{ color: colors.text }}>{confirmAction === "leave" ? (es ? "Al salir, el conjunto y sus cambios pendientes desaparecerán de la lista. La copia pendiente quedará bloqueada hasta que confirmes su eliminación." : "Leaving removes this tracker from your list. Pending work becomes inaccessible until you confirm deleting its local copy.") : confirmAction === "archive" ? (es ? "Archivar detiene los cambios hasta que un administrador lo restaure." : "Archiving stops changes until an admin restores the tracker.") : (es ? "Restaurar vuelve a habilitar los cambios." : "Restoring makes the tracker writable again.")}</Text><View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}><Pressable accessibilityRole="button" onPress={() => setConfirmAction(null)} style={buttonStyle}><Text style={textStyle}>{es ? "Cancelar" : "Cancel"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void restoreOrArchive()} style={buttonStyle}><Text style={textStyle}>{es ? "Confirmar" : "Confirm"}</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={deleteCopy !== null} onRequestClose={() => setDeleteCopy(null)} animationType="fade"><View style={{ alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "center", padding: 24 }}><View style={{ backgroundColor: colors.surface, borderRadius: 16, gap: 14, maxWidth: 440, padding: 20, width: "100%" }}><Text style={{ color: colors.text }}>{es ? "Eliminar esta copia local borra también los cambios sin sincronizar y no se puede deshacer." : "Deleting this local copy also deletes its unsynced changes and cannot be undone."}</Text><View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}><Pressable accessibilityRole="button" onPress={() => setDeleteCopy(null)} style={buttonStyle}><Text style={textStyle}>{es ? "Cancelar" : "Cancel"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { const [datasetId, membershipId] = deleteCopy!.split(":"); const generation = requestGeneration.current; const subject = auth.subject; const key = activeKey; void removeInaccessibleTracker(datasetId!, membershipId!).then(ok => { if (!isCurrentScope(generation, subject, key)) return; setDeleteCopy(null); if (!ok) setError("tracker_local_delete_failed"); }); }} style={buttonStyle}><Text style={{ color: colors.negative }}>{es ? "Eliminar" : "Delete"}</Text></Pressable></View></View></View></Modal>
    <Modal transparent visible={removeMember !== null} onRequestClose={() => setRemoveMember(null)} animationType="fade"><View style={{ alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "center", padding: 24 }}><View style={{ backgroundColor: colors.surface, borderRadius: 16, gap: 14, maxWidth: 440, padding: 20, width: "100%" }}><Text style={{ color: colors.text }}>{es ? `Quitar a ${removeMember?.email} revoca su acceso. Su copia local y cambios pendientes quedarán bloqueados hasta que confirme su eliminación.` : `Removing ${removeMember?.email} revokes access. Their local copy and pending changes become inaccessible until they confirm deletion.`}</Text><View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}><Pressable accessibilityRole="button" onPress={() => setRemoveMember(null)} style={buttonStyle}><Text style={textStyle}>{es ? "Cancelar" : "Cancel"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void doRemove()} style={buttonStyle}><Text style={{ color: colors.negative }}>{es ? "Quitar miembro" : "Remove member"}</Text></Pressable></View></View></View></Modal>
  </SensitiveContent>;
}
