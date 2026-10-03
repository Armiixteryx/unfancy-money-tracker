import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecorder } from "./recording.native";
const state = vi.hoisted(() => ({
  prepare: vi.fn(),
  stop: vi.fn(),
  record: vi.fn(),
  release: vi.fn(),
  deleteFile: vi.fn(),
  mode: vi.fn(),
  isRecording: false,
  uri: "synthetic.m4a",
  exists: true,
  size: 12,
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-audio", () => ({
  AudioModule: {
    AudioRecorder: class {
      get isRecording() {
        return state.isRecording;
      }
      get uri() {
        return state.uri;
      }
      prepareToRecordAsync = state.prepare;
      record = state.record;
      stop = state.stop;
      release = state.release;
    },
    getRecordingPermissionsAsync: async () => ({ granted: true }),
    requestRecordingPermissionsAsync: async () => ({ granted: true }),
  },
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: ".m4a",
      android: { outputFormat: "mpeg4", audioEncoder: "aac" },
      ios: { outputFormat: "aac " },
    },
  },
  setAudioModeAsync: state.mode,
}));
vi.mock("expo-file-system", () => ({
  File: class {
    get exists() {
      return state.exists;
    }
    get size() {
      return state.size;
    }
    delete = state.deleteFile;
    base64 = () => Promise.resolve("AAAA");
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  state.isRecording = false;
  state.size = 12;
});
describe("native recording cleanup", () => {
  it("waits for preparation before releasing a canceled recorder and cleans up once", async () => {
    let finish: () => void = () => undefined;
    state.prepare.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const recorder = createRecorder();
    const preparing = recorder.start();
    await Promise.resolve();
    await Promise.resolve();
    const disposal = recorder.dispose();
    finish();
    await preparing;
    await disposal;
    await recorder.dispose();
    expect(state.record).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.deleteFile).toHaveBeenCalledOnce();
  });
  it("selects AAC/M4A and rejects oversized recordings before reading", async () => {
    const recorder = createRecorder();
    await recorder.start();
    expect(state.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: ".m4a",
        android: { outputFormat: "mpeg4", audioEncoder: "aac" },
      }),
    );
    const recording = await recorder.stop();
    expect(recording.mimeType).toBe("audio/mp4");
    state.size = 1024 * 1024 + 1;
    await expect(recorder.read(recording)).rejects.toThrow("invalid_audio");
    await recorder.dispose();
  });
});
