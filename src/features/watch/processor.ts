import { authClient, getAuthenticatedAccountId } from "../../platform/auth/client";
import { AuthenticationRequiredError } from "../../platform/auth/errors";
import { findUncategorizedCategory } from "../../domain/categories";
import { categoryLabel } from "../../localization/i18n";
import { voiceCategoryChoices } from "../voice/categoryChoices";
import { requestVoiceExpense, VoiceAuthenticationError, VoiceClientError } from "../voice/api";
import { voiceRequestSchema } from "../../contracts/voice";
import { addVoiceTransactionDurably, getPersonalVoiceTarget, getVoiceTarget } from "../trackers/store";
import { watchAudioBridge, watchRecordingTarget, type WatchRecording } from "./bridge";

const inFlight = new Map<string, Promise<void>>();
function localDate(value: string): string {
  const date = new Date(value);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
function sameTarget(item: WatchRecording, target: { datasetId: string; generation: number; membershipId: string | null }) {
  return item.trackerId === target.datasetId && item.generation === target.generation && (item.membershipId ?? null) === target.membershipId;
}

async function bindLegacyPersonalRecording(item: WatchRecording, accountId: string): Promise<WatchRecording | null> {
  if (item.trackerId && item.generation !== undefined) return item;
  const personal = await getPersonalVoiceTarget(accountId);
  if (!personal || !personal.writable || personal.kind !== "personal") return null;
  await watchAudioBridge.bindLegacyPersonalTarget(item.requestId, accountId, {
    datasetId: personal.datasetId,
    generation: personal.generation,
  });
  const rows = [...await watchAudioBridge.getPending(), ...await watchAudioBridge.list()];
  return rows.find(candidate => candidate.requestId === item.requestId && sameTarget(candidate, personal)) ?? null;
}

async function terminalFailure(item: WatchRecording, code: string) {
  const context = watchRecordingTarget(item);
  if (context) await watchAudioBridge.markFailed(item.requestId, code, context).catch(() => undefined);
}

export async function processWatchQueue(accountId: string, isCurrent: () => boolean = () => true) {
  if (!watchAudioBridge.available || !isCurrent()) return;
  await watchAudioBridge.setAccount(accountId);
  const stillCurrent = () => isCurrent();
  const pending = await watchAudioBridge.getPending();
  const listed = await watchAudioBridge.list();
  const byId = new Map([...listed, ...pending].map(item => [item.requestId, item]));
  const pendingIds = new Set(pending.map(item => item.requestId));
  for (const original of byId.values()) {
    if (!stillCurrent()) return;
    if (original.accountId !== accountId) continue;
    const active = inFlight.get(original.requestId);
    // A headless caller must retain its native task lifetime while the foreground owner finishes.
    if (active) { await active; continue; }
    if (original.status === "completed") continue;
    const item = await bindLegacyPersonalRecording(original, accountId);
    if (!item) continue;
    const targetContext = watchRecordingTarget(item);
    if (!targetContext) continue;
    const target = await getVoiceTarget(targetContext.trackerId).catch(() => null);
    if (!target || !target.writable || !sameTarget(item, target)) {
      await terminalFailure(item, "tracker_membership_changed");
      continue;
    }
    const durableRecord = target.dataset.transactions.find(transaction => transaction.id === item.requestId);
    if (durableRecord) {
      await watchAudioBridge.markSucceeded(item.requestId, durableRecord.id, targetContext).catch(() => undefined);
      continue;
    }
    if (item.status === "processing") {
      await terminalFailure(item, "processing_interrupted");
      continue;
    }
    if (!pendingIds.has(original.requestId)) continue;
    const processing = (async () => {
      try {
        if (item.requestId[14] !== "7") { await terminalFailure(item, "invalid_recording_id"); return; }
        if (await getAuthenticatedAccountId() !== accountId) { await terminalFailure(item, "account_changed"); return; }
        if (!(await watchAudioBridge.markProcessing(item.requestId, targetContext))) return;
        const audio = await watchAudioBridge.readAudio(item.requestId);
        if (!stillCurrent()) { await terminalFailure(item, "processing_interrupted"); return; }
        const latestBeforeRequest = await getVoiceTarget(targetContext.trackerId).catch(() => null);
        if (!latestBeforeRequest || !latestBeforeRequest.writable || !sameTarget(item, latestBeforeRequest)) {
          await terminalFailure(item, "tracker_membership_changed"); return;
        }
        const request = voiceRequestSchema.parse({
          requestId: item.requestId,
          ...(latestBeforeRequest.kind === "shared" && item.membershipId
            ? { tracker: { datasetId: item.trackerId, membershipId: item.membershipId } }
            : {}),
          audio: audio.audio,
          mimeType: audio.mimeType,
          durationMs: audio.durationMs,
          localDate: item.localDate ?? localDate(item.recordedAt),
          categories: voiceCategoryChoices(latestBeforeRequest.dataset.categories, categoryLabel),
        });
        if (latestBeforeRequest.kind === "shared" && !item.membershipId) { await terminalFailure(item, "tracker_membership_changed"); return; }
        // Amplify refreshes expired tokens; a valid cached session avoids unnecessary background network work.
        const accessToken = await authClient.accessToken({ forceRefresh: false });
        if (!stillCurrent() || await getAuthenticatedAccountId() !== accountId) { await terminalFailure(item, "account_changed"); return; }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        let response;
        try {
          response = await requestVoiceExpense(request, controller.signal, accessToken);
        } finally { clearTimeout(timeout); }
        if (!stillCurrent() || await getAuthenticatedAccountId() !== accountId) { await terminalFailure(item, "account_changed"); return; }
        const latest = await getVoiceTarget(targetContext.trackerId).catch(() => null);
        if (!latest || !latest.writable || !sameTarget(item, latest)) { await terminalFailure(item, "tracker_membership_changed"); return; }
        const category = latest.dataset.categories.find(candidate => candidate.id === response.transaction.categoryId && candidate.kind === "expense" && !candidate.isArchived);
        const input = { ...response.transaction, categoryId: category?.id ?? findUncategorizedCategory(latest.dataset.categories, "expense").id };
        const result = await addVoiceTransactionDurably(item.trackerId!, input, item.requestId, targetContext.generation, targetContext.membershipId);
        if (!stillCurrent() || await getAuthenticatedAccountId() !== accountId) { await terminalFailure(item, "account_changed"); return; }
        if (result.ok) await watchAudioBridge.markSucceeded(item.requestId, item.requestId, targetContext).catch(() => undefined);
        else await terminalFailure(item, result.recordId ? "local_save_failed" : "transaction_rejected");
      } catch (error) {
        const code = error instanceof VoiceAuthenticationError || error instanceof AuthenticationRequiredError
          ? "authentication_required"
          : error instanceof VoiceClientError && error.code === "voice_entry_is_busy_wait_a_moment_then_record_again_or_enter_manually"
            ? "voice_busy"
            : "processing_failed";
        await terminalFailure(item, code);
      }
    })();
    inFlight.set(item.requestId, processing);
    try { await processing; } finally {
      if (inFlight.get(item.requestId) === processing) inFlight.delete(item.requestId);
    }
  }
}
