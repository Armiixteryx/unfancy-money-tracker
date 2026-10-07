import { AuthenticationRequiredError } from "../../platform/auth/errors";
import { subscribeAuthentication } from "../../platform/auth/lifecycle";
import { useAuth } from "../auth/AuthProvider";
import { authClient } from "../../platform/auth/client";
import { formatMoneyForDisplay } from "../../domain/money";
import { categoryLabel } from "../../localization/i18n";
import { voiceCategoryChoices } from "./categoryChoices";
import { i18n } from "../../localization/i18n";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { createUuid } from "../../platform/identifiers/createUuid";
import { findUncategorizedCategory } from "../../domain/categories";
import { addVoiceTransactionDurably, getVoiceTarget, useActiveTrackerSummary } from "../trackers/store";
import type { Dataset } from "../../domain/types";
import type { TransactionInput } from "../../domain/validation";
import { voiceErrorMessages, type VoiceRequest } from "../../contracts/voice";
import { requestVoiceExpense, VoiceAuthenticationError, VoiceClientError } from "./api";
import { createRecorder, type Recorder } from "./recording";
import { VoiceFeedback } from "./VoiceFeedback";

export type VoicePhase =
  | "idle"
  | "permission"
  | "starting"
  | "recording"
  | "processing"
  | "saving"
  | "save_failed";
type VoiceContextValue = {
  phase: VoicePhase;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => void;
  message: string | null;
};
const VoiceContext = createContext<VoiceContextValue | null>(null);
export const useVoice = () => {
  const value = useContext(VoiceContext);
  if (!value) throw new Error(i18n.t($ => $.ui.voiceVoiceProviderMissing));
  return value;
};
type Session = {
  id: string;
  trackerId: string;
  targetGeneration: number;
  membershipId: string | null;
  shared: boolean;
  targetName: string;
  saveInput?: TransactionInput;
  date: string;
  recorder: Recorder;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  released: boolean;
  deadline?: number;
};
class VoiceTargetUnavailableError extends Error {}
export function localRecordingDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function VoiceProvider({ children }: PropsWithChildren) {
  useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const activeTracker = useActiveTrackerSummary();
  useEffect(() => {
    if (["permission", "starting", "recording", "processing"].includes(phaseRef.current)) cancelRef.current();
  }, [auth.epoch]);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const phaseRef = useRef<VoicePhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; message: string; trackerId: string } | null>(
    null,
  );
  const session = useRef<Session | null>(null);
  const completed = useRef(new Set<string>());
  const mutation = useMutation({
    mutationFn: ({
      request,
      signal,
      accessToken,
    }: {
      request: VoiceRequest;
      signal: AbortSignal;
      accessToken: string;
    }) => requestVoiceExpense(request, signal, accessToken),
    retry: 0,
    gcTime: 0,
  });
  const mutateRef = useRef(mutation.mutateAsync);
  mutateRef.current = mutation.mutateAsync;
  const transition = (value: VoicePhase) => {
    phaseRef.current = value;
    setPhase(value);
  };
  const current = (value: Session) =>
    session.current === value &&
    !value.controller.signal.aborted &&
    (value.deadline === undefined || Date.now() < value.deadline);
  const resolveCurrentTarget = async (value: Session) => {
    const target = await getVoiceTarget(value.trackerId);
    if (!target || !target.writable || target.generation !== value.targetGeneration || target.membershipId !== value.membershipId) return null;
    return target;
  };
  const cleanup = async (value: Session) => {
    clearTimeout(value.timer);
    try {
      await value.recorder.dispose();
    } catch {
      /* Do not expose native errors or recording contents. */
    }
  };
  const cancel = () => {
    const value = session.current;
    session.current = null;
    if (value) {
      value.controller.abort();
      void cleanup(value);
    }
    transition("idle");
    setMessage(null);
    setSaved(null);
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const unsubscribeAuth = subscribeAuthentication(() => {
      if (["permission", "starting", "recording", "processing"].includes(phaseRef.current)) cancelRef.current();
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (
        state !== "active" &&
        ["permission", "starting", "recording"].includes(phaseRef.current)
      )
        cancelRef.current();
    });
    const visibility = () => {
      if (
        document.hidden &&
        ["permission", "starting", "recording"].includes(phaseRef.current)
      )
        cancelRef.current();
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", visibility);
    return () => {
      unsubscribeAuth();
      subscription.remove();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visibility);
      cancelRef.current();
    };
  }, []);
  const announceSaved = (id: string, dataset: Dataset, trackerId: string, targetName: string) => {
    const record = dataset?.transactions.find((t) => t.id === id);
    if (!record) {
      setMessage(i18n.t($ => $.ui.voiceThisTransactionIsNoLongerAvailable));
      return;
    }
    const category = dataset?.categories.find(
      (c) => c.id === record.categoryId,
    );
    setSaved({
      id,
      trackerId,
      message: `${targetName !== "Personal" ? `${targetName} · ` : ""}${categoryLabel(category)} · ${record.description} · ${formatMoneyForDisplay(record)}`,
    });
    setMessage(null);
  };
  const stop = async () => {
    const value = session.current;
    if (!value) return;
    value.released = true;
    if (phaseRef.current !== "recording") return;
    clearTimeout(value.timer);
    transition("processing");
    // Includes file reading, base64 encoding, upload, and provider processing.
    value.deadline = Date.now() + 30000;
    const expire = () => {
      if (session.current !== value) return;
      value.controller.abort();
      session.current = null;
      transition("idle");
      setMessage(voiceErrorMessages.timeout);
      void cleanup(value);
    };
    value.timer = setTimeout(expire, 30000);
    try {
      const recording = await value.recorder.stop();
      const audio = await value.recorder.read(recording);
      if (!current(value)) return;
      const target = await resolveCurrentTarget(value);
      if (!target) throw new VoiceTargetUnavailableError();
      if (value.shared && !value.membershipId) throw new VoiceTargetUnavailableError();
      const request: VoiceRequest = {
        requestId: value.id,
        audio,
        mimeType: recording.mimeType,
        durationMs: recording.durationMs,
        localDate: value.date,
        ...(value.shared && value.membershipId ? { tracker: { datasetId: value.trackerId, membershipId: value.membershipId } } : {}),
        categories: voiceCategoryChoices(target.dataset.categories, categoryLabel),
      };
      const accessToken = await authClient.accessToken();
      if (!current(value)) return;
      const response = await mutateRef.current({
        accessToken,
        request,
        signal: value.controller.signal,
      });
      // The request has finished; never retain audio in mutation state.
      mutation.reset();
      if (!current(value) || completed.current.has(value.id)) return;
      clearTimeout(value.timer);
      value.deadline = undefined;
      const latestTarget = await resolveCurrentTarget(value);
      if (!latestTarget) throw new VoiceTargetUnavailableError();
      const latest = latestTarget.dataset;
      const chosen = latest.categories.find(
        (c) =>
          c.id === response.transaction.categoryId &&
          c.kind === "expense" &&
          !c.isArchived,
      );
      const input = {
        ...response.transaction,
        categoryId:
          chosen?.id ??
          findUncategorizedCategory(latest.categories, "expense").id,
      };
      transition("saving");
      value.saveInput = input;
      const result = await addVoiceTransactionDurably(value.trackerId, input, value.id, value.targetGeneration, value.membershipId);
      if (!current(value)) return;
      completed.current.add(value.id);
      if (result.ok) {
        session.current = null;
        transition("idle");
        announceSaved(result.value.id, latest, value.trackerId, value.targetName);
      } else if (result.recordId) {
        transition("save_failed");
        setMessage(
          i18n.t($ => $.ui.voiceLocalSaveFailedRetrySaveToKeep),
        );
      } else {
        session.current = null;
        transition("idle");
        setMessage(result.message);
      }
    } catch (error) {
      mutation.reset();
      if (current(value)) {
        session.current = null;
        transition("idle");
        if ((error instanceof VoiceAuthenticationError || error instanceof AuthenticationRequiredError)) void auth.signOut().catch(() => {});
        setMessage(
          error instanceof VoiceTargetUnavailableError
            ? i18n.t($ => $.ui.voiceSelectedTrackerIsNoLongerAvailable)
            : (error instanceof VoiceAuthenticationError || error instanceof AuthenticationRequiredError) ? (i18n.resolvedLanguage === "es" ? "Inicia sesión para usar la voz." : "Sign in to use voice.") : error instanceof VoiceClientError
            ? error.code
            : voiceErrorMessages.unavailable,
        );
      }
    } finally {
      if (value.deadline !== undefined && Date.now() >= value.deadline)
        expire();
      await cleanup(value);
    }
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const start = async () => {
    if (!auth.identity) { auth.open(); return; }
    if (phaseRef.current !== "idle") return;
    const trackerId = activeTracker.datasetId;
    setSaved(null);
    setMessage(null);
    transition("starting");
    const target = await getVoiceTarget(trackerId).catch(() => null);
    // TypeScript keeps the pre-await idle narrowing here; React state may change
    // while getVoiceTarget hydrates the pinned tracker.
    if ((phaseRef.current as VoicePhase) !== "starting") return;
    if (!target || !target.writable) {
      transition("idle");
      setMessage(i18n.t($ => $.ui.voiceSelectedTrackerIsNoLongerAvailable));
      return;
    }
    let recorder: Recorder;
    try {
      recorder = createRecorder();
    } catch {
      transition("idle");
      setMessage(i18n.t($ => $.ui.voiceMicrophoneRecordingIsUnavailableEnterManually));
      return;
    }
    const value: Session = {
      id: createUuid(),
      trackerId,
      targetGeneration: target.generation,
      membershipId: target.membershipId,
      shared: target.kind === "shared",
      targetName: target.name,
      date: localRecordingDate(),
      recorder,
      controller: new AbortController(),
      released: false,
    };
    session.current = value;
    try {
      if (!(await value.recorder.hasPermission())) {
        if (!current(value)) return;
        transition("permission");
        const granted = await value.recorder.requestPermission();
        if (!current(value)) return;
        session.current = null;
        transition("idle");
        setMessage(
          granted
            ? i18n.t($ => $.ui.voiceMicrophoneReadyHoldAgainOrChooseStart)
            : i18n.t($ => $.ui.voiceMicrophonePermissionWasDeniedAllowItIn),
        );
        await cleanup(value);
        return;
      }
      if (!current(value)) return;
      await value.recorder.start();
      if (!current(value)) {
        await cleanup(value);
        return;
      }
      if (value.released) {
        session.current = null;
        transition("idle");
        await cleanup(value);
        return;
      }
      value.date = localRecordingDate();
      transition("recording");
      value.timer = setTimeout(() => void stopRef.current(), 15000);
    } catch {
      if (current(value)) {
        session.current = null;
        transition("idle");
        setMessage(
          i18n.t($ => $.ui.voiceMicrophoneRecordingIsUnavailableCheckPermissionAnd),
        );
      }
      await cleanup(value);
    }
  };
  const retrySave = async () => {
    const value = session.current;
    if (!value || phaseRef.current !== "save_failed" || !current(value)) return;
    transition("saving");
    const target = await resolveCurrentTarget(value);
    if (!target || !value.saveInput) {
      session.current = null;
      transition("idle");
      setMessage(i18n.t($ => $.ui.voiceSelectedTrackerIsNoLongerAvailable));
      return;
    }
    const result = await addVoiceTransactionDurably(value.trackerId, value.saveInput, value.id, value.targetGeneration, value.membershipId);
    if (!current(value)) return;
    if (result.ok) {
      session.current = null;
      transition("idle");
      announceSaved(value.id, target.dataset, value.trackerId, value.targetName);
    } else {
      transition("save_failed");
      setMessage(i18n.t($ => $.ui.voiceLocalSaveFailedRetrySaveToKeep));
    }
  };
  return (
    <VoiceContext.Provider value={{ phase, start, stop, cancel, message }}>
      {children}
      <VoiceFeedback
        phase={phase}
        message={message}
        saved={saved}
        onDismissSaved={() => setSaved(null)}
        onDismissMessage={() => setMessage(null)}
        onEdit={(id) => {
          const trackerId = saved?.trackerId;
          setSaved(null);
          router.push({ pathname: "/transactions", params: { edit: id, ...(trackerId ? { tracker: trackerId } : {}) } });
        }}
        onCancel={cancel}
        onStop={() => void stop()}
        onStart={() => void start()}
        onRetrySave={() => void retrySave()}
        onManual={() => {
          const trackerId = session.current?.trackerId;
          cancel();
          router.push({ pathname: "/transactions", params: { new: "1", ...(trackerId ? { tracker: trackerId } : {}) } });
        }}
      />
    </VoiceContext.Provider>
  );
}
