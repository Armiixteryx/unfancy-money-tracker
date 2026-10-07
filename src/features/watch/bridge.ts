import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import { z } from "zod";

export type WatchRecordingStatus = "pending" | "processing" | "failed" | "completed";
export type WatchRecording = {
  requestId: string;
  accountId: string;
  recordedAt: string;
  mimeType: string;
  durationMs: number;
  status: WatchRecordingStatus;
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
  errorCode: z.string().optional(),
}).strict();
const audioSchema = z.object({
  audio: z.string().min(4).max(1_398_104).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  mimeType: z.enum(["audio/mp4", "audio/m4a", "audio/webm", "audio/webm;codecs=opus", "audio/ogg", "audio/ogg;codecs=opus"]),
  durationMs: z.number().int().min(250).max(16000),
}).strict();
type WatchAudioBridgeNative = {
  list(): Promise<WatchRecording[]>;
  getPending(): Promise<WatchRecording[]>;
  markProcessing(requestId: string): Promise<boolean>;
  readAudio(requestId: string): Promise<WatchAudio>;
  markSucceeded(requestId: string, transactionId: string): Promise<void>;
  markFailed(requestId: string, code: string): Promise<void>;
  delete(requestId: string): Promise<void>;
  play(requestId: string): Promise<void>;
  pause(requestId: string): Promise<void>;
  setAccount(accountId: string | null): Promise<void>;
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
  markProcessing: (id: string) => native?.markProcessing(id) ?? Promise.resolve(false),
  readAudio: async (id: string) => native ? audioSchema.parse(await native.readAudio(id)) : Promise.reject(new Error("watch_unavailable")),
  markSucceeded: (id: string, transactionId: string) => native?.markSucceeded(id, transactionId) ?? Promise.resolve(),
  markFailed: (id: string, code: string) => native?.markFailed(id, code) ?? Promise.resolve(),
  delete: (id: string) => native?.delete(id) ?? Promise.resolve(),
  play: (id: string) => native?.play(id) ?? Promise.resolve(),
  pause: (id: string) => native?.pause(id) ?? Promise.resolve(),
  setAccount: (id: string | null) => native?.setAccount(id) ?? Promise.resolve(),
  failPendingForCurrentBinding: async (code: string) => {
    if (!native) return;
    if (native.failPendingForCurrentBinding) return native.failPendingForCurrentBinding(code);
    for (const item of await watchAudioBridge.getPending()) await watchAudioBridge.markFailed(item.requestId, code);
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
