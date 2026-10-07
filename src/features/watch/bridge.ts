import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import { z } from "zod";
import { calendarDateSchema } from "../../domain/validation";

export type WatchRecordingStatus = "pending" | "processing" | "failed" | "completed";
export type WatchTargetOption = {
  datasetId: string;
  name: string;
  membershipId: string | null;
  generation: number;
  kind: "personal" | "shared";
};
export type WatchRecordingTarget = { trackerId: string; membershipId: string | null; generation: number };
export type WatchRecording = {
  requestId: string;
  accountId: string;
  recordedAt: string;
  mimeType: string;
  durationMs: number;
  status: WatchRecordingStatus;
  trackerId?: string;
  membershipId?: string | null;
  generation?: number;
  localDate?: string;
  protocolVersion?: 1 | 2;
  errorCode?: string;
};
export type WatchAudio = { audio: string; mimeType: string; durationMs: number };
export type WatchPlaybackEvent = { requestId: string; status: "paused" | "completed" };
const recordingSchema = z.object({
  requestId: z.string().uuid().refine(id => id[14] === "7"),
  accountId: z.string().min(1),
  recordedAt: z.string().datetime({ offset: true }),
  mimeType: z.string(),
  durationMs: z.number().int().min(250).max(16000),
  status: z.enum(["pending", "processing", "failed", "completed"]),
  trackerId: z.string().uuid().refine(id => id[14] === "7").optional(),
  membershipId: z.string().uuid().refine(id => id[14] === "7").nullable().optional(),
  generation: z.number().int().nonnegative().optional(),
  localDate: calendarDateSchema.optional(),
  protocolVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  errorCode: z.string().optional(),
}).strict().superRefine((value, context) => {
  if (value.protocolVersion === 2 && (!value.trackerId || value.generation === undefined)) {
    context.addIssue({ code: "custom", message: "V2 watch audio requires a tracker binding" });
  }
});
const audioSchema = z.object({
  audio: z.string().min(4).max(1_398_104).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  mimeType: z.enum(["audio/mp4", "audio/m4a", "audio/webm", "audio/webm;codecs=opus", "audio/ogg", "audio/ogg;codecs=opus"]),
  durationMs: z.number().int().min(250).max(16000),
}).strict();
type WatchAudioBridgeNative = {
  list(): Promise<WatchRecording[]>;
  getPending(): Promise<WatchRecording[]>;
  readAudio(requestId: string): Promise<WatchAudio>;
  markProcessing(requestId: string, trackerId: string | null, membershipId: string | null, generation: number | null): Promise<boolean>;
  markSucceeded(requestId: string, transactionId: string, trackerId: string | null, membershipId: string | null, generation: number | null): Promise<void>;
  markFailed(requestId: string, code: string, trackerId: string | null, membershipId: string | null, generation: number | null): Promise<void>;
  delete(requestId: string): Promise<void>;
  play(requestId: string): Promise<void>;
  pause(requestId: string): Promise<void>;
  setAccount(accountId: string | null): Promise<void>;
  setTargets(targetsJson: string): Promise<void>;
  bindLegacyPersonalTarget(requestId: string, accountId: string, datasetId: string, generation: number): Promise<void>;
  failPendingForCurrentBinding?(code: string): Promise<void>;
  addListener?(eventName: string): void;
  removeListeners?(count: number): void;
};

const native = Platform.OS === "web" ? undefined : NativeModules.WatchAudioBridge as WatchAudioBridgeNative | undefined;
const emitter = native && typeof native.addListener === "function" ? new NativeEventEmitter(native as never) : undefined;

export const watchAudioBridge = {
  available: Boolean(native),
  list: async () => native ? z.array(recordingSchema).parse(await native.list()) : [],
  getPending: async () => native ? z.array(recordingSchema).parse(await native.getPending()) : [],
  setTargets: (targets: readonly WatchTargetOption[]) => native?.setTargets(JSON.stringify(targets)) ?? Promise.resolve(),
  bindLegacyPersonalTarget: (id: string, accountId: string, target: Pick<WatchTargetOption, "datasetId" | "generation">) => native?.bindLegacyPersonalTarget(id, accountId, target.datasetId, target.generation) ?? Promise.resolve(),
  markProcessing: (id: string, target: WatchRecordingTarget) => native?.markProcessing(id, target.trackerId, target.membershipId, target.generation) ?? Promise.resolve(false),
  readAudio: async (id: string) => native ? audioSchema.parse(await native.readAudio(id)) : Promise.reject(new Error("watch_unavailable")),
  markSucceeded: (id: string, transactionId: string, target: WatchRecordingTarget) => native?.markSucceeded(id, transactionId, target.trackerId, target.membershipId, target.generation) ?? Promise.resolve(),
  markFailed: (id: string, code: string, target: WatchRecordingTarget) => native?.markFailed(id, code, target.trackerId, target.membershipId, target.generation) ?? Promise.resolve(),
  delete: (id: string) => native?.delete(id) ?? Promise.resolve(),
  play: (id: string) => native?.play(id) ?? Promise.resolve(),
  pause: (id: string) => native?.pause(id) ?? Promise.resolve(),
  setAccount: (id: string | null) => native?.setAccount(id) ?? Promise.resolve(),
  failPendingForCurrentBinding: async (code: string) => {
    if (!native) return;
    if (native.failPendingForCurrentBinding) return native.failPendingForCurrentBinding(code);
    for (const item of await watchAudioBridge.getPending()) {
      const target = watchRecordingTarget(item);
      if (target) await watchAudioBridge.markFailed(item.requestId, code, target);
    }
  },
  subscribe: (listener: () => void) => {
    const subscription = emitter?.addListener("WatchAudioQueueChanged", listener);
    return () => subscription?.remove();
  },
  subscribePlayback: (listener: (event: WatchPlaybackEvent) => void) => {
    const subscription = emitter?.addListener("WatchAudioPlaybackChanged", (value: unknown) => {
      const event = z.object({ requestId: recordingSchema.shape.requestId, status: z.enum(["paused", "completed"]) }).safeParse(value);
      if (event.success) listener(event.data);
    });
    return () => subscription?.remove();
  },
};

export function watchRecordingTarget(item: WatchRecording): WatchRecordingTarget | null {
  if (!item.trackerId || item.generation === undefined) return null;
  return { trackerId: item.trackerId, membershipId: item.membershipId ?? null, generation: item.generation };
}
