import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
import { createUuid } from "../../platform/identifiers/createUuid";
import type { WatchRecording } from "./bridge";
import type { Transaction } from "../../domain/types";
import type { TransactionInput } from "../../domain/validation";
import type { Dataset } from "../../domain/types";

type TestState = {
  dataset: Dataset;
  datasetEpoch: number;
  hydration: { status: "ready" };
  saveStatus: "idle" | "error";
  addTransactionDurably: (input: TransactionInput, id: string) => Promise<{ ok: true; value: Transaction } | { ok: false; message: string }>;
};

const mocks = vi.hoisted(() => ({
  state: null as TestState | null,
  account: "cognito-sub-1",
  accessToken: vi.fn(async () => "synthetic-token"),
  getAccountId: vi.fn(async () => "cognito-sub-1"),
  request: vi.fn(),
  bridge: {
    available: true,
    list: vi.fn(), getPending: vi.fn(), markProcessing: vi.fn(), readAudio: vi.fn(),
    markSucceeded: vi.fn(), markFailed: vi.fn(), delete: vi.fn(), play: vi.fn(), pause: vi.fn(),
    setAccount: vi.fn(), subscribe: vi.fn(() => () => undefined),
  },
}));

vi.mock("../../platform/auth/client", () => ({ authClient: { accessToken: mocks.accessToken }, getAuthenticatedAccountId: mocks.getAccountId }));
vi.mock("../local-data/store/useLocalDatasetStore", () => ({ useLocalDatasetStore: { getState: () => mocks.state! } }));
vi.mock("../voice/api", () => ({ requestVoiceExpense: mocks.request, VoiceAuthenticationError: class extends Error {} }));
vi.mock("./bridge", () => ({ watchAudioBridge: mocks.bridge }));

const recording = (requestId: string, status: WatchRecording["status"] = "pending"): WatchRecording => ({
  requestId, accountId: "cognito-sub-1", recordedAt: "2026-10-06T12:00:00.000Z", mimeType: "audio/mp4", durationMs: 900, status,
});
const state = () => mocks.state!;

describe("watch recording processing", () => {
  let dataset: ReturnType<typeof createEmptyDataset>;
  let id: string;
  let categoryId: string;
  beforeEach(() => {
    vi.clearAllMocks();
    dataset = createEmptyDataset();
    id = createUuid();
    categoryId = dataset.categories.find(category => category.defaultCategoryKey === "food")!.id;
    mocks.state = {
      dataset, datasetEpoch: 0, hydration: { status: "ready" }, saveStatus: "idle",
      addTransactionDurably: vi.fn(async (input: TransactionInput, transactionId: string) => {
        const transaction = { ...input, id: transactionId, createdAt: "2026-10-06T12:00:00.000Z", updatedAt: "2026-10-06T12:00:00.000Z" } as Transaction;
        const state = mocks.state!;
        state.dataset = { ...state.dataset, transactions: [...state.dataset.transactions, transaction] };
        return { ok: true as const, value: transaction };
      }),
    };
    mocks.bridge.getPending.mockResolvedValue([recording(id)]);
    mocks.bridge.list.mockResolvedValue([]);
    mocks.bridge.markProcessing.mockResolvedValue(true);
    mocks.bridge.markSucceeded.mockResolvedValue(undefined);
    mocks.bridge.markFailed.mockResolvedValue(undefined);
    mocks.bridge.readAudio.mockResolvedValue({ audio: "AAAA", mimeType: "audio/mp4", durationMs: 900 });
    mocks.request.mockResolvedValue({ requestId: id, transaction: { amount: "9.25", type: "expense", categoryId, description: "Coffee", date: "2026-10-06", currency: "USD" } });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("processes once and acknowledges only after the durable local save", async () => {
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.bridge.setAccount).toHaveBeenCalledWith("cognito-sub-1");
    expect(mocks.bridge.markProcessing).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.accessToken).toHaveBeenCalledWith({ forceRefresh: false });
    expect(state().addTransactionDurably).toHaveBeenCalledWith(expect.objectContaining({ description: "Coffee" }), id);
    expect(mocks.bridge.markSucceeded).toHaveBeenCalledWith(id, id);
    expect(mocks.bridge.markFailed).not.toHaveBeenCalled();
  });

  it("starts the voice deadline after delayed authentication completes", async () => {
    vi.useFakeTimers();
    let resolveToken!: (token: string) => void;
    mocks.accessToken.mockImplementationOnce(() => new Promise<string>(resolve => { resolveToken = resolve; }));
    const { processWatchQueue } = await import("./processor");
    const processing = processWatchQueue("cognito-sub-1");
    await vi.waitFor(() => expect(mocks.accessToken).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(35000);
    expect(mocks.request).not.toHaveBeenCalled();
    resolveToken("synthetic-token");
    await processing;
    expect((mocks.request.mock.calls[0]?.[1] as AbortSignal | undefined)?.aborted).toBe(false);
    expect(mocks.bridge.markSucceeded).toHaveBeenCalledWith(id, id);
  });

  it("reconciles a committed UUID from failed native metadata without retranscribing", async () => {
    const existing = { id, amount: "9.25", type: "expense", categoryId, description: "Coffee", date: "2026-10-06", currency: "USD" };
    state().dataset.transactions = [{ ...existing, createdAt: "2026-10-06T12:00:00.000Z", updatedAt: "2026-10-06T12:00:00.000Z" } as Transaction];
    mocks.bridge.getPending.mockResolvedValue([]);
    mocks.bridge.list.mockResolvedValue([recording(id, "failed")]);
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(state().addTransactionDurably).not.toHaveBeenCalled();
    expect(mocks.bridge.markSucceeded).toHaveBeenCalledWith(id, id);
  });

  it("terminalizes an interrupted processing claim after restart without retrying transcription", async () => {
    mocks.bridge.getPending.mockResolvedValue([]);
    mocks.bridge.list.mockResolvedValue([recording(id, "processing")]);
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "processing_interrupted");
  });

  it("retains terminal failures and never automatically retranscribes them", async () => {
    mocks.request.mockRejectedValue(new Error("synthetic offline failure"));
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    mocks.bridge.getPending.mockResolvedValue([]);
    mocks.bridge.list.mockResolvedValue([recording(id, "failed")]);
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "processing_failed");
    expect(mocks.bridge.markSucceeded).not.toHaveBeenCalled();
  });

  it("rejects another account's recording and stops after a dataset reset", async () => {
    mocks.bridge.getPending.mockResolvedValue([recording(id)]);
    mocks.bridge.list.mockResolvedValue([]);
    state().datasetEpoch = 1;
    mocks.bridge.getPending.mockImplementation(async () => { state().datasetEpoch = 2; return [recording(id)]; });
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).not.toHaveBeenCalled();

    state().datasetEpoch = 3;
    mocks.bridge.getPending.mockResolvedValue([recording(id)]);
    mocks.bridge.list.mockResolvedValue([]);
    mocks.bridge.getPending.mockImplementation(async () => [recording(id, "pending")]);
    // Queue metadata for a different stable account never reaches the endpoint.
    mocks.bridge.getPending.mockResolvedValue([{ ...recording(id), accountId: "cognito-sub-other" }]);
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("drains multiple pending recordings sequentially with distinct stable transaction IDs", async () => {
    const secondId = createUuid();
    mocks.bridge.getPending.mockResolvedValue([recording(id), recording(secondId)]);
    mocks.request.mockImplementation(async request => ({ requestId: request.requestId, transaction: { amount: "9.25", type: "expense", categoryId, description: "Coffee", date: request.localDate, currency: "USD" } }));
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.bridge.markSucceeded.mock.calls.map(call => call[0])).toEqual([id, secondId]);
  });

  it("does not transcribe when another worker already claimed the recording", async () => {
    mocks.bridge.markProcessing.mockResolvedValue(false);
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.bridge.readAudio).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.bridge.markFailed).not.toHaveBeenCalled();
  });

  it("guards duplicate foreground/headless workers from transcribing one request concurrently", async () => {
    let signalRead!: () => void;
    let finishRead!: (audio: { audio: string; mimeType: string; durationMs: number }) => void;
    const readStarted = new Promise<void>(resolve => { signalRead = resolve; });
    const readResult = new Promise<{ audio: string; mimeType: string; durationMs: number }>(resolve => { finishRead = resolve; });
    mocks.bridge.readAudio.mockImplementation(() => { signalRead(); return readResult; });
    const { processWatchQueue } = await import("./processor");
    const foreground = processWatchQueue("cognito-sub-1");
    await readStarted;
    let headlessFinished = false;
    const headless = processWatchQueue("cognito-sub-1").then(() => { headlessFinished = true; });
    await vi.waitFor(() => expect(mocks.bridge.getPending).toHaveBeenCalledTimes(2));
    expect(headlessFinished).toBe(false);
    finishRead({ audio: "AAAA", mimeType: "audio/mp4", durationMs: 900 });
    await Promise.all([foreground, headless]);
    expect(mocks.bridge.markProcessing).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  it("moves audio-read and local durable-save failures to the terminal encrypted queue without acknowledging", async () => {
    const { processWatchQueue } = await import("./processor");
    mocks.bridge.readAudio.mockRejectedValueOnce(new Error("synthetic read error"));
    await processWatchQueue("cognito-sub-1");
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "processing_failed");
    expect(mocks.request).not.toHaveBeenCalled();
    vi.clearAllMocks();
    mocks.bridge.getPending.mockResolvedValue([recording(id)]);
    mocks.bridge.markProcessing.mockResolvedValue(true);
    mocks.bridge.readAudio.mockResolvedValue({ audio: "AAAA", mimeType: "audio/mp4", durationMs: 900 });
    mocks.getAccountId.mockResolvedValue("cognito-sub-1");
    mocks.request.mockResolvedValue({ requestId: id, transaction: { amount: "9.25", type: "expense", categoryId, description: "Coffee", date: "2026-10-06", currency: "USD" } });
    state().addTransactionDurably = vi.fn(async () => ({ ok: false as const, message: "local_save_failed" }));
    state().saveStatus = "error";
    await processWatchQueue("cognito-sub-1");
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "local_save_failed");
    expect(mocks.bridge.markSucceeded).not.toHaveBeenCalled();
  });

  it("reconciles a missed completion receipt without sending the audio again", async () => {
    const { processWatchQueue } = await import("./processor");
    mocks.bridge.markSucceeded.mockRejectedValueOnce(new Error("synthetic receipt write failure"));
    await processWatchQueue("cognito-sub-1");
    mocks.bridge.getPending.mockResolvedValue([]);
    mocks.bridge.list.mockResolvedValue([recording(id, "failed")]);
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.bridge.markSucceeded).toHaveBeenCalledTimes(2);
    expect(mocks.bridge.markFailed).not.toHaveBeenCalled();
  });

  it("fails closed when the authenticated subject changes while remote processing is in flight", async () => {
    mocks.request.mockImplementation(async () => {
      mocks.getAccountId.mockResolvedValue("cognito-sub-other");
      return { requestId: id, transaction: { amount: "9.25", type: "expense", categoryId, description: "Coffee", date: "2026-10-06", currency: "USD" } };
    });
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(state().addTransactionDurably).not.toHaveBeenCalled();
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "account_changed");
    expect(mocks.bridge.markSucceeded).not.toHaveBeenCalled();
  });
});
