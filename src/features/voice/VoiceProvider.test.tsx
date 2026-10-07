import { invalidateAuthentication } from "../../platform/auth/lifecycle";
import { i18n } from "../../localization/i18n";
import React from "react";
import { Pressable, Text } from "react-native";
import { Snackbar } from "../../ui/Snackbar";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
import { createTransaction } from "../../domain/transactions";
import type { Dataset } from "../../domain/types";
import type { TransactionInput } from "../../domain/validation";
import type { VoiceTarget } from "../trackers/store";
import { voiceRequestSchema, type VoiceResponse } from "../../contracts/voice";
import { createCategory, findUncategorizedCategory } from "../../domain/categories";
import { VoiceProvider, useVoice, localRecordingDate } from "./VoiceProvider";
vi.mock("../../platform/auth/client", () => ({ authClient: { accessToken: async () => "synthetic-token" } }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ identity: "synthetic@example.invalid", epoch: 0, open: vi.fn(), signOut: vi.fn() }) }));
type TargetSummary = Pick<VoiceTarget, "datasetId" | "name" | "membershipId" | "generation" | "kind">;
const mocks = vi.hoisted(() => ({
  permission: vi.fn(), requestPermission: vi.fn(), start: vi.fn(), stop: vi.fn(), read: vi.fn(), dispose: vi.fn(),
  request: vi.fn(), push: vi.fn(), background: undefined as undefined | ((state: string) => void),
  targets: new Map<string, VoiceTarget>(),
  active: null as TargetSummary | null,
  getVoiceTarget: vi.fn(), saveVoice: vi.fn(),
}));
vi.mock("../trackers/store", () => ({
  useActiveTrackerSummary: () => mocks.active,
  getVoiceTarget: mocks.getVoiceTarget,
  addVoiceTransactionDurably: mocks.saveVoice,
}));
vi.mock("react-native", () => ({
  Platform: { OS: "web" }, useWindowDimensions: () => ({ width: 390 }), View: "View", Text: "Text", Pressable: "Pressable", ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (s: unknown) => s },
  AppState: { addEventListener: (_name: string, callback: (state: string) => void) => { mocks.background = callback; return { remove: vi.fn() }; } },
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../../ui/theme", () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock("../../ui/Snackbar", () => ({ Snackbar: "Snackbar" }));
vi.mock("./recording", () => ({ createRecorder: () => ({
  hasPermission: mocks.permission, requestPermission: mocks.requestPermission, start: mocks.start, stop: mocks.stop, read: mocks.read, dispose: mocks.dispose,
}) }));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, requestVoiceExpense: mocks.request };
});
let controls: ReturnType<typeof useVoice>;
function Observer() { controls = useVoice(); return null; }
let tree: ReactTestRenderer;
let queryClient: QueryClient;
let baseDataset: Dataset;
let personal: VoiceTarget;
let shared: VoiceTarget;
let custom: ReturnType<typeof createCategory>;
let food: Dataset["categories"][number];
let fallback: Dataset["categories"][number];
const input: TransactionInput = { amount: "10", currency: "USD", type: "expense", description: "Synthetic", categoryId: "", date: "2026-10-02" };
let resolveResponse: (value: VoiceResponse) => void;
function pendingResponse() {
  mocks.request.mockImplementation(() => new Promise<VoiceResponse>(resolve => { resolveResponse = resolve; }));
}
async function finishResponse(transaction: TransactionInput = { ...input, categoryId: food.id }) {
  const request = mocks.request.mock.calls[0]![0] as { requestId: string };
  await act(async () => { resolveResponse({ requestId: request.requestId, transaction }); });
}
beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.clearAllMocks(); vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.permission.mockResolvedValue(true); mocks.requestPermission.mockResolvedValue(true); mocks.start.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue({ uri: "synthetic", mimeType: "audio/mp4", durationMs: 1000 }); mocks.read.mockResolvedValue("AAAA"); mocks.dispose.mockResolvedValue(undefined);
  pendingResponse();
  baseDataset = createEmptyDataset();
  custom = createCategory({ kind: "expense", name: "Synthetic voice custom" });
  baseDataset = { ...baseDataset, categories: [...baseDataset.categories, custom] };
  food = baseDataset.categories.find(category => category.defaultCategoryKey === "food")!;
  fallback = findUncategorizedCategory(baseDataset.categories, "expense");
  personal = { datasetId: baseDataset.datasetId, name: "Personal", membershipId: null, generation: 1, writable: true, kind: "personal", dataset: baseDataset };
  const sharedBase = createEmptyDataset();
  const membershipId = "019b0f3a-2230-7abc-8def-000000000100";
  shared = { datasetId: sharedBase.datasetId, name: "Household", membershipId, generation: 3, writable: true, kind: "shared", dataset: {
    ...sharedBase, tracker: { kind: "shared", name: "Household", accountSubject: "synthetic@example.invalid", membershipId, role: "member", archived: false, access: "active" },
  } };
  mocks.targets = new Map([[personal.datasetId, personal], [shared.datasetId, shared]]);
  mocks.active = personal;
  mocks.getVoiceTarget.mockImplementation(async (datasetId: string) => mocks.targets.get(datasetId) ?? null);
  mocks.saveVoice.mockImplementation(async (datasetId: string, value: TransactionInput, id: string) => {
    const target = mocks.targets.get(datasetId);
    if (!target) return { ok: false as const, message: "tracker_membership_changed" };
    const existing = target.dataset.transactions.find(record => record.id === id);
    if (existing) return { ok: true as const, value: existing };
    const transaction = createTransaction(value, { categories: target.dataset.categories, idFactory: () => id });
    target.dataset = { ...target.dataset, transactions: [...target.dataset.transactions, transaction] };
    return { ok: true as const, value: transaction };
  });
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
  await act(async () => { tree = create(<QueryClientProvider client={queryClient}><VoiceProvider><Observer /></VoiceProvider></QueryClientProvider>); });
});
afterEach(async () => { await act(async () => tree.unmount()); vi.useRealTimers(); await i18n.changeLanguage("en"); });

describe("global voice lifecycle", () => {
  it("keeps one voice operation across language changes and sends translated categories with unchanged IDs", async () => {
    await act(async () => { await controls.start(); });
    expect(controls.phase).toBe("recording");
    await act(async () => { await i18n.changeLanguage("es"); });
    expect(controls.phase).toBe("recording"); expect(mocks.start).toHaveBeenCalledOnce();
    await act(async () => { void controls.stop(); });
    const request = voiceRequestSchema.parse(mocks.request.mock.calls[0]![0]);
    expect(request.tracker).toBeUndefined();
    expect(request.categories.find(category => category.id === food.id)?.name).toBe("Comida");
    expect(request.categories.filter(category => category.isFallback)).toEqual([{ id: fallback.id, name: "Sin categoría", localizedNames: { en: "Uncategorized", es: "Sin categoría" }, isFallback: true }]);
    expect(request.categories.find(category => category.id === custom.id)?.name).toBe(custom.name);
    expect(request.categories.map(category => category.id)).toEqual(baseDataset.categories.filter(category => category.kind === "expense").map(category => category.id));
    await act(async () => { await i18n.changeLanguage("en"); });
    expect(controls.phase).toBe("processing"); expect(mocks.request).toHaveBeenCalledOnce();
    await finishResponse();
    expect(mocks.saveVoice).toHaveBeenCalledWith(personal.datasetId, expect.any(Object), expect.any(String), 1, null);
  });

  it("keeps a shared voice recording bound to its start target after phone selection changes", async () => {
    mocks.active = shared;
    await act(async () => { tree.update(<QueryClientProvider client={queryClient}><VoiceProvider><Observer /></VoiceProvider></QueryClientProvider>); });
    await act(async () => { await controls.start(); });
    await act(async () => { void controls.stop(); });
    mocks.active = personal;
    await finishResponse({ ...input, categoryId: shared.dataset.categories.find(category => category.defaultCategoryKey === "food")!.id });
    const request = voiceRequestSchema.parse(mocks.request.mock.calls[0]![0]);
    expect(request.tracker).toEqual({ datasetId: shared.datasetId, membershipId: shared.membershipId });
    expect(mocks.saveVoice).toHaveBeenCalledWith(shared.datasetId, expect.any(Object), request.requestId, 3, shared.membershipId);
    expect(shared.dataset.transactions.map(transaction => transaction.id)).toContain(request.requestId);
    expect(personal.dataset.transactions).toHaveLength(0);
  });

  it("requires a fresh start after permission and handles early release during preparation", async () => {
    mocks.permission.mockResolvedValueOnce(false);
    await act(async () => { await controls.start(); });
    expect(controls.phase).toBe("idle"); expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.requestPermission).toHaveBeenCalledOnce();
    let finish: () => void = () => undefined;
    mocks.start.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await act(async () => { void controls.start(); });
    await act(async () => { await controls.stop(); finish(); });
    expect(controls.phase).toBe("idle"); expect(mocks.request).not.toHaveBeenCalled();
  });

  it("permits only one request and ignores canceled late responses", async () => {
    await act(async () => { await controls.start(); }); await act(async () => { void controls.stop(); });
    expect(controls.phase).toBe("processing"); await act(async () => { await controls.start(); });
    expect(mocks.start).toHaveBeenCalledOnce(); await act(async () => { controls.cancel(); }); await finishResponse();
    expect(mocks.saveVoice).not.toHaveBeenCalled(); expect(mocks.dispose).toHaveBeenCalled();
  });

  it("submits at the recording limit and aborts at the submission deadline", async () => {
    await act(async () => { await controls.start(); }); await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(controls.phase).toBe("processing"); await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(controls.phase).toBe("idle"); expect(controls.message).toContain("too long");
    expect(mocks.request.mock.calls[0]?.[1].aborted).toBe(true); await finishResponse(); expect(mocks.saveVoice).not.toHaveBeenCalled();
  });

  it("rejects a late response after the target generation changes", async () => {
    await act(async () => { await controls.start(); }); await act(async () => { void controls.stop(); });
    mocks.targets.set(personal.datasetId, { ...personal, generation: personal.generation + 1 });
    await finishResponse();
    expect(mocks.saveVoice).not.toHaveBeenCalled(); expect(controls.phase).toBe("idle");
    expect(controls.message).toContain("This tracker is no longer available for new expenses.");
  });

  it("cancels recording on backgrounding and sign-out invalidates late results", async () => {
    await act(async () => { await controls.start(); mocks.background?.("background"); });
    expect(controls.phase).toBe("idle");
    await act(async () => { await controls.start(); });
    await act(async () => { void controls.stop(); });
    const signal = mocks.request.mock.calls[0]![1] as AbortSignal;
    await act(async () => { invalidateAuthentication(); });
    expect(signal.aborted).toBe(true); expect(controls.phase).toBe("idle"); await finishResponse();
    expect(mocks.saveVoice).not.toHaveBeenCalled(); expect(mocks.request).toHaveBeenCalledOnce();
  });

  it("revalidates archived categories and retries only the original tracker save", async () => {
    let attempts = 0;
    mocks.saveVoice.mockImplementation(async (datasetId: string, value: TransactionInput, id: string) => {
      attempts++;
      const target = mocks.targets.get(datasetId)!;
      const existing = createTransaction(value, { categories: target.dataset.categories, idFactory: () => id });
      target.dataset = { ...target.dataset, transactions: [existing] };
      return attempts === 1 ? { ok: false as const, message: "Synthetic write failure", recordId: id } : { ok: true as const, value: existing };
    });
    await act(async () => { await controls.start(); });
    await act(async () => { void controls.stop(); });
    personal.dataset = { ...baseDataset, categories: baseDataset.categories.map(category => category.id === custom.id ? { ...category, isArchived: true } : category) };
    await finishResponse({ ...input, categoryId: custom.id });
    expect(mocks.saveVoice.mock.calls[0]?.[1].categoryId).toBe(fallback.id); expect(controls.phase).toBe("save_failed");
    await act(async () => { invalidateAuthentication(); }); expect(controls.phase).toBe("save_failed");
    const retry = tree.root.findAllByType(Pressable).find(pressable => pressable.findByType(Text).props.children === "Retry save")!;
    await act(async () => { retry.props.onPress(); });
    expect(controls.phase).toBe("idle"); expect(mocks.request).toHaveBeenCalledOnce(); expect(attempts).toBe(2);
    const snackbar = tree.root.findByType(Snackbar); expect(snackbar.props.durationMs).toBe(8000);
    await act(async () => { snackbar.props.onAction(); });
    expect(mocks.push).toHaveBeenCalledWith({ pathname: "/transactions", params: { edit: mocks.saveVoice.mock.calls[0]?.[2], tracker: personal.datasetId } });
  });

  it("uses local calendar components rather than UTC conversion", () => {
    const date = new Date(2026, 0, 2, 23, 59, 59);
    expect(localRecordingDate(date)).toBe("2026-01-02");
  });
});
