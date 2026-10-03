import { formatMoneyForDisplay } from "../../domain/money";
import { categoryLabel } from "../../localization/i18n";
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
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";
import { voiceErrorMessages, type VoiceRequest } from "../../contracts/voice";
import { requestVoiceExpense, VoiceClientError } from "./api";
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
  epoch: number;
  date: string;
  recorder: Recorder;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  released: boolean;
  deadline?: number;
};
export function localRecordingDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function VoiceProvider({ children }: PropsWithChildren) {
  useTranslation();
  const router = useRouter();
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const phaseRef = useRef<VoicePhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; message: string } | null>(
    null,
  );
  const session = useRef<Session | null>(null);
  const completed = useRef(new Set<string>());
  const mutation = useMutation({
    mutationFn: ({
      request,
      signal,
    }: {
      request: VoiceRequest;
      signal: AbortSignal;
    }) => requestVoiceExpense(request, signal),
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
    (value.deadline === undefined || Date.now() < value.deadline) &&
    useLocalDatasetStore.getState().datasetEpoch === value.epoch;
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
    const subscription = AppState.addEventListener("change", (state) => {
      if (
        state !== "active" &&
        ["permission", "starting", "recording"].includes(phaseRef.current)
      )
        cancelRef.current();
    });
    const unsubscribe = useLocalDatasetStore.subscribe((next, previous) => {
      if (next.datasetEpoch !== previous.datasetEpoch) cancelRef.current();
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
      subscription.remove();
      unsubscribe();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visibility);
      cancelRef.current();
    };
  }, []);
  const announceSaved = (id: string) => {
    const dataset = useLocalDatasetStore.getState().dataset;
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
      message: `${categoryLabel(category)} · ${record.description} · ${record.amount} ${record.currency}`,
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
      const dataset = useLocalDatasetStore.getState().dataset;
      if (!dataset) throw new VoiceClientError(i18n.t($ => $.ui.voiceLocalDataIsStillLoading));
      const request: VoiceRequest = {
        requestId: value.id,
        audio,
        mimeType: recording.mimeType,
        durationMs: recording.durationMs,
        localDate: value.date,
        categories: dataset.categories
          .filter((c) => c.kind === "expense" && !c.isArchived)
          .map(category => ({ id: category.id, name: categoryLabel(category), isFallback: category.isSystem && category.defaultCategoryKey === "uncategorized" })),
      };
      const response = await mutateRef.current({
        request,
        signal: value.controller.signal,
      });
      // The request has finished; never retain audio in mutation state.
      mutation.reset();
      if (!current(value) || completed.current.has(value.id)) return;
      clearTimeout(value.timer);
      value.deadline = undefined;
      const latest = useLocalDatasetStore.getState().dataset;
      if (!latest) return;
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
      const result = await useLocalDatasetStore
        .getState()
        .addTransaction(input, value.id);
      if (!current(value)) return;
      completed.current.add(value.id);
      if (result.ok) {
        session.current = null;
        transition("idle");
        announceSaved(result.value.id);
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
        setMessage(
          error instanceof VoiceClientError
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
    if (phaseRef.current !== "idle") return;
    const store = useLocalDatasetStore.getState();
    if (!store.dataset) return;
    setSaved(null);
    setMessage(null);
    transition("starting");
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
      epoch: store.datasetEpoch,
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
    const result = await useLocalDatasetStore.getState().retryLocalSave();
    if (!current(value)) return;
    if (result.ok) {
      session.current = null;
      transition("idle");
      announceSaved(value.id);
    } else transition("save_failed");
  };
  return (
    <VoiceContext.Provider value={{ phase, start, stop, cancel, message }}>
      {children}
      <VoiceFeedback
        phase={phase}
        message={message}
        saved={saved ? { ...saved, message: (() => {
          const record = useLocalDatasetStore.getState().dataset?.transactions.find(transaction => transaction.id === saved.id);
          return record ? `${categoryLabel(useLocalDatasetStore.getState().dataset?.categories.find(category => category.id === record.categoryId))} · ${record.description} · ${formatMoneyForDisplay(record)}` : saved.message;
        })() } : null}
        onDismissSaved={() => setSaved(null)}
        onDismissMessage={() => setMessage(null)}
        onEdit={(id) => {
          setSaved(null);
          router.push({ pathname: "/transactions", params: { edit: id } });
        }}
        onCancel={cancel}
        onStop={() => void stop()}
        onStart={() => void start()}
        onRetrySave={() => void retrySave()}
        onManual={() => {
          cancel();
          router.push({ pathname: "/transactions", params: { new: "1" } });
        }}
      />
    </VoiceContext.Provider>
  );
}
