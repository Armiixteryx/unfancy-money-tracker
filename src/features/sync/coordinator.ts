import type { StoreApi } from "zustand";
import type { DatasetStoreState } from "../local-data/store/useLocalDatasetStore";
import type { Dataset, Category } from "../../domain/types";
import { createEmptyDataset } from "../../platform/persistence/datasetPersistence";
import { datasetEnvelopeSchema } from "../../platform/persistence/schema";
import { createUuid } from "../../platform/identifiers/createUuid";
import {
  syncChangeSchema,
  SyncClientError,
  type SyncClient,
  type SyncChange,
  type SyncConflict,
  type BootstrapResponse,
  type PushResponse,
} from "../../server/contracts/sync";
import {
  emptySyncState,
  recordKey,
  records,
  syncState,
  trackLocalChanges,
  uploadAll,
} from "./state";

export type SyncStatus =
  | "disabled"
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  | "auth_required"
  | "conflicts"
  | "different_login";
export function applyChanges(
  dataset: Dataset,
  changes: readonly SyncChange[],
  protectPending = true,
): Dataset {
  let next = dataset;
  let state = syncState(dataset);
  for (const change of changes) {
    const key = recordKey(change.recordType, change.recordId);
    state = {
      ...state,
      revisions: { ...state.revisions, [key]: change.revision },
    };
    const pending = state.outbox.some(
      (entry) =>
        recordKey(entry.change.recordType, entry.change.recordId) === key,
    );
    if (protectPending && pending) continue;
    if (change.recordType === "preference") {
      if (!change.tombstone)
        next = {
          ...next,
          preferences: {
            ...next.preferences,
            ...(change.payload as {
              baseCurrency: Dataset["preferences"]["baseCurrency"];
              selectedCurrencies: Dataset["preferences"]["selectedCurrencies"];
            }),
          },
        };
    } else {
      const field =
        change.recordType === "transaction"
          ? "transactions"
          : change.recordType === "category"
            ? "categories"
            : "budgets";
      const values = next[field].filter(
        (value) => value.id !== change.recordId,
      );
      next = {
        ...next,
        [field]: change.tombstone ? values : [...values, change.payload],
      };
      if (
        change.recordType === "category" &&
        change.tombstone &&
        !next.categoryDeletionTombstones.some(
          (value) => value.recordId === change.recordId,
        )
      )
        next = {
          ...next,
          categoryDeletionTombstones: [
            ...next.categoryDeletionTombstones,
            {
              recordType: "category",
              recordId: change.recordId,
              deletedAt: change.editedAt,
            },
          ],
        };
    }
  }
  next = { ...next, sync: state };
  if (!protectPending) return next;
  const deleted = new Set(
    next.categoryDeletionTombstones
      .filter(
        (tombstone) =>
          !next.categories.some(
            (category) => category.id === tombstone.recordId,
          ),
      )
      .map((tombstone) => tombstone.recordId),
  );
  const pending = new Set(
    state.outbox.map((entry) =>
      recordKey(entry.change.recordType, entry.change.recordId),
    ),
  );
  // Pending dependent edits keep their financial contents, while category deletion
  // still reassigns them. Freeze prior submissions and queue the adjusted version.
  const reassign = <
    T extends { id: string; categoryId: string; updatedAt: string },
  >(
    type: "transaction" | "budget",
    record: T,
    kind: "income" | "expense",
  ): T =>
    deleted.has(record.categoryId) && pending.has(recordKey(type, record.id))
      ? {
          ...record,
          categoryId: `${kind}-uncategorized`,
          updatedAt: new Date().toISOString(),
        }
      : record;
  const reassigned = {
    ...next,
    transactions: next.transactions.map((record) =>
      reassign("transaction", record, record.type),
    ),
    budgets: next.budgets.map((record) =>
      reassign("budget", record, "expense"),
    ),
  };
  return trackLocalChanges(next, reassigned);
}

export class SyncCoordinator {
  status: SyncStatus = "disabled";
  private running: Promise<void> | null = null;
  private controller = new AbortController();
  private generation = 0;
  private listeners = new Set<() => void>();
  private authenticated = false;
  private online = true;
  private pausedAuth = false;
  constructor(
    private readonly store: StoreApi<DatasetStoreState>,
    private readonly client: SyncClient,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private setStatus(status: SyncStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener());
  }
  cancel() {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
  }
  authenticationChanged(signedIn: boolean) {
    this.cancel();
    this.authenticated = signedIn;
    this.pausedAuth = false;
    this.setStatus(signedIn ? "idle" : "auth_required");
    const generation = this.generation;
    if (signedIn && this.running)
      void this.running.then(() => {
        if (generation === this.generation) void this.run();
      });
  }
  setOnline(online: boolean) {
    this.online = online;
    if (!online) {
      this.cancel();
      this.setStatus("offline");
    } else void this.run();
  }
  private dataset() {
    const state = this.store.getState();
    if (!state.dataset || state.saveStatus !== "idle")
      throw new SyncClientError("local_save_failed");
    return state.dataset;
  }
  private check(generation: number) {
    if (
      generation !== this.generation ||
      this.controller.signal.aborted ||
      !this.authenticated
    )
      throw new DOMException("Canceled", "AbortError");
  }
  private async update(
    transform: (dataset: Dataset) => Dataset,
    generation: number,
    replace = false,
  ) {
    this.check(generation);
    if (!(await this.store.getState().updateFromSync(transform, replace)))
      throw new SyncClientError("local_save_failed");
  }
  async inspect(): Promise<BootstrapResponse> {
    if (!this.authenticated) throw new SyncClientError("unauthenticated");
    const generation = this.generation;
    const result = await this.client.bootstrap(this.controller.signal);
    this.check(generation);
    const binding = syncState(this.dataset()).binding;
    if (binding && binding.owner !== result.ownerSubject) {
      this.setStatus("different_login");
      throw new SyncClientError("different_login");
    }
    return result;
  }
  async enable(
    mode: "upload" | "merge" | "replace",
    bootstrap: BootstrapResponse,
  ) {
    const generation = this.generation;
    const fresh = await this.inspect();
    if (
      fresh.datasetId !== bootstrap.datasetId ||
      fresh.ownerSubject !== bootstrap.ownerSubject
    )
      throw new SyncClientError("different_login");
    const existing = syncState(this.dataset());
    if (existing.binding) {
      await this.update(
        (current) => ({
          ...current,
          sync: { ...syncState(current), enabled: true },
        }),
        generation,
      );
      await this.run();
      return;
    }
    if (mode === "upload" && !fresh.empty)
      throw new SyncClientError("invalid_request");
    if (mode !== "replace") {
      const candidate = uploadAll(this.dataset(), emptySyncState());
      if (
        candidate.sync!.outbox.some(
          (entry) => !syncChangeSchema.safeParse(entry.change).success,
        )
      )
        throw new SyncClientError("local_reset_required");
    }
    const binding = { owner: fresh.ownerSubject, datasetId: fresh.datasetId };
    if (mode === "upload") {
      await this.update(
        (current) =>
          uploadAll(current, { ...emptySyncState(), enabled: true, binding }),
        generation,
      );
    } else {
      const downloaded = await this.download(fresh.datasetId, generation);
      // Check the local snapshot at commit time. Local edits during download are included by merge.
      await this.update(
        (local) => {
          const state = { ...syncState(downloaded), binding, enabled: true };
          const cloud = {
            ...downloaded,
            preferences: {
              ...local.preferences,
              baseCurrency: downloaded.preferences.baseCurrency,
              selectedCurrencies: downloaded.preferences.selectedCurrencies,
            },
            sync: state,
          };
          if (mode === "replace") return cloud;
          const cloudRecords = records(cloud);
          const merged: Dataset = {
            ...local,
            datasetId: cloud.datasetId,
            preferences: cloud.preferences,
            categories: combine(cloud.categories, local.categories),
            transactions: combine(cloud.transactions, local.transactions),
            budgets: combine(cloud.budgets, local.budgets),
            sync: state,
          };
          const upload = uploadAll(merged, state);
          return {
            ...merged,
            sync: {
              ...upload.sync!,
              outbox: upload
                .sync!.outbox.filter((entry) => {
                  const prior = cloudRecords.get(
                    recordKey(entry.change.recordType, entry.change.recordId),
                  );
                  if (!prior) return true;
                  if (
                    entry.change.recordType === "category" &&
                    (entry.change.payload as Category).isSystem
                  )
                    return false;
                  return (
                    JSON.stringify(prior.payload) !==
                    JSON.stringify(entry.change.payload)
                  );
                })
                .map((entry) => ({
                  ...entry,
                  change: { ...entry.change, baseRevision: 0 },
                })),
            },
          };
        },
        generation,
        mode === "replace",
      );
    }
    if (generation === this.generation) await this.run();
  }
  private async download(
    datasetId: string,
    generation: number,
  ): Promise<Dataset> {
    let dataset = {
      ...createEmptyDataset(),
      datasetId,
      categories: [] as Category[],
      sync: emptySyncState(),
    };
    let cursor = "0";
    for (;;) {
      const response = await this.client.pull(
        { datasetId, cursor },
        this.controller.signal,
      );
      this.check(generation);
      if (response.hasMore && response.cursor === cursor)
        throw new SyncClientError("server_error");
      dataset = applyChanges(
        dataset,
        response.changes,
        false,
      ) as typeof dataset;
      cursor = response.cursor;
      if (!response.hasMore) break;
    }
    return validateDataset({
      ...dataset,
      sync: { ...syncState(dataset), cursor },
    });
  }
  run(manual = false): Promise<void> {
    if (manual) this.pausedAuth = false;
    if (this.pausedAuth) return Promise.resolve();
    if (this.running) return this.running;
    const state = this.store.getState();
    if (!state.dataset || !syncState(state.dataset).enabled) {
      this.setStatus("disabled");
      return Promise.resolve();
    }
    if (!this.authenticated) {
      this.setStatus("auth_required");
      return Promise.resolve();
    }
    if (!this.online) {
      this.setStatus("offline");
      return Promise.resolve();
    }
    if (state.saveStatus !== "idle") return Promise.resolve();
    const generation = this.generation;
    this.running = this.execute(generation)
      .catch((error) => {
        if (generation !== this.generation) return;
        if (
          error instanceof SyncClientError &&
          error.code === "unauthenticated"
        )
          this.pausedAuth = true;
        this.setStatus(
          error instanceof SyncClientError && error.code === "unauthenticated"
            ? "auth_required"
            : error instanceof SyncClientError &&
                error.code === "different_login"
              ? "different_login"
              : error instanceof SyncClientError && error.code === "offline"
                ? "offline"
                : "error",
        );
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }
  private async retry<T>(
    operation: () => Promise<T>,
    generation: number,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      this.check(generation);
      try {
        return await operation();
      } catch (error) {
        if (
          attempt >= 2 ||
          !(error instanceof SyncClientError) ||
          !["offline", "server_error"].includes(error.code)
        )
          throw error;
        await new Promise<void>((resolve, reject) => {
          const signal = this.controller.signal;
          const abort = () => {
            clearTimeout(timer);
            reject(new DOMException("Canceled", "AbortError"));
          };
          const timer = setTimeout(
            () => {
              signal.removeEventListener("abort", abort);
              resolve();
            },
            500 * 2 ** attempt,
          );
          signal.addEventListener("abort", abort, { once: true });
        });
      }
    }
  }
  private async execute(generation: number) {
    this.setStatus("syncing");
    await this.retry(() => this.inspect(), generation);
    for (;;) {
      const dataset = this.dataset();
      const state = syncState(dataset);
      const blocked = new Set(
        state.conflicts.map((conflict) =>
          recordKey(conflict.recordType, conflict.recordId),
        ),
      );
      const blockedCategories = new Set(
        state.conflicts
          .map((conflict) => conflict.categoryDeletionId)
          .filter(Boolean),
      );
      const ready = state.outbox
        .filter(
          (entry) =>
            (!blockedCategories.has(
              entry.change.recordType === "category" && entry.change.tombstone
                ? entry.change.recordId
                : undefined,
            ) &&
              !blocked.has(
                recordKey(entry.change.recordType, entry.change.recordId),
              )) ||
            entry.resolution,
        )
        .sort((a, b) => rank(a.change) - rank(b.change));
      if (!ready.length) break;
      // Dependent unsent work cannot pass an immutable submitted edit to the same record.
      const seen = new Set<string>();
      const batch = ready
        .filter((entry) => {
          const key = recordKey(entry.change.recordType, entry.change.recordId);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 20);
      const resolution = batch.find((entry) => entry.resolution);
      const submitted = resolution ? [resolution] : batch;
      const ids = new Set(submitted.map((entry) => entry.change.mutationId));
      await this.update(
        (current) => ({
          ...current,
          sync: {
            ...syncState(current),
            outbox: syncState(current).outbox.map((entry) =>
              ids.has(entry.change.mutationId)
                ? { ...entry, submitted: true }
                : entry,
            ),
          },
        }),
        generation,
      );
      const response = await this.retry(
        () =>
          resolution
            ? this.client.resolveConflict(
                {
                  datasetId: state.binding!.datasetId,
                  conflict: resolution.resolution!.conflict,
                  choice: resolution.resolution!.choice,
                  mutationId: resolution.change.mutationId,
                  editedAt: resolution.change.editedAt,
                },
                this.controller.signal,
              )
            : this.client.push(
                {
                  datasetId: state.binding!.datasetId,
                  changes: batch.map((entry) => entry.change),
                },
                this.controller.signal,
              ),
        generation,
      );
      await this.update(
        (current) =>
          acknowledge(
            current,
            response,
            submitted.map((entry) => entry.change),
          ),
        generation,
      );
      if (!response.acknowledgedChanges.length && !response.conflicts.length)
        throw new SyncClientError("server_error");
    }
    let pageCursor = syncState(this.dataset()).cursor;
    const changes: SyncChange[] = [];
    for (;;) {
      const state = syncState(this.dataset());
      const page = await this.retry(
        () =>
          this.client.pull(
            { datasetId: state.binding!.datasetId, cursor: pageCursor },
            this.controller.signal,
          ),
        generation,
      );
      this.check(generation);
      if (page.hasMore && page.cursor === pageCursor)
        throw new SyncClientError("server_error");
      changes.push(...page.changes);
      pageCursor = page.cursor;
      if (!page.hasMore) break;
    }
    // Apply a complete paginated download atomically; intermediate pages can have dangling references.
    await this.update((current) => {
      const applied = applyChanges(current, changes);
      return validateDataset({
        ...applied,
        sync: {
          ...syncState(applied),
          cursor: pageCursor,
          lastSyncedAt: new Date().toISOString(),
        },
      });
    }, generation);
    this.setStatus(
      syncState(this.dataset()).conflicts.length ? "conflicts" : "idle",
    );
  }
  async resolve(conflict: SyncConflict, choice: "keep_local" | "keep_cloud") {
    const generation = this.generation;
    await this.update((current) => {
      const state = syncState(current);
      const key = recordKey(conflict.recordType, conflict.recordId);
      const latest = state.outbox
        .filter(
          (entry) =>
            recordKey(entry.change.recordType, entry.change.recordId) === key,
        )
        .at(-1)?.change;
      const localPayload = latest?.payload ?? conflict.localPayload;
      const localDeleted = latest?.tombstone ?? conflict.localDeleted;
      const observed = { ...conflict, localPayload, localDeleted };
      const change: SyncChange = {
        mutationId: createUuid(),
        recordType: conflict.recordType,
        recordId: conflict.recordId,
        baseRevision: conflict.cloudRevision,
        payload: localPayload,
        tombstone: localDeleted,
        operation: localDeleted ? "delete" : "upsert",
        editedAt: new Date().toISOString(),
        revision: 0,
        committedAt: null,
      };
      return {
        ...current,
        sync: {
          ...state,
          outbox: [
            ...state.outbox.filter(
              (entry) =>
                recordKey(entry.change.recordType, entry.change.recordId) !==
                key,
            ),
            {
              change,
              submitted: false,
              resolution: { conflict: observed, choice },
            },
          ],
        },
      };
    }, generation);
    await this.run();
  }
}
function combine<T extends { id: string }>(
  cloud: readonly T[],
  local: readonly T[],
): T[] {
  return [
    ...local,
    ...cloud.filter((record) => !local.some((value) => value.id === record.id)),
  ];
}
export function validateDataset(dataset: Dataset): Dataset {
  const parsed = datasetEnvelopeSchema.parse(dataset) as Dataset;
  for (const transaction of parsed.transactions)
    if (
      !parsed.categories.some(
        (category) =>
          category.id === transaction.categoryId &&
          category.kind === transaction.type,
      )
    )
      throw new SyncClientError("server_error");
  for (const budget of parsed.budgets)
    if (
      !parsed.categories.some(
        (category) =>
          category.id === budget.categoryId && category.kind === "expense",
      )
    )
      throw new SyncClientError("server_error");
  return parsed;
}
export function acknowledge(
  dataset: Dataset,
  response: PushResponse,
  submitted: readonly SyncChange[],
): Dataset {
  const state = syncState(dataset);
  const revisions = { ...state.revisions };
  const accepted = new Set(
    response.acknowledgedChanges.map((value) => value.mutationId),
  );
  const outbox = state.outbox
    .filter((entry) => !accepted.has(entry.change.mutationId))
    .map((entry) =>
      response.conflicts.some(
        (conflict) => conflict.mutationId === entry.change.mutationId,
      )
        ? { change: entry.change, submitted: true }
        : { ...entry },
    );
  for (const acknowledgment of response.acknowledgedChanges) {
    const key = recordKey(acknowledgment.recordType, acknowledgment.recordId);
    revisions[key] = acknowledgment.revision;
    const subsequent = outbox.find(
      (entry) =>
        !entry.submitted &&
        recordKey(entry.change.recordType, entry.change.recordId) === key,
    );
    if (subsequent)
      subsequent.change = {
        ...subsequent.change,
        baseRevision: acknowledgment.revision,
      };
  }
  const resolvedKeys = new Set(
    submitted
      .filter((change) => accepted.has(change.mutationId))
      .map((change) => recordKey(change.recordType, change.recordId)),
  );
  const conflicts = state.conflicts.filter(
    (conflict) =>
      !resolvedKeys.has(recordKey(conflict.recordType, conflict.recordId)) &&
      !response.conflicts.some(
        (value) =>
          value.recordType === conflict.recordType &&
          value.recordId === conflict.recordId,
      ),
  );
  return {
    ...dataset,
    sync: {
      ...state,
      outbox,
      revisions,
      conflicts: [
        ...conflicts,
        ...new Map(
          response.conflicts.map((conflict) => [
            recordKey(conflict.recordType, conflict.recordId),
            conflict,
          ]),
        ).values(),
      ],
    },
  };
}

function rank(change: SyncChange) {
  return change.recordType === "category"
    ? change.tombstone
      ? 3
      : 0
    : change.recordType === "transaction"
      ? 1
      : 2;
}
