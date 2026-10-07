import { describe, expect, it, vi } from "vitest";
import { createDatasetStore } from "../local-data/store/useLocalDatasetStore";
import {
  DatasetPersistence,
  MemoryPersistenceAdapter,
  createEmptyDataset,
} from "../../platform/persistence";
import { SyncCoordinator, acknowledge, applyChanges } from "./coordinator";
import {
  emptySyncState,
  recordKey,
  syncState,
  trackLocalChanges,
  uploadAll,
} from "./state";
import { createUuid } from "../../platform/identifiers/createUuid";
import {
  SyncClientError,
  type SyncClient,
  type SyncChange,
  type PushRequest,
  type PullRequest,
  type PushResponse,
  type ResolveConflictRequest,
} from "../../server/contracts/sync";
const now = "2026-10-04T00:00:00.000Z";
const input = {
  amount: "12.5",
  currency: "USD" as const,
  type: "expense" as const,
  categoryId: "expense-food",
  description: "Synthetic record",
  date: "2026-10-04",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class MemoryCloud implements SyncClient {
  owner = "synthetic-subject";
  datasetId = createUuid();
  changes: SyncChange[] = [];
  bootstrap = vi.fn(async () => ({
    ownerSubject: this.owner,
    datasetId: this.datasetId,
    empty: this.changes.length === 0,
  }));
  push = vi.fn(async (request: PushRequest): Promise<PushResponse> => {
    const acknowledgedChanges = [];
    for (const change of request.changes) {
      const previous = this.changes.find(
        (value) => value.mutationId === change.mutationId,
      );
      const accepted = previous ?? {
        ...change,
        revision: this.changes.length + 1,
        committedAt: now,
      };
      if (!previous) this.changes.push(accepted);
      acknowledgedChanges.push({
        mutationId: change.mutationId,
        recordType: change.recordType,
        recordId: change.recordId,
        revision: accepted.revision,
        committedAt: now,
      });
    }
    return { acknowledgedChanges, conflicts: [] };
  });
  pull = vi.fn(async (request: PullRequest) => {
    const changes = this.changes.filter(
      (change) => change.revision > Number(request.cursor),
    );
    return { changes, cursor: String(this.changes.length), hasMore: false };
  });
  resolveConflict = vi.fn(
    async (_request: ResolveConflictRequest): Promise<PushResponse> => ({
      acknowledgedChanges: [],
      conflicts: [],
    }),
  );
}
async function setup(
  client = new MemoryCloud(),
  adapter = new MemoryPersistenceAdapter(),
) {
  const store = createDatasetStore(
    new DatasetPersistence(adapter),
    async () => {},
  );
  await store.getState().initialize();
  const coordinator = new SyncCoordinator(store, client);
  coordinator.authenticationChanged(true);
  return { store, client, coordinator, adapter };
}
async function enabled() {
  const result = await setup();
  await result.coordinator.enable("upload", await result.coordinator.inspect());
  return result;
}

describe("durable client sync", () => {
  it("uploads only after opt-in, keeps built-ins unique, and never advances the pull cursor from push", async () => {
    const { store, client, coordinator } = await setup();
    await store.getState().addTransaction(input);
    await coordinator.run();
    expect(client.push).not.toHaveBeenCalled();
    await coordinator.enable("upload", await coordinator.inspect());
    expect(
      client.changes.filter((change) => change.recordType === "category"),
    ).toHaveLength(12);
    expect(syncState(store.getState().dataset!).outbox).toHaveLength(0);
    expect(syncState(store.getState().dataset!).cursor).toBe("14");
    const state = { ...emptySyncState(), cursor: "4" };
    const updated = acknowledge(
      { ...createEmptyDataset(), sync: state },
      {
        acknowledgedChanges: [
          {
            mutationId: createUuid(),
            recordType: "transaction",
            recordId: createUuid(),
            revision: 100,
            committedAt: now,
          },
        ],
        conflicts: [],
      },
      [],
    );
    expect(updated.sync?.cursor).toBe("4");
  });
  it("coalesces unsent edits while preserving their original base revision", async () => {
    const { store } = await enabled();
    const result = await store.getState().addTransaction(input);
    if (!result.ok) throw new Error("Fixture failed");
    await store
      .getState()
      .editTransaction(result.value.id, { ...input, amount: "13" });
    await store
      .getState()
      .editTransaction(result.value.id, { ...input, amount: "14" });
    const pending = syncState(store.getState().dataset!).outbox;
    expect(pending).toHaveLength(1);
    expect(pending[0]?.change.baseRevision).toBe(0);
    expect((pending[0]?.change.payload as { amount: string }).amount).toBe(
      "14",
    );
  });
  it("freezes submitted mutations and sends edits made during a request as separate work", async () => {
    const { store, client, coordinator } = await enabled();
    const added = await store.getState().addTransaction(input);
    if (!added.ok) throw new Error("Fixture failed");
    const gate = deferred<void>();
    const entered = deferred<void>();
    const push = client.push.getMockImplementation()!;
    client.push.mockImplementationOnce(async (request) => {
      entered.resolve();
      await gate.promise;
      return push(request);
    });
    const running = coordinator.run();
    await entered.promise;
    const original = syncState(store.getState().dataset!).outbox[0]!.change;
    await store
      .getState()
      .editTransaction(added.value.id, { ...input, amount: "14" });
    const pending = syncState(store.getState().dataset!).outbox;
    expect(pending).toHaveLength(2);
    expect(pending[0]?.change).toEqual(original);
    gate.resolve();
    await running;
    const remote = client.changes.filter(
      (change) => change.recordId === added.value.id,
    );
    expect(remote).toHaveLength(2);
    expect(remote[1]?.baseRevision).toBe(remote[0]?.revision);
    expect(store.getState().dataset!.transactions[0]?.amount).toBe("14");
    expect(syncState(store.getState().dataset!).outbox).toHaveLength(0);
  });
  it("never uploads a failed local save and uploads it only after a successful retry", async () => {
    const { store, client, coordinator, adapter } = await enabled();
    const previous = client.push.mock.calls.length;
    vi.spyOn(adapter, "writeSnapshot").mockRejectedValueOnce(
      new Error("synthetic write failure"),
    );
    expect((await store.getState().addTransaction(input)).ok).toBe(false);
    await coordinator.run();
    expect(client.push.mock.calls.length).toBe(previous);
    await store.getState().retryLocalSave();
    await coordinator.run();
    expect(
      client.changes.filter((change) => change.recordType === "transaction"),
    ).toHaveLength(1);
  });
  it("keeps unrelated unsent edits mutable during an in-flight resolution", async () => {
    const { store, client, coordinator } = await enabled();
    const added = await store.getState().addTransaction(input);
    if (!added.ok) throw new Error("Fixture failed");
    const preferences = { baseCurrency: "USD", selectedCurrencies: ["USD"] };
    const conflict = {
      mutationId: createUuid(),
      recordType: "preference" as const,
      recordId: "currency",
      cloudRecordId: "currency",
      localRevision: 0,
      cloudRevision: 13,
      localPayload: preferences,
      cloudPayload: preferences,
      localDeleted: false,
      cloudDeleted: false,
      localEditedAt: now,
      cloudEditedAt: now,
      cloudCommittedAt: now,
      reason: "concurrent_edit" as const,
      resolution: "pending" as const,
    };
    const gate = deferred<void>();
    const entered = deferred<void>();
    client.resolveConflict.mockImplementationOnce(async () => {
      const entry = syncState(store.getState().dataset!).outbox.find(
        (value) => value.resolution,
      )!;
      entered.resolve();
      await gate.promise;
      return client.push({
        datasetId: client.datasetId,
        changes: [entry.change],
      });
    });
    const running = coordinator.resolve(conflict, "keep_local");
    await entered.promise;
    const pending = syncState(store.getState().dataset!).outbox.find(
      (entry) => entry.change.recordId === added.value.id,
    )!;
    expect(pending.submitted).toBe(false);
    await store
      .getState()
      .editTransaction(added.value.id, { ...input, amount: "14" });
    const edited = syncState(store.getState().dataset!).outbox.filter(
      (entry) => entry.change.recordId === added.value.id,
    );
    expect(edited).toHaveLength(1);
    expect(edited[0]?.submitted).toBe(false);
    expect(edited[0]?.change.payload).toMatchObject({ amount: "14" });
    gate.resolve();
    await running;
    expect(
      client.changes.filter((change) => change.recordId === added.value.id),
    ).toHaveLength(1);
    expect(store.getState().dataset!.transactions[0]?.amount).toBe("14");
  });
  it("retains pending data through offline restart and logout, then resumes the same login", async () => {
    const { store, client, adapter, coordinator } = await enabled();
    coordinator.authenticationChanged(false);
    await store.getState().addTransaction(input);
    const pending = syncState(store.getState().dataset!).outbox;
    const restart = await setup(client, adapter);
    restart.coordinator.authenticationChanged(false);
    await restart.coordinator.run();
    expect(syncState(restart.store.getState().dataset!).outbox).toEqual(
      pending,
    );
    restart.coordinator.authenticationChanged(true);
    restart.coordinator.setOnline(false);
    await restart.coordinator.run();
    expect(restart.coordinator.status).toBe("offline");
    restart.coordinator.setOnline(true);
    await restart.coordinator.run();
    expect(syncState(restart.store.getState().dataset!).outbox).toHaveLength(0);
  });
  it("pauses automatic retry on authentication expiry", async () => {
    const { store, client, coordinator } = await enabled();
    await store.getState().addTransaction(input);
    client.push.mockRejectedValueOnce(new SyncClientError("unauthenticated"));
    await coordinator.run();
    expect(coordinator.status).toBe("auth_required");
    const calls = client.push.mock.calls.length;
    await coordinator.run();
    expect(client.push.mock.calls.length).toBe(calls);
    expect(syncState(store.getState().dataset!).outbox).toHaveLength(1);
    coordinator.authenticationChanged(true);
    await coordinator.run();
    expect(syncState(store.getState().dataset!).outbox).toHaveLength(0);
  });
  it("requires a local reset before another login can connect", async () => {
    const { store, client, coordinator } = await enabled();
    await store.getState().addTransaction(input);
    client.owner = "other-synthetic-subject";
    coordinator.authenticationChanged(true);
    const calls = client.push.mock.calls.length;
    await coordinator.run();
    expect(coordinator.status).toBe("different_login");
    expect(client.push.mock.calls.length).toBe(calls);
    expect(syncState(store.getState().dataset!).outbox).toHaveLength(1);
    await store.getState().resetLocalData();
    expect(syncState(store.getState().dataset!).binding).toBeNull();
    expect(client.changes.length).toBeGreaterThan(0);
  });
  it("does not replace a durable local snapshot after an interrupted download", async () => {
    const { store, client, coordinator, adapter } = await setup();
    await store.getState().addTransaction(input);
    client.changes = uploadAll(
      createEmptyDataset(),
      emptySyncState(),
    ).sync!.outbox.map((entry, index) => ({
      ...entry.change,
      revision: index + 1,
      committedAt: now,
    }));
    const original = await adapter.readSnapshot();
    client.pull.mockRejectedValueOnce(new SyncClientError("offline"));
    await expect(
      coordinator.enable("replace", await coordinator.inspect()),
    ).rejects.toThrow();
    expect(await adapter.readSnapshot()).toBe(original);
    expect(store.getState().dataset!.transactions).toHaveLength(1);
  });
  it("validates a complete replacement and retains device-only preferences", async () => {
    const { store, client, coordinator } = await setup();
    await store.getState().setPreferences({
      language: "es",
      theme: "dark",
      analyticsConsent: true,
      firstRunNoticeDismissed: true,
    });
    await store.getState().addTransaction(input);
    const remote = {
      ...createEmptyDataset(),
      preferences: {
        ...createEmptyDataset().preferences,
        baseCurrency: "COP" as const,
        selectedCurrencies: ["COP" as const],
      },
    };
    client.changes = uploadAll(remote, emptySyncState()).sync!.outbox.map(
      (entry, index) => ({
        ...entry.change,
        revision: index + 1,
        committedAt: now,
      }),
    );
    const epoch = store.getState().datasetEpoch;
    await coordinator.enable("replace", await coordinator.inspect());
    expect(store.getState().dataset!.transactions).toHaveLength(0);
    expect(store.getState().dataset!.preferences).toMatchObject({
      language: "es",
      theme: "dark",
      analyticsConsent: true,
      firstRunNoticeDismissed: true,
      baseCurrency: "COP",
    });
    expect(store.getState().datasetEpoch).toBe(epoch + 1);
  });
  it("merges distinct custom categories and transactions without duplicate system categories", async () => {
    const cloud = await enabled();
    await cloud.store.getState().addTransaction(input);
    await cloud.coordinator.run();
    const second = await setup(cloud.client);
    await second.store
      .getState()
      .addCategory({ kind: "expense", name: "Synthetic distinct category" });
    await second.store.getState().addTransaction({ ...input, amount: "13" });
    await second.coordinator.enable(
      "merge",
      await second.coordinator.inspect(),
    );
    expect(second.store.getState().dataset!.transactions).toHaveLength(2);
    expect(second.store.getState().dataset!.categories).toHaveLength(13);
  });
  it("ignores stale network responses after reset or auth changes", async () => {
    const { store, client, coordinator } = await enabled();
    await store.getState().addTransaction(input);
    const gate = deferred<void>();
    const entered = deferred<void>();
    const push = client.push.getMockImplementation()!;
    client.push.mockImplementationOnce(async (request) => {
      entered.resolve();
      await gate.promise;
      return push(request);
    });
    const running = coordinator.run();
    await entered.promise;
    coordinator.cancel();
    await store.getState().resetLocalData();
    gate.resolve();
    await running;
    expect(store.getState().dataset!.transactions).toHaveLength(0);
    expect(syncState(store.getState().dataset!).binding).toBeNull();
  });
  it("keeps rejected shared mutations immutable, stops automatic retry, and allows an explicit retry", async () => {
    const { store, client, coordinator } = await enabled();
    const added = await store.getState().addTransaction(input);
    if (!added.ok) throw new Error("Fixture failed");
    const original = syncState(store.getState().dataset!).outbox.find(entry => entry.change.recordId === added.value.id)!.change;
    client.push.mockResolvedValueOnce({
      acknowledgedChanges: [], conflicts: [],
      rejectedChanges: [{ mutationId: original.mutationId, code: "permission_denied" }],
    } as PushResponse);

    await coordinator.run();
    const rejected = syncState(store.getState().dataset!).outbox.find(entry => entry.change.mutationId === original.mutationId)!;
    expect(rejected).toMatchObject({ submitted: true, rejection: "permission_denied", change: original });
    expect(coordinator.status).toBe("rejected");
    const calls = client.push.mock.calls.length;
    await coordinator.run();
    expect(client.push.mock.calls.length).toBe(calls);

    await coordinator.run(true);
    expect(client.push.mock.calls.length).toBe(calls + 1);
    expect(syncState(store.getState().dataset!).outbox.some(entry => entry.change.mutationId === original.mutationId)).toBe(false);
  });
  it("keeps device preferences out of the outbox and preserves server ordering under clock skew", () => {
    const original = {
      ...createEmptyDataset(),
      sync: {
        ...emptySyncState(),
        binding: { owner: "synthetic", datasetId: createUuid() },
        enabled: true,
      },
    };
    const changed = trackLocalChanges(original, {
      ...original,
      preferences: {
        ...original.preferences,
        theme: "dark",
        language: "es",
        analyticsConsent: true,
        firstRunNoticeDismissed: true,
      },
    });
    expect(changed.sync!.outbox).toHaveLength(0);
    const change = uploadAll(original, emptySyncState()).sync!.outbox[0]!
      .change;
    const applied = applyChanges(original, [
      {
        ...change,
        revision: 42,
        editedAt: "2000-01-01T00:00:00.000Z",
        committedAt: now,
      },
    ]);
    expect(
      applied.sync!.revisions[recordKey(change.recordType, change.recordId)],
    ).toBe(42);
    expect(createUuid().split("-")[2]?.startsWith("7")).toBe(true);
  });
});
