export type Recording = {
  uri: string;
  mimeType: "audio/mp4" | "audio/webm;codecs=opus";
  durationMs: number;
};
export type Recorder = {
  hasPermission: () => Promise<boolean>;
  requestPermission: () => Promise<boolean>;
  start: () => Promise<void>;
  stop: () => Promise<Recording>;
  read: (recording: Recording) => Promise<string>;
  dispose: () => Promise<void>;
};
export { createRecorder } from "./recording.web";
