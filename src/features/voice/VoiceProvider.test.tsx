import { invalidateAuthentication } from "../../platform/auth/lifecycle";
import { i18n } from "../../localization/i18n";
import React from "react";
import { Pressable, Text } from "react-native";
import { Snackbar } from "../../ui/Snackbar";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";
import { createTransaction } from "../../domain/transactions";
import type { TransactionInput } from "../../domain/validation";
import { voiceRequestSchema, type VoiceResponse } from "../../contracts/voice";
import { createCategory } from "../../domain/categories";
import { VoiceProvider, useVoice, localRecordingDate } from "./VoiceProvider";
vi.mock("../../platform/auth/client", () => ({ authClient: { accessToken: async () => "synthetic-token" } }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ identity: "synthetic@example.invalid", epoch: 0, open: vi.fn(), signOut: vi.fn() }) }));
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  requestPermission: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  read: vi.fn(),
  dispose: vi.fn(),
  request: vi.fn(),
  push: vi.fn(),
  background: undefined as undefined | ((state: string) => void),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  useWindowDimensions: () => ({ width: 390 }),
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (s: unknown) => s },
  AppState: {
    addEventListener: (_name: string, callback: (state: string) => void) => {
      mocks.background = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../../ui/theme", () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock("../../ui/Snackbar", () => ({ Snackbar: "Snackbar" }));
vi.mock("./recording", () => ({
  createRecorder: () => ({
    hasPermission: mocks.permission,
    requestPermission: mocks.requestPermission,
    start: mocks.start,
    stop: mocks.stop,
    read: mocks.read,
    dispose: mocks.dispose,
  }),
}));
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, requestVoiceExpense: mocks.request };
});
let controls: ReturnType<typeof useVoice>;
function Observer() {
  controls = useVoice();
  return null;
}
let tree: ReactTestRenderer;
const baseDataset = createEmptyDataset();
const custom = createCategory({ kind: "expense", name: "Synthetic voice custom" });
const dataset = { ...baseDataset, categories: [...baseDataset.categories, custom] };
const food = dataset.categories.find((c) => c.name === "Food")!;
const fallback = dataset.categories.find(
  (c) => c.kind === "expense" && c.defaultCategoryKey === "uncategorized",
)!;
const input: TransactionInput = {
  amount: "10",
  currency: "USD",
  type: "expense",
  description: "Synthetic",
  categoryId: food.id,
  date: "2026-10-02",
};
let resolveResponse: (value: VoiceResponse) => void;
function pendingResponse() {
  mocks.request.mockImplementation(
    () =>
      new Promise<VoiceResponse>((resolve) => {
        resolveResponse = resolve;
      }),
  );
}
async function finishResponse(transaction = input) {
  const request = mocks.request.mock.calls[0]![0] as { requestId: string };
  await act(async () => {
    resolveResponse({ requestId: request.requestId, transaction });
  });
}
beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.clearAllMocks();
  vi.useFakeTimers();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.permission.mockResolvedValue(true);
  mocks.requestPermission.mockResolvedValue(true);
  mocks.start.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue({
    uri: "synthetic",
    mimeType: "audio/mp4",
    durationMs: 1000,
  });
  mocks.read.mockResolvedValue("AAAA");
  mocks.dispose.mockResolvedValue(undefined);
  pendingResponse();
  useLocalDatasetStore.setState({
    dataset,
    datasetEpoch: 0,
    addTransaction: vi.fn(async (value: TransactionInput, id?: string) => ({
      ok: true as const,
      value: createTransaction(value, {
        categories: useLocalDatasetStore.getState().dataset!.categories,
        idFactory: () => id!,
      }),
    })),
    retryLocalSave: vi.fn().mockResolvedValue({ ok: true, value: null }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: 0 } },
  });
  await act(async () => {
    tree = create(
      <QueryClientProvider client={queryClient}>
        <VoiceProvider>
          <Observer />
        </VoiceProvider>
      </QueryClientProvider>,
    );
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
  vi.useRealTimers();
  await i18n.changeLanguage("en");
});
describe("global voice lifecycle", () => {
  it("keeps one voice operation across language changes and sends translated category names with unchanged IDs", async () => {
    await act(async () => { await controls.start(); });
    expect(controls.phase).toBe("recording");
    await act(async () => { await i18n.changeLanguage("es"); });
    expect(controls.phase).toBe("recording");
    expect(mocks.start).toHaveBeenCalledOnce();
    await act(async () => { void controls.stop(); });
    const request = voiceRequestSchema.parse(mocks.request.mock.calls[0]![0]);
    expect(request.categories.find(category => category.id === food.id)?.name).toBe("Comida");
    expect(request.categories.filter(category => category.isFallback)).toEqual([{ id: fallback.id, name: "Sin categoría", localizedNames: { en: "Uncategorized", es: "Sin categoría" }, isFallback: true }]);
    expect(request.categories.find(category => category.id === custom.id)?.name).toBe(custom.name);
    expect(request.categories.map(category => category.id)).toEqual(dataset.categories.filter(category => category.kind === "expense").map(category => category.id));
    await act(async () => { await i18n.changeLanguage("en"); });
    expect(controls.phase).toBe("processing");
    expect(mocks.request).toHaveBeenCalledOnce();
    await finishResponse();
    expect(useLocalDatasetStore.getState().addTransaction).toHaveBeenCalledOnce();
  });

  it("requires a fresh start after permission and handles early release during preparation", async () => {
    mocks.permission.mockResolvedValueOnce(false);
    await act(async () => {
      await controls.start();
    });
    expect(controls.phase).toBe("idle");
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.requestPermission).toHaveBeenCalledOnce();
    let finish: () => void = () => undefined;
    mocks.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      void controls.start();
    });
    await act(async () => {
      await controls.stop();
      finish();
    });
    expect(controls.phase).toBe("idle");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("permits only one request and ignores canceled late responses", async () => {
    await act(async () => {
      await controls.start();
    });
    await act(async () => {
      void controls.stop();
    });
    expect(controls.phase).toBe("processing");
    await act(async () => {
      await controls.start();
    });
    expect(mocks.start).toHaveBeenCalledOnce();
    await act(async () => {
      controls.cancel();
    });
    await finishResponse();
    expect(
      useLocalDatasetStore.getState().addTransaction,
    ).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalled();
  });
  it("submits at the recording limit and aborts at the submission deadline", async () => {
    await act(async () => {
      await controls.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(controls.phase).toBe("processing");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(controls.phase).toBe("idle");
    expect(controls.message).toContain("too long");
    expect(mocks.request.mock.calls[0]?.[1].aborted).toBe(true);
    await finishResponse();
    expect(
      useLocalDatasetStore.getState().addTransaction,
    ).not.toHaveBeenCalled();
  });
  it("rejects a late response even when the deadline timer has not run yet", async () => {
    await act(async () => {
      await controls.start();
    });
    await act(async () => {
      void controls.stop();
    });
    vi.setSystemTime(Date.now() + 30001);
    await finishResponse();
    expect(
      useLocalDatasetStore.getState().addTransaction,
    ).not.toHaveBeenCalled();
    expect(controls.phase).toBe("idle");
    expect(controls.message).toContain("too long");
  });
  it("cancels recording on backgrounding and rejects results after dataset replacement", async () => {
    await act(async () => {
      await controls.start();
      mocks.background?.("background");
    });
    expect(controls.phase).toBe("idle");
    await act(async () => {
      await controls.start();
    });
    await act(async () => {
      void controls.stop();
    });
    await act(async () => {
      useLocalDatasetStore.setState({ datasetEpoch: 1 });
    });
    await finishResponse();
    expect(
      useLocalDatasetStore.getState().addTransaction,
    ).not.toHaveBeenCalled();
  });
  it("sign-out synchronously cancels processing and invalidates late responses without resubmission", async () => {
    const original = useLocalDatasetStore.getState().dataset;
    await act(async () => { await controls.start(); });
    await act(async () => { void controls.stop(); });
    const signal = mocks.request.mock.calls[0]![1] as AbortSignal;
    await act(async () => { invalidateAuthentication(); });
    expect(signal.aborted).toBe(true);
    expect(controls.phase).toBe("idle");
    await finishResponse();
    expect(useLocalDatasetStore.getState().addTransaction).not.toHaveBeenCalled();
    expect(useLocalDatasetStore.getState().dataset).toBe(original);
    expect(mocks.request).toHaveBeenCalledOnce();
  });
  it("revalidates archived categories and retries only local persistence", async () => {
    const add = vi.fn(async (value: TransactionInput, id?: string) => {
      const record = createTransaction(value, {
        categories: useLocalDatasetStore.getState().dataset!.categories,
        idFactory: () => id!,
      });
      useLocalDatasetStore.setState({
        dataset: {
          ...useLocalDatasetStore.getState().dataset!,
          transactions: [record],
        },
      });
      return {
        ok: false as const,
        message: "Synthetic write failure",
        recordId: record.id,
      };
    });
    useLocalDatasetStore.setState({ addTransaction: add });
    await act(async () => {
      await controls.start();
    });
    await act(async () => {
      void controls.stop();
    });
    await act(async () => {
      useLocalDatasetStore.setState({
        dataset: {
          ...dataset,
          categories: dataset.categories.map((c) =>
            c.id === custom.id ? { ...c, isArchived: true } : c,
          ),
        },
      });
    });
    await finishResponse({ ...input, categoryId: custom.id });
    expect(add.mock.calls[0]?.[0].categoryId).toBe(fallback.id);
    expect(controls.phase).toBe("save_failed");
    await act(async () => { invalidateAuthentication(); });
    expect(controls.phase).toBe("save_failed");
    const retry = tree.root
      .findAllByType(Pressable)
      .find((p) => p.findByType(Text).props.children === "Retry save")!;
    await act(async () => {
      retry.props.onPress();
    });
    expect(controls.phase).toBe("idle");
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
    expect(
      useLocalDatasetStore.getState().retryLocalSave,
    ).toHaveBeenCalledOnce();
    const snackbar = tree.root.findByType(Snackbar);
    expect(snackbar.props.durationMs).toBe(8000);
    await act(async () => {
      snackbar.props.onAction();
    });
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/transactions",
      params: { edit: add.mock.calls[0]?.[1] },
    });
  });
  it("uses local calendar components rather than UTC conversion", () => {
    const date = {
      getFullYear: () => 2026,
      getMonth: () => 9,
      getDate: () => 1,
    } as Date;
    expect(localRecordingDate(date)).toBe("2026-10-01");
  });
});
