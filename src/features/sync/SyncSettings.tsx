import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthProvider";
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";
import { useAppTheme } from "../../ui/theme";
import { SensitiveContent } from "../../platform/analytics/SensitiveContent";
import { categoryLabel } from "../../localization/i18n";
import {
  transactionSchema,
  budgetSchema,
  categorySchema,
} from "../../domain/recordSchemas";
import { syncedPreferencesSchema } from "../../server/contracts/sync";
import {
  formatMoney,
  formatCalendarDate,
  formatTimestamp,
} from "../../localization/region";
import {
  type BootstrapResponse,
  SyncClientError,
  type SyncConflict,
} from "../../server/contracts/sync";
import { syncState } from "./state";
import { useSync } from "./SyncProvider";

export function SyncSettings() {
  const { i18n } = useTranslation();
  const es = i18n.resolvedLanguage === "es";
  const { coordinator, status } = useSync();
  const auth = useAuth();
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const saveStatus = useLocalDatasetStore((state) => state.saveStatus);
  const { colors } = useAppTheme();
  const [cloud, setCloud] = useState<BootstrapResponse | null>(null);
  const [notice, setNotice] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SyncConflict | null>(null);
  if (!dataset || !coordinator) return null;
  const state = syncState(dataset);
  const text = (en: string, spanish: string) => (es ? spanish : en);
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (value) {
      setError(
        value instanceof SyncClientError &&
          value.code === "local_reset_required"
          ? text(
              "These development records use the previous identity format. Confirm a local reset before uploading or merging. Existing records are kept until you confirm.",
              "Estos registros de desarrollo usan el formato anterior. Confirma un reinicio local antes de enviar o combinar. Se conservan hasta que confirmes.",
            )
          : value instanceof SyncClientError && value.code === "different_login"
            ? text(
                "This device is bound to another login. Confirm a local reset below before connecting this login. Cloud records stay intact.",
                "Este dispositivo está vinculado a otra cuenta. Confirma un reinicio local antes de conectar esta cuenta. Los registros en la nube se conservan.",
              )
            : text(
                "Sync could not complete. Your local records and pending changes remain. Retry when connected and signed in.",
                "No se pudo sincronizar. Tus registros locales y cambios pendientes se conservan. Reintenta con conexión y sesión iniciada.",
              ),
      );
    } finally {
      setBusy(false);
    }
  };
  const button = (
    label: string,
    action: () => void,
    disabled = busy || saveStatus !== "idle",
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={action}
      style={{
        minHeight: 44,
        justifyContent: "center",
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        marginTop: 8,
      }}
    >
      <Text style={{ color: colors.text }}>{label}</Text>
    </Pressable>
  );
  const labels = {
    disabled: text("Sync is off", "Sincronización desactivada"),
    idle: text("Up to date", "Actualizado"),
    syncing: text("Syncing…", "Sincronizando…"),
    offline: text(
      "Offline — changes stay on this device",
      "Sin conexión — los cambios se conservan aquí",
    ),
    error: text("Sync needs a retry", "Reintenta la sincronización"),
    auth_required: text(
      "Sign in to resume sync",
      "Inicia sesión para reanudar",
    ),
    conflicts: text(
      "Choose which changes to keep",
      "Elige qué cambios conservar",
    ),
    different_login: text(
      "Local reset required for this login",
      "Esta cuenta requiere un reinicio local",
    ),
  };
  const enable = (mode: "upload" | "merge" | "replace") =>
    void perform(async () => {
      if (!cloud) return;
      await coordinator.enable(mode, cloud);
      setCloud(null);
      setNotice(false);
      setReplace(false);
    });
  return (
    <SensitiveContent>
      <View
        style={{
          backgroundColor: colors.surface,
          padding: 20,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
          {text("Cloud sync", "Sincronización en la nube")}
        </Text>
        <Text
          accessibilityRole="text"
          style={{ color: colors.muted, marginTop: 8 }}
        >
          {labels[status]}
        </Text>
        <Text style={{ color: colors.muted }}>
          {text(
            `${state.outbox.length} pending changes`,
            `${state.outbox.length} cambios pendientes`,
          )}
        </Text>
        {state.lastSyncedAt ? (
          <Text style={{ color: colors.muted }}>
            {text("Last sync: ", "Última sincronización: ")}
            {formatTimestamp(state.lastSyncedAt)}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={{ color: colors.text }}>
            {error}
          </Text>
        ) : null}
        {!auth.identity
          ? button(text("Sign in", "Iniciar sesión"), auth.open)
          : state.enabled
            ? button(
                text("Sync now / Retry", "Sincronizar / Reintentar"),
                () => void perform(() => coordinator.run(true)),
              )
            : button(text("Enable sync", "Activar sincronización"), () => {
                setNotice(true);
                setError(null);
              })}
        {state.enabled
          ? button(
              text("Turn off sync", "Desactivar sincronización"),
              () =>
                void perform(async () => {
                  coordinator.cancel();
                  await useLocalDatasetStore
                    .getState()
                    .updateFromSync((current) => ({
                      ...current,
                      sync: { ...syncState(current), enabled: false },
                    }));
                  await coordinator.run();
                }),
            )
          : null}
        {notice ? (
          <View>
            <Text style={{ color: colors.text, marginTop: 12 }}>
              {text(
                "Enabling sync uploads your transactions, categories, budgets, and currency choices to your personal cloud dataset. Language, theme, analytics consent, and notice settings stay on this device.",
                "Activar la sincronización envía tus transacciones, categorías, presupuestos y monedas a tu conjunto personal en la nube. El idioma, tema, consentimiento de analítica y avisos se conservan aquí.",
              )}
            </Text>
            {!cloud ? (
              button(
                text("Continue", "Continuar"),
                () =>
                  void perform(async () => {
                    const result = await coordinator.inspect();
                    setCloud(result);
                    if (result.empty || state.binding) {
                      await coordinator.enable("upload", result);
                      setCloud(null);
                      setNotice(false);
                    }
                  }),
              )
            ) : (
              <>
                <Text style={{ color: colors.text }}>
                  {text(
                    "Cloud records already exist. Merge keeps distinct records; competing monthly budgets need your choice.",
                    "Ya hay registros en la nube. Combinar conserva los registros distintos; debes elegir entre presupuestos del mismo mes y categoría.",
                  )}
                </Text>
                {button(text("Merge", "Combinar"), () => enable("merge"))}
                {button(
                  text("Replace local data…", "Reemplazar datos locales…"),
                  () => setReplace(true),
                )}
              </>
            )}
            {button(
              text("Cancel", "Cancelar"),
              () => {
                setNotice(false);
                setCloud(null);
                setReplace(false);
              },
              busy,
            )}
          </View>
        ) : null}
        {replace ? (
          <View>
            <Text accessibilityRole="alert" style={{ color: colors.text }}>
              {text(
                "Replace all local records? Local records and pending edits will be discarded after the cloud download is validated. Cloud records remain intact.",
                "¿Reemplazar todos los registros locales? Los registros locales y cambios pendientes se descartarán después de validar la descarga. Los registros en la nube se conservan.",
              )}
            </Text>
            {button(text("Confirm replacement", "Confirmar reemplazo"), () =>
              enable("replace"),
            )}
            {button(text("Cancel", "Cancelar"), () => setReplace(false), busy)}
          </View>
        ) : null}
        {state.conflicts.map((conflict) => (
          <View key={`${conflict.recordType}:${conflict.recordId}`}>
            {button(
              text(
                `Review ${conflict.recordType} conflict`,
                `Revisar conflicto: ${conflict.recordType}`,
              ),
              () => setSelected(conflict),
            )}
          </View>
        ))}
        <Modal
          visible={!!selected}
          transparent
          animationType="fade"
          onRequestClose={() => setSelected(null)}
        >
          <SensitiveContent style={{ flex: 1 }}>
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                padding: 24,
                backgroundColor: "#00000066",
              }}
            >
              <View
                accessibilityViewIsModal
                style={{
                  backgroundColor: colors.surface,
                  padding: 20,
                  borderRadius: 16,
                  maxHeight: "85%",
                }}
              >
                <ScrollView keyboardShouldPersistTaps="handled">
                  {selected ? (
                    <>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 18,
                          fontWeight: "700",
                        }}
                      >
                        {text("Resolve conflict", "Resolver conflicto")}
                      </Text>
                      {selected.categoryDeletionId ? (
                        <Text style={{ color: colors.text }}>
                          {text(
                            "Deleting this category moves its budget to Uncategorized, where another budget already exists for that month. Choose one limit; the other is removed before category deletion completes.",
                            "Eliminar esta categoría mueve su presupuesto a Sin categoría, donde ya existe otro para ese mes. Elige un límite; el otro se elimina antes de completar la eliminación de la categoría.",
                          )}
                        </Text>
                      ) : null}
                      <Text style={{ color: colors.muted }}>
                        {text("Device edit: ", "Edición del dispositivo: ")}
                        {formatTimestamp(selected.localEditedAt)}
                      </Text>
                      <Text style={{ color: colors.muted }}>
                        {text("Cloud edit: ", "Edición de la nube: ")}
                        {selected.cloudEditedAt
                          ? formatTimestamp(selected.cloudEditedAt)
                          : "—"}
                      </Text>
                      <Text style={{ color: colors.muted }}>
                        {text("Server commit: ", "Confirmación del servidor: ")}
                        {selected.cloudCommittedAt
                          ? formatTimestamp(selected.cloudCommittedAt)
                          : "—"}
                      </Text>
                      <Text selectable style={{ color: colors.text }}>
                        {text("Local: ", "Local: ")}
                        {selected.localDeleted
                          ? text("Deleted", "Eliminado")
                          : versionSummary(
                              selected.recordType,
                              selected.localPayload,
                            )}
                      </Text>
                      <Text selectable style={{ color: colors.text }}>
                        {text("Cloud: ", "Nube: ")}
                        {selected.cloudDeleted
                          ? text("Deleted", "Eliminado")
                          : versionSummary(
                              selected.recordType,
                              selected.cloudPayload,
                            )}
                      </Text>
                      {button(
                        text("Keep local version", "Conservar versión local"),
                        () =>
                          void perform(async () => {
                            await coordinator.resolve(selected, "keep_local");
                            setSelected(null);
                          }),
                      )}
                      {button(
                        text(
                          "Keep cloud version",
                          "Conservar versión en la nube",
                        ),
                        () =>
                          void perform(async () => {
                            await coordinator.resolve(selected, "keep_cloud");
                            setSelected(null);
                          }),
                      )}
                    </>
                  ) : null}
                  {button(
                    text("Close", "Cerrar"),
                    () => setSelected(null),
                    busy,
                  )}
                </ScrollView>
              </View>
            </View>
          </SensitiveContent>
        </Modal>
      </View>
    </SensitiveContent>
  );
}

function versionSummary(
  type: SyncConflict["recordType"],
  payload: unknown,
): string {
  if (type === "transaction") {
    const record = transactionSchema.safeParse(payload);
    if (record.success)
      return `${record.data.description} · ${formatMoney(record.data)} · ${formatCalendarDate(record.data.date)}`;
  } else if (type === "budget") {
    const record = budgetSchema.safeParse(payload);
    if (record.success)
      return `${record.data.month} · ${formatMoney(record.data)}`;
  } else if (type === "category") {
    const record = categorySchema.safeParse(payload);
    if (record.success) return categoryLabel(record.data);
  } else {
    const record = syncedPreferencesSchema.safeParse(payload);
    if (record.success)
      return `${record.data.baseCurrency} · ${record.data.selectedCurrencies.join(", ")}`;
  }
  return "—";
}
