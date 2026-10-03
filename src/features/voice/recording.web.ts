import type { Recorder, Recording } from "./recording";
import { MAX_AUDIO_BYTES } from "../../contracts/voice";
let permissionGranted = false;
export function createRecorder(): Recorder {
  let stream: MediaStream | undefined,
    recorder: MediaRecorder | undefined,
    blob: Blob | undefined,
    url: string | undefined;
  let started = 0,
    disposed = false;
  let stopResult: Promise<Recording> | undefined;
  return {
    hasPermission: async () => {
      if (permissionGranted) return true;
      try {
        return (
          (
            await navigator.permissions.query({
              name: "microphone" as PermissionName,
            })
          ).state === "granted"
        );
      } catch {
        return false;
      }
    },
    requestPermission: async () => {
      try {
        const permissionStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        permissionStream.getTracks().forEach((t) => t.stop());
        permissionGranted = true;
        return true;
      } catch {
        return false;
      }
    },
    start: async () => {
      if (
        !globalThis.MediaRecorder ||
        !MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      )
        throw new Error("unsupported_format");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("canceled");
      }
      recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 64000,
      });
      const chunks: Blob[] = [];
      stopResult = new Promise<Recording>((resolve, reject) => {
        recorder!.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder!.onerror = () => reject(new Error("recording_failed"));
        recorder!.onstop = () => {
          blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
          url = URL.createObjectURL(blob);
          resolve({
            uri: url,
            mimeType: "audio/webm;codecs=opus",
            durationMs: Math.min(16000, Date.now() - started),
          });
        };
      });
      // Register a rejection handler even if cancellation happens before stop.
      void stopResult.catch(() => undefined);
      started = Date.now();
      recorder.start();
    },
    stop: async () => {
      if (!recorder || !stopResult) throw new Error("no_recording");
      if (recorder.state !== "inactive") recorder.stop();
      return stopResult;
    },
    read: async () => {
      if (!blob || !blob.size || blob.size > MAX_AUDIO_BYTES)
        throw new Error("invalid_audio");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    dispose: async () => {
      disposed = true;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
        await stopResult?.catch(() => undefined);
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (url) URL.revokeObjectURL(url);
      blob = undefined;
      stream = undefined;
      recorder = undefined;
      url = undefined;
    },
  };
}
