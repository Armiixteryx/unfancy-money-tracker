import { AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import { File } from "expo-file-system";
import type { Recorder } from "./recording";
import { MAX_AUDIO_BYTES } from "../../contracts/voice";

export function createRecorder(): Recorder {
  const options = {
    ...RecordingPresets.HIGH_QUALITY,
    bitRate: 64000,
    numberOfChannels: 1,
    sampleRate: 44100,
  };
  // Match Expo's native options normalization without importing SDK internals.
  // eslint-disable-next-line import/namespace
  const recorder = new AudioModule.AudioRecorder({
    ...options,
    ...(Platform.OS === "ios" ? options.ios : options.android),
  });
  let started = 0;
  let disposed = false;
  let preparing: Promise<void> | undefined;
  let disposal: Promise<void> | undefined;
  return {
    hasPermission: async () =>
      (await AudioModule.getRecordingPermissionsAsync()).granted,
    requestPermission: async () =>
      (await AudioModule.requestRecordingPermissionsAsync()).granted,
    start: async () => {
      preparing = (async () => {
        if (disposed) throw new Error("canceled");
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        if (disposed) return;
        await recorder.prepareToRecordAsync(options);
        if (disposed) return;
        started = Date.now();
        recorder.record();
      })();
      await preparing;
    },
    stop: async () => {
      await recorder.stop();
      if (!recorder.uri) throw new Error("no_recording");
      return {
        uri: recorder.uri,
        mimeType: "audio/mp4",
        durationMs: Math.min(16000, Date.now() - started),
      };
    },
    read: async (recording) => {
      const file = new File(recording.uri);
      if (!file.exists || !file.size || file.size > MAX_AUDIO_BYTES)
        throw new Error("invalid_audio");
      return file.base64();
    },
    dispose: () => {
      disposed = true;
      disposal ??= (async () => {
        await preparing?.catch(() => undefined);
        try {
          if (recorder.isRecording) await recorder.stop();
        } finally {
          try {
            if (recorder.uri) {
              const file = new File(recorder.uri);
              if (file.exists) file.delete();
            }
          } finally {
            recorder.release();
            await setAudioModeAsync({ allowsRecording: false });
          }
        }
      })();
      return disposal;
    },
  };
}
