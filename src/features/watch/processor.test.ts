import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
import { createUuid } from "../../platform/identifiers/createUuid";
import type { WatchRecording } from "./bridge";
import type { VoiceTarget } from "../trackers/store";
import { createTransaction } from "../../domain/transactions";

const mocks = vi.hoisted(() => ({
  account: "cognito-sub-1" as string | null,
  accessToken: vi.fn(async () => "synthetic-token"),
  getAccountId: vi.fn(async () => "cognito-sub-1" as string | null),
  request: vi.fn(),
  getVoiceTarget: vi.fn(),
  getPersonalVoiceTarget: vi.fn(),
  addVoiceTransactionDurably: vi.fn(),
  targets: new Map<string, VoiceTarget>(),
  bridge: {
    available: true,
    list: vi.fn(), getPending: vi.fn(), markProcessing: vi.fn(), readAudio: vi.fn(),
    markSucceeded: vi.fn(), markFailed: vi.fn(), delete: vi.fn(), play: vi.fn(), pause: vi.fn(),
    setAccount: vi.fn(), bindLegacyPersonalTarget: vi.fn(), subscribe: vi.fn(() => () => undefined),
  },
}));

vi.mock("../../platform/auth/client", () => ({ authClient: { accessToken: mocks.accessToken }, getAuthenticatedAccountId: mocks.getAccountId }));
vi.mock("../trackers/store", () => ({
  getVoiceTarget: mocks.getVoiceTarget,
  getPersonalVoiceTarget: mocks.getPersonalVoiceTarget,
  addVoiceTransactionDurably: mocks.addVoiceTransactionDurably,
}));
vi.mock("../voice/api", () => ({
  requestVoiceExpense: mocks.request,
  VoiceAuthenticationError: class extends Error {},
  VoiceClientError: class extends Error { readonly code = "unknown"; },
}));
vi.mock("./bridge", () => ({
  watchAudioBridge: mocks.bridge,
  watchRecordingTarget: (item: { trackerId?: string; membershipId?: string | null; generation?: number }) =>
    item.trackerId && item.generation !== undefined
      ? { trackerId: item.trackerId, membershipId: item.membershipId ?? null, generation: item.generation }
      : null,
}));

const recording = (requestId: string, status: WatchRecording["status"] = "pending", target?: VoiceTarget): WatchRecording => ({
  requestId, accountId: "cognito-sub-1", recordedAt: "2026-10-06T12:00:00.000Z", mimeType: "audio/mp4", durationMs: 900, status,
  ...(target ? { trackerId: target.datasetId, membershipId: target.membershipId, generation: target.generation, localDate: "2026-10-06", protocolVersion: 2 as const } : {}),
});

describe("watch recording processing", () => {
  let dataset: ReturnType<typeof createEmptyDataset>;
  let personal: VoiceTarget;
  let shared: VoiceTarget;
  let id: string;
  let categoryId: string;

  beforeEach(() => {
    vi.clearAllMocks(); vi.useRealTimers();
    dataset = createEmptyDataset();
    personal = { datasetId: dataset.datasetId, name: "Personal", membershipId: null, generation: 1, writable: true, kind: "personal", dataset };
    const sharedBase = createEmptyDataset();
    shared = { datasetId: sharedBase.datasetId, name: "Household", membershipId: createUuid(), generation: 3, writable: true, kind: "shared", dataset: { ...sharedBase, tracker: { kind: "shared", name: "Household", accountSubject: "cognito-sub-1", membershipId: createUuid(), role: "member", archived: false, access: "active" } } };
    // Keep the context and registry summary bound to the same membership incarnation.
    shared.dataset.tracker!.membershipId = shared.membershipId!;
    mocks.targets = new Map([[personal.datasetId, personal], [shared.datasetId, shared]]);
    mocks.account = "cognito-sub-1";
    mocks.getAccountId.mockImplementation(async () => mocks.account);
    mocks.getVoiceTarget.mockImplementation(async (datasetId: string) => mocks.targets.get(datasetId) ?? null);
    mocks.getPersonalVoiceTarget.mockImplementation(async (subject?: string) => subject === "cognito-sub-1" ? personal : null);
    id = createUuid();
    categoryId = dataset.categories.find(category => category.defaultCategoryKey === "food")!.id;
    mocks.bridge.list.mockResolvedValue([]);
    mocks.bridge.getPending.mockResolvedValue([recording(id, "pending", personal)]);
    mocks.bridge.markProcessing.mockResolvedValue(true);
    mocks.bridge.markSucceeded.mockResolvedValue(undefined);
    mocks.bridge.markFailed.mockResolvedValue(undefined);
    mocks.bridge.bindLegacyPersonalTarget.mockImplementation(async (requestId: string, _account: string, datasetId: string, generation: number) => {
      const old = (mocks.bridge.getPending.mock.results.at(-1)?.value as WatchRecording[] | undefined)?.find(item => item.requestId === requestId);
      if (old) Object.assign(old, { trackerId: datasetId, membershipId: null, generation, protocolVersion: 2 });
    });
    mocks.bridge.readAudio.mockResolvedValue({ audio: "AAAA", mimeType: "audio/mp4", durationMs: 900 });
    mocks.request.mockImplementation(async request => ({ requestId: request.requestId, transaction: { amount: "9.25", type: "expense", categoryId, description: "Coffee", date: request.localDate, currency: "USD" } }));
    mocks.addVoiceTransactionDurably.mockImplementation(async (datasetId: string, input, requestId: string) => {
      const target = mocks.targets.get(datasetId);
      if (!target) return { ok: false as const, message: "tracker_membership_changed" };
      const existing = target.dataset.transactions.find(transaction => transaction.id === requestId);
      if (existing) return { ok: true as const, value: existing };
      const transaction = createTransaction(input, { categories: target.dataset.categories, idFactory: () => requestId });
      target.dataset = { ...target.dataset, transactions: [...target.dataset.transactions, transaction] };
      return { ok: true as const, value: transaction };
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("processes once and acknowledges only after a durable save to the bound personal tracker", async () => {
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.bridge.setAccount).toHaveBeenCalledWith("cognito-sub-1");
    expect(mocks.bridge.markProcessing).toHaveBeenCalledWith(id, { trackerId: personal.datasetId, membershipId: null, generation: 1 });
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.request.mock.calls[0]?.[0].tracker).toBeUndefined();
    expect(mocks.addVoiceTransactionDurably).toHaveBeenCalledWith(personal.datasetId, expect.objectContaining({ description: "Coffee" }), id, 1, null);
    expect(mocks.bridge.markSucceeded).toHaveBeenCalledWith(id, id, { trackerId: personal.datasetId, membershipId: null, generation: 1 });
  });

  it("keeps a protocol-one recording on its originating personal target while a shared tracker is selected", async () => {
    const legacy = recording(id);
    mocks.bridge.getPending.mockResolvedValue([legacy]);
    mocks.bridge.bindLegacyPersonalTarget.mockImplementation(async (requestId: string, _account: string, target: { datasetId: string; generation: number }) => {
      expect(requestId).toBe(legacy.requestId);
      Object.assign(legacy, { trackerId: target.datasetId, membershipId: null, generation: target.generation, protocolVersion: 2 });
    });
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.bridge.bindLegacyPersonalTarget).toHaveBeenCalledWith(id, "cognito-sub-1", { datasetId: personal.datasetId, generation: 1 });
    expect(mocks.addVoiceTransactionDurably).toHaveBeenCalledWith(personal.datasetId, expect.any(Object), id, 1, null);
    expect(shared.dataset.transactions).toHaveLength(0);
    expect(mocks.request.mock.calls[0]?.[0].tracker).toBeUndefined();
  });

  it("sends shared target scope and saves to that target even if the active phone selection changes", async () => {
    mocks.bridge.getPending.mockResolvedValue([recording(id, "pending", shared)]);
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request.mock.calls[0]?.[0].tracker).toEqual({ datasetId: shared.datasetId, membershipId: shared.membershipId });
    expect(mocks.addVoiceTransactionDurably).toHaveBeenCalledWith(shared.datasetId, expect.any(Object), id, shared.generation, shared.membershipId);
    expect(shared.dataset.transactions.map(transaction => transaction.id)).toContain(id);
    expect(personal.dataset.transactions).toHaveLength(0);
  });

  it("does not send audio when membership or target generation changed", async () => {
    mocks.bridge.getPending.mockResolvedValue([recording(id, "pending", shared)]);
    const { processWatchQueue } = await import("./processor");
    const oldGet = mocks.getVoiceTarget.getMockImplementation()!;
    mocks.bridge.readAudio.mockImplementation(async () => {
      mocks.targets.set(shared.datasetId, { ...shared, generation: shared.generation + 1 });
      return { audio: "AAAA", mimeType: "audio/mp4", durationMs: 900 };
    });
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.addVoiceTransactionDurably).not.toHaveBeenCalled();
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "tracker_membership_changed", { trackerId: shared.datasetId, membershipId: shared.membershipId, generation: shared.generation });
    mocks.getVoiceTarget.mockImplementation(oldGet);
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
    expect(mocks.bridge.markSucceeded).toHaveBeenCalledOnce();
  });

  it("reconciles a committed UUID from failed native metadata without retranscribing", async () => {
    const existing = createTransaction({ amount: "9.25", type: "expense", categoryId, description: "Coffee", date: "2026-10-06", currency: "USD" }, { categories: personal.dataset.categories, idFactory: () => id });
    personal.dataset = { ...personal.dataset, transactions: [existing] };
    mocks.bridge.getPending.mockResolvedValue([]);
    mocks.bridge.list.mockResolvedValue([recording(id, "failed", personal)]);
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.addVoiceTransactionDurably).not.toHaveBeenCalled();
    expect(mocks.bridge.markSucceeded).toHaveBeenCalledOnce();
  });

  it("terminalizes an interrupted processing claim after restart without retrying transcription", async () => {
    mocks.bridge.getPending.mockResolvedValue([]);
    mocks.bridge.list.mockResolvedValue([recording(id, "processing", personal)]);
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "processing_interrupted", { trackerId: personal.datasetId, membershipId: null, generation: 1 });
  });

  it("retains terminal failures and never automatically retranscribes them", async () => {
    mocks.request.mockRejectedValue(new Error("synthetic offline failure"));
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    mocks.bridge.getPending.mockResolvedValue([]);
    mocks.bridge.list.mockResolvedValue([recording(id, "failed", personal)]);
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "processing_failed", { trackerId: personal.datasetId, membershipId: null, generation: 1 });
    expect(mocks.bridge.markSucceeded).not.toHaveBeenCalled();
  });

  it("stops after target removal and preserves account isolation", async () => {
    mocks.bridge.getPending.mockResolvedValue([recording(id, "pending", shared)]);
    mocks.targets.delete(shared.datasetId);
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.addVoiceTransactionDurably).not.toHaveBeenCalled();
    vi.clearAllMocks();
    mocks.targets.set(shared.datasetId, shared);
    mocks.bridge.getPending.mockResolvedValue([{ ...recording(id, "pending", shared), accountId: "cognito-sub-other" }]);
    await processWatchQueue("cognito-sub-1");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("drains multiple pending recordings sequentially with distinct stable transaction IDs", async () => {
    const secondId = createUuid();
    mocks.bridge.getPending.mockResolvedValue([recording(id, "pending", personal), recording(secondId, "pending", personal)]);
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

  it("keeps audio terminally failed after a local durable-save failure", async () => {
    mocks.addVoiceTransactionDurably.mockResolvedValue({ ok: false as const, recordId: id, message: "local_save_failed" });
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "local_save_failed", { trackerId: personal.datasetId, membershipId: null, generation: 1 });
    expect(mocks.bridge.markSucceeded).not.toHaveBeenCalled();
  });

  it("fails closed when the authenticated subject changes while remote processing is in flight", async () => {
    mocks.request.mockImplementation(async () => {
      mocks.account = "cognito-sub-other";
      return { requestId: id, transaction: { amount: "9.25", type: "expense", categoryId, description: "Coffee", date: "2026-10-06", currency: "USD" } };
    });
    const { processWatchQueue } = await import("./processor");
    await processWatchQueue("cognito-sub-1");
    expect(mocks.addVoiceTransactionDurably).not.toHaveBeenCalled();
    expect(mocks.bridge.markFailed).toHaveBeenCalledWith(id, "account_changed", { trackerId: personal.datasetId, membershipId: null, generation: 1 });
    expect(mocks.bridge.markSucceeded).not.toHaveBeenCalled();
  });
});
