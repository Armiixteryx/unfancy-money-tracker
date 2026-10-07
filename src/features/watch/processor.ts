import { authClient, getAuthenticatedAccountId } from "../../platform/auth/client";
import { AuthenticationRequiredError } from "../../platform/auth/errors";
import { findUncategorizedCategory } from "../../domain/categories";
import { categoryLabel } from "../../localization/i18n";
import { voiceCategoryChoices } from "../voice/categoryChoices";
import { requestVoiceExpense, VoiceAuthenticationError } from "../voice/api";
import { voiceRequestSchema } from "../../contracts/voice";
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";
import { watchAudioBridge } from "./bridge";

const inFlight = new Map<string, Promise<void>>();
function localDate(value: string): string {
  const date = new Date(value);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

export async function processWatchQueue(accountId: string, isCurrent: () => boolean = () => true) {
  if (!watchAudioBridge.available || !isCurrent()) return;
  await watchAudioBridge.setAccount(accountId);
  const initial = useLocalDatasetStore.getState();
  if (!initial.dataset || initial.hydration.status !== "ready") return;
  const datasetEpoch = initial.datasetEpoch;
  const stillCurrent = () => isCurrent() && useLocalDatasetStore.getState().datasetEpoch === datasetEpoch;
  const pending = await watchAudioBridge.getPending();
  const listed = await watchAudioBridge.list();
  const byId = new Map([...listed, ...pending].map(item => [item.requestId, item]));
  const pendingIds = new Set(pending.map(item => item.requestId));
  for (const item of byId.values()) {
    if (!stillCurrent()) return;
    if (item.accountId !== accountId) continue;
    const active = inFlight.get(item.requestId);
    // A headless caller must retain its native task lifetime while the foreground owner finishes.
    if (active) { await active; continue; }
    const durableRecord = useLocalDatasetStore.getState().dataset?.transactions.find(transaction => transaction.id === item.requestId);
    if (durableRecord && item.status !== "completed") {
      if (useLocalDatasetStore.getState().saveStatus === "idle") await watchAudioBridge.markSucceeded(item.requestId, durableRecord.id).catch(() => undefined);
      continue;
    }
    if (item.status === "processing") {
      await watchAudioBridge.markFailed(item.requestId, "processing_interrupted").catch(() => undefined);
      continue;
    }
    if (!pendingIds.has(item.requestId)) continue;
    const processing = (async () => {
      try {
        if (item.requestId[14] !== "7") { await watchAudioBridge.markFailed(item.requestId, "invalid_recording_id"); return; }
        if (!(await watchAudioBridge.markProcessing(item.requestId))) return;
        const audio = await watchAudioBridge.readAudio(item.requestId);
        if (!stillCurrent()) { await watchAudioBridge.markFailed(item.requestId, "processing_interrupted"); return; }
        const currentDataset = useLocalDatasetStore.getState().dataset;
        if (!currentDataset) throw new Error("local_data_unavailable");
        const request = voiceRequestSchema.parse({
          requestId: item.requestId,
          audio: audio.audio,
          mimeType: audio.mimeType,
          durationMs: audio.durationMs,
          localDate: localDate(item.recordedAt),
          categories: voiceCategoryChoices(currentDataset.categories, categoryLabel),
        });
        if (await getAuthenticatedAccountId() !== accountId) { await watchAudioBridge.markFailed(item.requestId, "account_changed"); return; }
        // Amplify refreshes expired tokens; a valid cached session avoids unnecessary background network work.
        const accessToken = await authClient.accessToken({ forceRefresh: false });
        if (!stillCurrent()) { await watchAudioBridge.markFailed(item.requestId, "processing_interrupted"); return; }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        let response;
        try {
          response = await requestVoiceExpense(request, controller.signal, accessToken);
        } finally { clearTimeout(timeout); }
        if (!stillCurrent()) { await watchAudioBridge.markFailed(item.requestId, "processing_interrupted"); return; }
        if (await getAuthenticatedAccountId() !== accountId) { await watchAudioBridge.markFailed(item.requestId, "account_changed"); return; }
        const latest = useLocalDatasetStore.getState().dataset;
        if (!latest) throw new Error("local_data_unavailable");
        const category = latest.categories.find((candidate) => candidate.id === response.transaction.categoryId && candidate.kind === "expense" && !candidate.isArchived);
        const input = { ...response.transaction, categoryId: category?.id ?? findUncategorizedCategory(latest.categories, "expense").id };
        const result = await useLocalDatasetStore.getState().addTransactionDurably(input, item.requestId);
        if (!stillCurrent()) { await watchAudioBridge.markFailed(item.requestId, "processing_interrupted"); return; }
        if (await getAuthenticatedAccountId() !== accountId) { await watchAudioBridge.markFailed(item.requestId, "account_changed"); return; }
        if (result.ok) await watchAudioBridge.markSucceeded(item.requestId, item.requestId).catch(() => undefined);
        else await watchAudioBridge.markFailed(item.requestId, useLocalDatasetStore.getState().saveStatus === "error" ? "local_save_failed" : "transaction_rejected");
      } catch (error) {
        await watchAudioBridge.markFailed(item.requestId, error instanceof VoiceAuthenticationError || error instanceof AuthenticationRequiredError ? "authentication_required" : "processing_failed").catch(() => undefined);
      }
    })();
    inFlight.set(item.requestId, processing);
    try { await processing; } finally {
      if (inFlight.get(item.requestId) === processing) inFlight.delete(item.requestId);
    }
  }
}
