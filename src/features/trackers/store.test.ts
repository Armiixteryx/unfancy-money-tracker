import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerSummary } from "../../server/contracts/trackers";

const persistenceMemory = vi.hoisted(() => {
  type ReadGate = { promise: Promise<string | null>; started: () => void };
  type Adapter = {
    snapshot: string | null;
    readSnapshot: () => Promise<string | null>;
    readRecoverySnapshot: () => Promise<string | null>;
    writeSnapshot: (snapshot: string) => Promise<void>;
    quarantineSnapshot: (_snapshot: string) => Promise<void>;
    backupMigrationSnapshot: (_snapshot: string) => Promise<void>;
    restoreRecoverySnapshot: () => Promise<void>;
    reset: () => Promise<void>;
  };
  const adapters = new Map<string, Adapter>();
  const gates = new Map<string, ReadGate>();
  return {
    adapters,
    gates,
    adapterFor(namespace: string): Adapter {
      let adapter = adapters.get(namespace);
      if (!adapter) {
        adapter = {
          snapshot: null,
          async readSnapshot() {
            const gate = gates.get(namespace);
            if (gate) {
              gate.started();
              gates.delete(namespace);
              return gate.promise;
            }
            return adapter!.snapshot;
          },
          async readRecoverySnapshot() { return null; },
          async writeSnapshot(snapshot) { adapter!.snapshot = snapshot; },
          async quarantineSnapshot() {},
          async backupMigrationSnapshot() {},
          async restoreRecoverySnapshot() {},
          async reset() { adapter!.snapshot = null; },
        };
        adapters.set(namespace, adapter);
      }
      return adapter;
    },
    clear() {
      adapters.clear();
      gates.clear();
    },
  };
});

vi.mock("../../platform/persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../platform/persistence")>();
  return {
    ...actual,
    createPersistenceAdapter: (namespace: string) => persistenceMemory.adapterFor(namespace),
    runLegacyAccountCacheCleanup: async () => undefined,
  };
});

const subject = "synthetic-family-admin";
const sharedSummary: TrackerSummary = {
  datasetId: "0199b5a3-5720-7000-8000-000000000001",
  kind: "shared",
  name: "Synthetic family",
  role: "admin",
  membershipId: "0199b5a3-5720-7000-8000-000000000002",
  archived: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function seedActiveSharedTracker() {
  vi.resetModules();
  const store = await import("./store");
  await store.initializeTrackerRegistry();
  const personalDataset = store.getActiveTrackerStore().getState().dataset;
  expect(personalDataset).not.toBeNull();
  await store.setTrackerPrincipal({ subject, email: "admin@example.invalid" });
  expect(await store.registerCreatedOrJoinedTracker(sharedSummary, personalDataset!.preferences, subject)).toBe(true);
  return { personalDatasetId: personalDataset!.datasetId, sharedNamespace: `tracker:${sharedSummary.datasetId}:${sharedSummary.membershipId}:g1` };
}

function deferSnapshotRead(namespace: string) {
  const started = deferred<void>();
  const snapshot = deferred<string | null>();
  persistenceMemory.gates.set(namespace, { promise: snapshot.promise, started: () => started.resolve() });
  return { started: started.promise, resolve: snapshot.resolve };
}

describe("tracker store hydration publication", () => {
  beforeEach(() => {
    persistenceMemory.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("does not publish the persisted shared tracker until its snapshot hydrates", async () => {
    const { sharedNamespace } = await seedActiveSharedTracker();
    const sharedSnapshot = persistenceMemory.adapterFor(sharedNamespace).snapshot;
    expect(sharedSnapshot).not.toBeNull();

    vi.resetModules();
    const read = deferSnapshotRead(sharedNamespace);
    const store = await import("./store");
    await store.setTrackerPrincipal({ subject, email: "admin@example.invalid" });
    const initializing = store.initializeTrackerRegistry();
    await read.started;

    const loadingState = store.trackerRegistryStore.getState();
    expect(loadingState.hydration).toBe("loading");
    expect(loadingState.activeSummary?.kind).not.toBe("shared");
    expect(loadingState.activeStore.getState().hydration.status).toBe("ready");
    expect(store.getTrackerStore(sharedSummary).getState().hydration.status).toBe("loading");

    read.resolve(sharedSnapshot);
    await initializing;

    const readyState = store.trackerRegistryStore.getState();
    expect(readyState.hydration).toBe("ready");
    expect(readyState.activeSummary).toMatchObject({ kind: "shared", datasetId: sharedSummary.datasetId });
    expect(readyState.activeStore.getState().hydration.status).toBe("ready");
    expect(readyState.activeStore.getState().dataset?.datasetId).toBe(sharedSummary.datasetId);
  });

  it("falls back to personal when the account changes during shared registry hydration", async () => {
    const { sharedNamespace } = await seedActiveSharedTracker();
    const sharedSnapshot = persistenceMemory.adapterFor(sharedNamespace).snapshot;
    expect(sharedSnapshot).not.toBeNull();

    vi.resetModules();
    const read = deferSnapshotRead(sharedNamespace);
    const store = await import("./store");
    await store.setTrackerPrincipal({ subject, email: "admin@example.invalid" });
    const publishedSharedStates: string[] = [];
    const unsubscribe = store.trackerRegistryStore.subscribe(state => {
      if (state.activeSummary?.kind === "shared") publishedSharedStates.push(state.hydration);
    });
    const initializing = store.initializeTrackerRegistry();
    await read.started;

    await store.setTrackerPrincipal(null);
    read.resolve(sharedSnapshot);
    await initializing;
    unsubscribe();

    const state = store.trackerRegistryStore.getState();
    expect(publishedSharedStates).toEqual([]);
    expect(state.hydration).toBe("ready");
    expect(state.activeSummary?.kind).toBe("personal");
    expect(state.activeStore.getState().hydration.status).toBe("ready");
    expect(state.summaries.some(summary => summary.kind === "shared")).toBe(false);
  });

  it("keeps the current tracker active during selection hydration and rejects a stale account", async () => {
    const { personalDatasetId, sharedNamespace } = await seedActiveSharedTracker();
    const firstLoad = await import("./store");
    expect(await firstLoad.selectTracker(personalDatasetId)).toBe(true);

    vi.resetModules();
    const store = await import("./store");
    await store.initializeTrackerRegistry();
    await store.setTrackerPrincipal({ subject, email: "admin@example.invalid" });
    const personalSummary = store.trackerRegistryStore.getState().activeSummary;
    expect(personalSummary?.kind).toBe("personal");

    const sharedSnapshot = persistenceMemory.adapterFor(sharedNamespace).snapshot;
    expect(sharedSnapshot).not.toBeNull();
    const read = deferSnapshotRead(sharedNamespace);
    const selecting = store.selectTracker(sharedSummary.datasetId, sharedSummary.membershipId);
    await read.started;

    expect(store.trackerRegistryStore.getState().activeSummary?.kind).toBe("personal");
    expect(store.trackerRegistryStore.getState().activeStore.getState().hydration.status).toBe("ready");

    await store.setTrackerPrincipal(null);
    read.resolve(sharedSnapshot);

    expect(await selecting).toBe(false);
    expect(store.trackerRegistryStore.getState().activeSummary?.kind).toBe("personal");
    expect(store.trackerRegistryStore.getState().activeStore.getState().hydration.status).toBe("ready");
  });
});
