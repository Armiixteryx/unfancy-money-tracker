import { create, useStore, type StoreApi, type UseBoundStore } from "zustand";
import { z } from "zod";

import type { Dataset, Preferences, Transaction } from "../../domain/types";
import { createEmptyDataset, DatasetPersistence } from "../../platform/persistence/datasetPersistence";
import { syncState } from "../sync/state";
import { createPersistenceAdapter, runLegacyAccountCacheCleanup } from "../../platform/persistence";
import type { PersistenceAdapter } from "../../platform/persistence/types";
import { trackerSummarySchema, type TrackerSummary } from "../../server/contracts/trackers";
import type { DatasetStoreState, DevicePreferences, MutationResult, TrackerPrincipal } from "../local-data/store/datasetStore";
import { createDatasetStore } from "../local-data/store/datasetStore";

const registrySchema = z.object({
  schemaVersion: z.literal(1),
  personalDatasetId: z.string().uuid(),
  personalGeneration: z.number().int().positive(),
  activeDatasetId: z.string().uuid(),
  activeMembershipId: z.string().uuid().nullable(),
  sharedTrackers: z.array(trackerSummarySchema),
  inaccessible: z.array(z.object({
    datasetId: z.string().uuid(),
    membershipId: z.string().uuid(),
    name: z.string().min(1).max(80),
    accountSubject: z.string().min(1),
    generation: z.number().int().positive(),
    removedAt: z.string().datetime(),
  }).strict()),
  membershipGenerations: z.record(z.string(), z.number().int().positive()),
  targetGenerations: z.record(z.string(), z.number().int().positive()).default({}),
  ownerSubject: z.string().nullable(),
  devicePreferences: z.object({
    language: z.enum(["system", "en", "es"]),
    theme: z.enum(["system", "light", "dark"]),
    analyticsConsent: z.boolean(),
    firstRunNoticeDismissed: z.boolean(),
  }).strict(),
  sharedNoticeAcceptedAt: z.string().datetime().nullable(),
}).strict();

export type InaccessibleTrackerCopy = z.infer<typeof registrySchema>["inaccessible"][number];
export type TrackerRegistry = z.infer<typeof registrySchema>;
export type VoiceTarget = {
  datasetId: string;
  name: string;
  membershipId: string | null;
  generation: number;
  writable: boolean;
  kind: "personal" | "shared";
  dataset: Dataset;
};
type DatasetStore = UseBoundStore<StoreApi<DatasetStoreState>>;
type StoreRecord = { key: string; summary: TrackerSummary; generation: number; namespaceGeneration: number; ownerSubject: string | null; store: DatasetStore };

const registryAdapter = createPersistenceAdapter("tracker-registry");
const anonymousAdapter = createPersistenceAdapter("anonymous");
let account: TrackerPrincipal = null;
let initPromise: Promise<void> | null = null;
let cleanupPromise: Promise<void> | null = null;
const storeRecords = new Map<string, StoreRecord>();
const summaryRecords = new Map<string, TrackerSummary>();
const defaultDevicePreferences: DevicePreferences = {
  language: "system",
  theme: "system",
  analyticsConsent: false,
  firstRunNoticeDismissed: false,
};

function storeKey(summary: TrackerSummary): string {
  return summary.kind === "personal"
    ? `personal:${summary.datasetId}`
    : `shared:${summary.datasetId}:${summary.membershipId}`;
}

function storageNamespace(summary: TrackerSummary, generation: number): string {
  return summary.kind === "personal"
    ? "anonymous"
    : `tracker:${summary.datasetId}:${summary.membershipId}:g${generation}`;
}

function storeRecordKey(summary: TrackerSummary, generation: number): string {
  return `${storeKey(summary)}:g${generation}`;
}

function personalSummary(datasetId: string): TrackerSummary {
  return trackerSummarySchema.parse({
    datasetId,
    kind: "personal",
    name: "Personal",
    role: "admin",
    membershipId: null,
    archived: false,
  });
}

const uninitializedPersonalSummary = personalSummary("00000000-0000-7000-8000-000000000000");

function initialRegistry(dataset: Dataset): TrackerRegistry {
  return registrySchema.parse({
    schemaVersion: 1,
    personalDatasetId: dataset.datasetId,
    personalGeneration: 1,
    activeDatasetId: dataset.datasetId,
    activeMembershipId: null,
    sharedTrackers: [],
    inaccessible: [],
    membershipGenerations: {},
    targetGenerations: {},
    ownerSubject: null,
    devicePreferences: {
      language: dataset.preferences.language,
      theme: dataset.preferences.theme,
      analyticsConsent: dataset.preferences.analyticsConsent,
      firstRunNoticeDismissed: dataset.preferences.firstRunNoticeDismissed,
    },
    sharedNoticeAcceptedAt: null,
  });
}

function activeSummary(registry: TrackerRegistry, subject: string | null): TrackerSummary {
  if (registry.activeMembershipId && registry.ownerSubject === subject) {
    const shared = registry.sharedTrackers.find(value =>
      value.datasetId === registry.activeDatasetId && value.membershipId === registry.activeMembershipId,
    );
    if (shared) return shared;
  }
  return personalSummary(registry.personalDatasetId);
}

function namespaceGenerationFor(registry: TrackerRegistry, summary: TrackerSummary): number {
  if (summary.kind === "personal") return 1;
  return registry.membershipGenerations[`${summary.datasetId}:${summary.membershipId}`] ?? 1;
}

function generationFor(registry: TrackerRegistry, summary: TrackerSummary): number {
  if (summary.kind === "personal") return registry.personalGeneration;
  return registry.targetGenerations[`${summary.datasetId}:${summary.membershipId}`] ?? 1;
}

function currentTargetGeneration(summary: TrackerSummary): number {
  const registry = trackerRegistryStore.getState().registry;
  return registry ? generationFor(registry, summary) : 1;
}

async function invalidateTarget(summary: TrackerSummary, record?: StoreRecord): Promise<void> {
  const registry = trackerRegistryStore.getState().registry;
  if (!registry) return;
  const key = `${summary.datasetId}:${summary.membershipId}`;
  const next = summary.kind === "personal"
    ? { ...registry, personalGeneration: registry.personalGeneration + 1 }
    : { ...registry, targetGenerations: { ...registry.targetGenerations, [key]: generationFor(registry, summary) + 1 } };
  if (record) record.generation = generationFor(next, summary);
  // Publish before the durable write so already-captured targets fail closed.
  trackerRegistryStore.setState({ registry: next });
  if (!await persistRegistry(next)) throw new Error("Could not invalidate tracker target");
}

function targetIsCurrent(summary: TrackerSummary, generation: number, ownerSubject: string | null): boolean {
  const registry = trackerRegistryStore.getState().registry;
  if (!registry || generationFor(registry, summary) !== generation) return false;
  if (summary.kind === "personal") return summary.datasetId === registry.personalDatasetId;
  return !!ownerSubject && account?.subject === ownerSubject && registry.ownerSubject === ownerSubject &&
    registry.sharedTrackers.some(value => value.datasetId === summary.datasetId && value.membershipId === summary.membershipId);
}

async function persistRegistry(next: TrackerRegistry): Promise<boolean> {
  try {
    const validated = registrySchema.parse(next);
    await registryPersistence.save(validated);
    trackerRegistryStore.setState({ registry: validated, error: null });
    return true;
  } catch {
    trackerRegistryStore.setState({ error: "tracker_registry_save_failed" });
    return false;
  }
}

function makeDatasetStore(summary: TrackerSummary, namespaceGeneration: number): StoreRecord {
  const key = storeRecordKey(summary, namespaceGeneration);
  const existing = storeRecords.get(key);
  if (existing) {
    existing.summary = summary;
    existing.generation = currentTargetGeneration(summary);
    summaryRecords.set(key, summary);
    return existing;
  }
  const ownerSubject = summary.kind === "shared" ? account?.subject ?? null : null;
  summaryRecords.set(key, summary);
  const persistence = new DatasetPersistence(createPersistenceAdapter(storageNamespace(summary, namespaceGeneration)));
  let record: StoreRecord;
  const store = createDatasetStore(persistence, async () => undefined, {
    principal: () => account,
    getDevicePreferences: () => trackerRegistryStore.getState().devicePreferences,
    saveDevicePreferences: async value => saveDevicePreferences(value),
    getTrackerContext: () => {
      const latest = summaryRecords.get(key);
      if (!latest || latest.kind !== "shared") return undefined;
      return {
        kind: "shared",
        name: latest.name,
        accountSubject: ownerSubject ?? "signed-out",
        membershipId: latest.membershipId!,
        role: latest.role,
        archived: latest.archived,
        access: ownerSubject && account?.subject === ownerSubject && trackerRegistryStore.getState().registry?.ownerSubject === ownerSubject && trackerRegistryStore.getState().registry?.sharedTrackers.some(value => value.datasetId === latest.datasetId && value.membershipId === latest.membershipId) ? "active" : "revoked",
      };
    },
    onTargetInvalidated: () => invalidateTarget(summary, record),
    isTargetCurrent: expectedGeneration => targetIsCurrent(summary, expectedGeneration ?? record.generation, ownerSubject),
  });
  record = { key, summary, generation: currentTargetGeneration(summary), namespaceGeneration, ownerSubject, store };
  storeRecords.set(key, record);
  return record;
}

const initialPersonal = createDatasetStore(new DatasetPersistence(anonymousAdapter), async () => undefined, {
  principal: () => account,
  getDevicePreferences: () => trackerRegistryStore.getState().registry ? trackerRegistryStore.getState().devicePreferences : undefined,
  saveDevicePreferences,
  onTargetInvalidated: async () => {
    const registry = trackerRegistryStore.getState().registry;
    if (registry) await invalidateTarget(personalSummary(registry.personalDatasetId));
  },
  isTargetCurrent: expectedGeneration => {
    const registry = trackerRegistryStore.getState().registry;
    if (!registry) return false;
    const summary = personalSummary(registry.personalDatasetId);
    return targetIsCurrent(summary, expectedGeneration ?? registry.personalGeneration, null);
  },
  onDatasetReplaced: async dataset => {
    const registry = trackerRegistryStore.getState().registry;
    if (!registry || dataset.datasetId === registry.personalDatasetId) return;
    const next = {
      ...registry,
      personalDatasetId: dataset.datasetId,
      activeDatasetId: registry.activeMembershipId ? registry.activeDatasetId : dataset.datasetId,
    };
    if (!await persistRegistry(next)) throw new Error("Could not update personal tracker registry");
    trackerRegistryStore.setState({
      summaries: [personalSummary(dataset.datasetId), ...trackerRegistryStore.getState().summaries.filter(value => value.kind === "shared")],
      activeSummary: trackerRegistryStore.getState().activeSummary?.kind === "personal" ? personalSummary(dataset.datasetId) : trackerRegistryStore.getState().activeSummary,
    });
  },
  onReset: async dataset => {
    const state = trackerRegistryStore.getState();
    if (!state.registry) return;
    const current = trackerRegistryStore.getState().registry;
    if (!current) return;
    const next = {
      ...current,
      personalDatasetId: dataset.datasetId,
      activeDatasetId: current.activeMembershipId ? current.activeDatasetId : dataset.datasetId,
      activeMembershipId: current.activeMembershipId,
    };
    if (!await persistRegistry(next)) return;
    const personal = personalSummary(dataset.datasetId);
    trackerRegistryStore.setState({
      summaries: [personal, ...trackerRegistryStore.getState().summaries.filter(value => value.kind === "shared")],
      activeSummary: next.activeMembershipId ? trackerRegistryStore.getState().activeSummary : personal,
    });
  },
});

export type TrackerRegistryState = {
  targetRevision: number;
  hydration: "loading" | "ready" | "recovery";
  registry: TrackerRegistry | null;
  summaries: TrackerSummary[];
  activeSummary: TrackerSummary | null;
  activeStore: DatasetStore;
  devicePreferences: DevicePreferences;
  principal: TrackerPrincipal;
  inaccessible: InaccessibleTrackerCopy[];
  isRefreshing: boolean;
  error: string | null;
};

export const trackerRegistryStore = create<TrackerRegistryState>(() => ({
  targetRevision: 0,
  hydration: "loading",
  registry: null,
  summaries: [],
  activeSummary: null,
  activeStore: initialPersonal,
  devicePreferences: defaultDevicePreferences,
  principal: null,
  inaccessible: [],
  isRefreshing: false,
  error: null,
}));

export class TrackerRegistryPersistence {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly adapter: PersistenceAdapter) {}
  async load(): Promise<TrackerRegistry | null> {
    const raw = await this.adapter.readSnapshot();
    if (raw === null) return null;
    return registrySchema.parse(JSON.parse(raw));
  }
  save(value: TrackerRegistry): Promise<void> {
    const raw = JSON.stringify(registrySchema.parse(value));
    const operation = this.queue.then(() => this.adapter.writeSnapshot(raw), () => this.adapter.writeSnapshot(raw));
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
  async quarantine(): Promise<void> {
    const snapshot = await this.adapter.readSnapshot();
    if (snapshot !== null) await this.adapter.quarantineSnapshot(snapshot);
  }
  async restore(): Promise<void> { await this.adapter.restoreRecoverySnapshot(); }
}

const registryPersistence = new TrackerRegistryPersistence(registryAdapter);

export async function initializeTrackerRegistry(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    trackerRegistryStore.setState({ hydration: "loading", error: null });
    try {
      if (!cleanupPromise) cleanupPromise = runLegacyAccountCacheCleanup();
      await cleanupPromise;
      await initialPersonal.getState().initialize();
      const personalDataset = initialPersonal.getState().dataset;
      if (!personalDataset) {
        trackerRegistryStore.setState({ hydration: "recovery" });
        return;
      }
      let registry: TrackerRegistry | null;
      try {
        registry = await registryPersistence.load();
      } catch {
        await registryPersistence.quarantine().catch(() => undefined);
        trackerRegistryStore.setState({ hydration: "recovery", error: "tracker_registry_needs_recovery" });
        return;
      }
      if (!registry) {
        registry = initialRegistry(personalDataset);
        if (!await persistRegistry(registry)) {
          trackerRegistryStore.setState({ hydration: "recovery" });
          return;
        }
      } else if (registry.personalDatasetId !== personalDataset.datasetId) {
        // Personal sync's explicit replace may legitimately adopt the cloud dataset ID.
        // Repair only when the persisted binding proves that exact identity.
        if (personalDataset.sync?.binding?.datasetId === personalDataset.datasetId) {
          registry = {
            ...registry,
            personalDatasetId: personalDataset.datasetId,
            activeDatasetId: registry.activeMembershipId ? registry.activeDatasetId : personalDataset.datasetId,
          };
          if (!await persistRegistry(registry)) {
            trackerRegistryStore.setState({ hydration: "recovery", error: "tracker_registry_personal_dataset_mismatch" });
            return;
          }
        } else {
          trackerRegistryStore.setState({ hydration: "recovery", error: "tracker_registry_personal_dataset_mismatch" });
          return;
        }
      }
      const prefs = registry.devicePreferences;
      const personal = personalSummary(registry.personalDatasetId);
      const hydrationSubject = account?.subject ?? null;
      let summary = activeSummary(registry, hydrationSubject);
      const namespaceGeneration = namespaceGenerationFor(registry, summary);
      let record = summary.kind === "personal"
        ? { key: storeKey(personal), summary: personal, generation: registry.personalGeneration, store: initialPersonal }
        : makeDatasetStore(summary, namespaceGeneration);
      // Keep the current route mounted while a newly selected persisted tracker hydrates.
      await record.store.getState().initialize();
      if (summary.kind === "shared" && hydrationSubject !== (account?.subject ?? null)) {
        summary = personal;
        record = { key: storeKey(personal), summary: personal, generation: registry.personalGeneration, store: initialPersonal };
      }
      trackerRegistryStore.setState({
        hydration: "ready",
        registry,
        summaries: [personal, ...(registry.ownerSubject === account?.subject ? registry.sharedTrackers : [])],
        activeSummary: summary,
        activeStore: record.store,
        devicePreferences: prefs,
        inaccessible: registry.ownerSubject === account?.subject ? registry.inaccessible.filter(value => value.accountSubject === account?.subject) : [],
      });
      if (summary.kind === "shared") await syncDatasetContext(record.store, summary);
      else if (record.store.getState().dataset) await record.store.getState().updateFromSync(current => current);
    } catch {
      trackerRegistryStore.setState({ hydration: "recovery", error: "tracker_registry_initialization_failed" });
    }
  })().finally(() => { initPromise = null; });
  return initPromise;
}

async function syncDatasetContext(store: DatasetStore, summary: TrackerSummary): Promise<void> {
  const registry = trackerRegistryStore.getState().registry;
  const namespaceGeneration = registry ? namespaceGenerationFor(registry, summary) : 1;
  const capturedOwner = storeRecords.get(storeRecordKey(summary, namespaceGeneration))?.ownerSubject;
  await store.getState().updateFromSync(current => ({
    ...current,
    tracker: summary.kind === "shared" ? {
      kind: "shared",
      name: summary.name,
      accountSubject: capturedOwner ?? "signed-out",
      membershipId: summary.membershipId!,
      role: summary.role,
      archived: summary.archived,
      access: "active",
    } : undefined,
  }));
}

async function prepareSharedDataset(summary: TrackerSummary, record: StoreRecord, currencies?: Pick<Preferences, "baseCurrency" | "selectedCurrencies">): Promise<boolean> {
  await record.store.getState().initialize();
  const current = record.store.getState().dataset;
  const ownerSubject = record.ownerSubject;
  if (!current || !ownerSubject) return false;
  if (current.datasetId !== summary.datasetId && (current.transactions.length > 0 || current.budgets.length > 0 || (current.sync?.outbox.length ?? 0) > 0 || current.sync?.binding)) return false;
  const next: Dataset = {
    ...current,
    datasetId: summary.datasetId,
    tracker: {
      kind: "shared",
      name: summary.name,
      accountSubject: ownerSubject,
      membershipId: summary.membershipId!,
      role: summary.role,
      archived: summary.archived,
      access: "active",
    },
    preferences: currencies ? { ...current.preferences, ...currencies } : current.preferences,
    sync: { ...syncState(current), enabled: true, binding: { owner: ownerSubject, datasetId: summary.datasetId } },
  };
  if (!(await record.store.getState().updateFromSync(() => next))) return false;
  await syncDatasetContext(record.store, summary);
  return record.store.getState().saveStatus === "idle";
}

export async function setTrackerPrincipal(principal: TrackerPrincipal): Promise<void> {
  const previous = account?.subject ?? null;
  account = principal;
  trackerRegistryStore.setState(state => ({ principal, targetRevision: state.targetRevision + (previous !== principal?.subject ? 1 : 0) }));
  const state = trackerRegistryStore.getState();
  if (!state.registry || state.hydration !== "ready") return;
  if (previous !== principal?.subject) {
    let registry = state.registry;
    if (previous && principal && registry.ownerSubject === previous && principal.subject !== previous) {
      const inaccessible = [...registry.inaccessible];
      for (const summary of registry.sharedTrackers) {
        if (!inaccessible.some(value => value.datasetId === summary.datasetId && value.membershipId === summary.membershipId && value.accountSubject === previous)) {
          inaccessible.push({ datasetId: summary.datasetId, membershipId: summary.membershipId!, name: summary.name, accountSubject: previous, generation: namespaceGenerationFor(registry, summary), removedAt: new Date().toISOString() });
        }
      }
      registry = { ...registry, inaccessible, activeDatasetId: registry.personalDatasetId, activeMembershipId: null };
      await persistRegistry(registry);
    }
    const sameOwner = !!principal && registry.ownerSubject === principal.subject;
    const summaries = [personalSummary(registry.personalDatasetId), ...(sameOwner ? registry.sharedTrackers : [])];
    const summary = sameOwner ? activeSummary(registry, principal?.subject ?? null) : personalSummary(registry.personalDatasetId);
    const record = summary.kind === "personal" ? { store: initialPersonal } : makeDatasetStore(summary, namespaceGenerationFor(registry, summary));
    await record.store.getState().initialize();
    if ((account?.subject ?? null) !== (principal?.subject ?? null)) return;
    trackerRegistryStore.setState({ summaries, activeSummary: summary, activeStore: record.store, inaccessible: principal ? registry.inaccessible.filter(value => value.accountSubject === principal.subject) : [] });
    if (summary.kind === "shared") await syncDatasetContext(record.store, summary);
  }
}

export async function saveDevicePreferences(value: DevicePreferences): Promise<boolean> {
  const state = trackerRegistryStore.getState();
  if (!state.registry) {
    trackerRegistryStore.setState({ devicePreferences: value });
    return true;
  }
  if (!await persistRegistry({ ...state.registry, devicePreferences: value })) return false;
  trackerRegistryStore.setState({ devicePreferences: value });
  return true;
}

export async function acceptSharedSyncNotice(): Promise<boolean> {
  const state = trackerRegistryStore.getState();
  if (!state.registry) return false;
  return persistRegistry({ ...state.registry, sharedNoticeAcceptedAt: new Date().toISOString() });
}

export async function reconcileSharedTrackers(subject: string, incoming: readonly TrackerSummary[]): Promise<void> {
  const state = trackerRegistryStore.getState();
  if (!state.registry || state.hydration !== "ready" || account?.subject !== subject) return;
  const current = state.registry.ownerSubject === subject ? state.registry.sharedTrackers : [];
  const accepted = incoming.filter(value => value.kind === "shared");
  const acceptedKeys = new Set(accepted.map(storeKey));
  const inaccessible = [...state.registry.inaccessible];
  const generations = { ...state.registry.membershipGenerations };
  for (const previous of current) {
    const key = storeKey(previous);
    if (acceptedKeys.has(key)) continue;
    const namespaceGeneration = namespaceGenerationFor(state.registry, previous);
    if (!inaccessible.some(value => value.datasetId === previous.datasetId && value.membershipId === previous.membershipId && value.accountSubject === subject)) {
      inaccessible.push({ datasetId: previous.datasetId, membershipId: previous.membershipId!, name: previous.name, accountSubject: subject, generation: namespaceGeneration, removedAt: new Date().toISOString() });
    }
    generations[`${previous.datasetId}:${previous.membershipId}`] = namespaceGeneration + 1;
  }
  const targetGenerations = { ...state.registry.targetGenerations };
  for (const previous of current) {
    if (!acceptedKeys.has(storeKey(previous))) {
      const key = `${previous.datasetId}:${previous.membershipId}`;
      targetGenerations[key] = generationFor(state.registry, previous) + 1;
    }
  }
  for (const summary of accepted) {
    const generationKey = `${summary.datasetId}:${summary.membershipId}`;
    const prior = current.find(value => value.datasetId === summary.datasetId && value.membershipId === summary.membershipId);
    if (prior?.archived !== undefined && prior.archived !== summary.archived && summary.archived) {
      targetGenerations[generationKey] = generationFor(state.registry, prior) + 1;
    }
    if (!generations[generationKey]) {
      const priorGeneration = Math.max(0, ...inaccessible.filter(item => item.datasetId === summary.datasetId).map(item => item.generation));
      generations[generationKey] = priorGeneration + 1;
    }
    if (targetGenerations[generationKey] === undefined) targetGenerations[generationKey] = 1;
    makeDatasetStore(summary, generations[generationKey]!);
  }
  const keptInaccessible = inaccessible;
  const wasActive = state.activeSummary?.kind === "shared";
  const activeStillPresent = accepted.some(value => value.datasetId === state.activeSummary?.datasetId && value.membershipId === state.activeSummary?.membershipId);
  const nextActive = wasActive && !activeStillPresent ? personalSummary(state.registry.personalDatasetId) : state.activeSummary ?? personalSummary(state.registry.personalDatasetId);
  const nextRegistry = {
    ...state.registry,
    sharedTrackers: accepted,
    inaccessible: keptInaccessible,
    membershipGenerations: generations,
    targetGenerations,
    ownerSubject: subject,
    activeDatasetId: nextActive.datasetId,
    activeMembershipId: nextActive.membershipId,
  };
  const summary = activeSummary(nextRegistry, subject);
  const record = summary.kind === "personal" ? { store: initialPersonal } : makeDatasetStore(summary, namespaceGenerationFor(nextRegistry, summary));
  if (summary.kind === "personal" && wasActive && !activeStillPresent) {
    const oldStore = state.activeStore;
    oldStore.setState({ datasetEpoch: oldStore.getState().datasetEpoch + 1 });
  }
  trackerRegistryStore.setState({ summaries: [personalSummary(nextRegistry.personalDatasetId), ...accepted], activeSummary: summary, activeStore: record.store, inaccessible: inaccessible.filter(value => value.accountSubject === subject) });
  trackerRegistryStore.setState({ registry: nextRegistry, targetRevision: trackerRegistryStore.getState().targetRevision + 1 });
  await persistRegistry(nextRegistry);
  if (summary.kind === "shared") await prepareSharedDataset(summary, record as StoreRecord);
  else {
    await record.store.getState().initialize();
    if (record.store.getState().dataset) await record.store.getState().updateFromSync(current => current);
  }
  for (const item of accepted) {
    const sharedRecord = makeDatasetStore(item, namespaceGenerationFor(nextRegistry, item));
    if (sharedRecord !== record) await prepareSharedDataset(item, sharedRecord);
  }
}

export async function registerCreatedOrJoinedTracker(summary: TrackerSummary, preferences: Preferences, expectedSubject?: string): Promise<boolean> {
  const state = trackerRegistryStore.getState();
  if (!state.registry || summary.kind !== "shared" || !account || (expectedSubject && account.subject !== expectedSubject)) return false;
  const key = `${summary.datasetId}:${summary.membershipId}`;
  const previous = state.registry.membershipGenerations[key];
  const oldCopyExists = state.registry.inaccessible.some(value => value.datasetId === summary.datasetId && value.membershipId === summary.membershipId && value.accountSubject === account?.subject);
  const namespaceGeneration = previous === undefined ? Math.max(1, ...state.registry.inaccessible.filter(value => value.datasetId === summary.datasetId).map(value => value.generation + 1)) : oldCopyExists ? previous + 1 : previous;
  const targetGeneration = state.registry.targetGenerations[key] ?? 1;
  const registry = {
    ...state.registry,
    ownerSubject: account.subject,
    sharedTrackers: [...state.registry.sharedTrackers.filter(value => value.datasetId !== summary.datasetId), summary],
    membershipGenerations: { ...state.registry.membershipGenerations, [key]: namespaceGeneration },
    targetGenerations: { ...state.registry.targetGenerations, [key]: targetGeneration },
    activeDatasetId: summary.datasetId,
    activeMembershipId: summary.membershipId,
  };
  if (!await persistRegistry(registry)) return false;
  const record = makeDatasetStore(summary, namespaceGeneration);
  await record.store.getState().initialize();
  const base = createEmptyDataset();
  const dataset: Dataset = {
    ...base,
    datasetId: summary.datasetId,
    tracker: {
      kind: "shared",
      name: summary.name,
      accountSubject: account.subject,
      membershipId: summary.membershipId!,
      role: summary.role,
      archived: summary.archived,
      access: "active",
    },
    preferences: { ...base.preferences, ...state.devicePreferences, baseCurrency: preferences.baseCurrency, selectedCurrencies: preferences.selectedCurrencies },
    sync: { ...base.sync!, enabled: true, binding: { owner: account.subject, datasetId: summary.datasetId } },
  };
  if (!await record.store.getState().updateFromSync(() => dataset)) return false;
  trackerRegistryStore.setState({ summaries: [personalSummary(registry.personalDatasetId), ...registry.sharedTrackers], activeSummary: summary, activeStore: record.store, inaccessible: registry.inaccessible.filter(value => value.accountSubject === account?.subject) });
  trackerRegistryStore.setState(state => ({ targetRevision: state.targetRevision + 1 }));
  return record.store.getState().saveStatus === "idle";
}

export async function selectTracker(datasetId: string, membershipId?: string | null): Promise<boolean> {
  const state = trackerRegistryStore.getState();
  if (!state.registry) return false;
  const summary = state.summaries.find(value => value.datasetId === datasetId && (value.kind === "personal" || value.membershipId === (membershipId ?? null)));
  if (!summary) return false;
  if (summary.kind === "shared" && (!account || state.registry.ownerSubject !== account.subject)) return false;
  const namespaceGeneration = namespaceGenerationFor(state.registry, summary);
  const record = summary.kind === "personal" ? { store: initialPersonal } : makeDatasetStore(summary, namespaceGeneration);
  const subject = account?.subject ?? null;
  await record.store.getState().initialize();
  const latest = trackerRegistryStore.getState();
  const currentSummary = latest.summaries.find(value => storeKey(value) === storeKey(summary));
  if (!latest.registry || !currentSummary || subject !== (account?.subject ?? null)) return false;
  if (summary.kind === "shared" && namespaceGenerationFor(latest.registry, summary) !== namespaceGeneration) return false;
  if (!await persistRegistry({ ...latest.registry, activeDatasetId: summary.datasetId, activeMembershipId: summary.membershipId })) return false;
  trackerRegistryStore.setState({ activeSummary: currentSummary, activeStore: record.store });
  if (summary.kind === "shared") await syncDatasetContext(record.store, summary);
  return record.store.getState().hydration.status === "ready";
}

export async function updateTrackerSummary(summary: TrackerSummary): Promise<void> {
  const state = trackerRegistryStore.getState();
  if (!state.registry) return;
  const previous = state.registry.sharedTrackers.find(value => value.datasetId === summary.datasetId && value.membershipId === summary.membershipId);
  const key = `${summary.datasetId}:${summary.membershipId}`;
  const next = {
    ...state.registry,
    sharedTrackers: state.registry.sharedTrackers.map(value => value.datasetId === summary.datasetId && value.membershipId === summary.membershipId ? summary : value),
    ...(previous && previous.archived !== summary.archived && summary.archived ? { targetGenerations: { ...state.registry.targetGenerations, [key]: generationFor(state.registry, previous) + 1 } } : {}),
  };
  const summaries = [personalSummary(next.personalDatasetId), ...next.sharedTrackers];
  trackerRegistryStore.setState(current => ({ registry: next, summaries, activeSummary: current.activeSummary?.datasetId === summary.datasetId ? summary : current.activeSummary, targetRevision: current.targetRevision + 1 }));
  const record = makeDatasetStore(summary, namespaceGenerationFor(next, summary));
  await syncDatasetContext(record.store, summary);
  await persistRegistry(next);
}

export async function removeInaccessibleTracker(datasetId: string, membershipId: string): Promise<boolean> {
  const state = trackerRegistryStore.getState();
  const item = state.inaccessible.find(value => value.datasetId === datasetId && value.membershipId === membershipId && value.accountSubject === account?.subject);
  if (!item) return false;
  try {
    await new DatasetPersistence(createPersistenceAdapter(storageNamespace({ datasetId, membershipId, name: item.name, kind: "shared", role: "member", archived: false }, item.generation))).reset();
    const registry = state.registry;
    if (!registry) return false;
    const next = { ...registry, inaccessible: registry.inaccessible.filter(value => value !== item) };
    if (!await persistRegistry(next)) return false;
    trackerRegistryStore.setState({ inaccessible: next.inaccessible.filter(value => value.accountSubject === account?.subject) });
    return true;
  } catch { return false; }
}

export function subscribeTrackerStores(listener: () => void): () => void {
  const unsubscribes = [...storeRecords.values()].map(value => value.store.subscribe(listener));
  unsubscribes.push(initialPersonal.subscribe(listener));
  const unsubscribeRegistry = trackerRegistryStore.subscribe(listener);
  return () => { for (const unsubscribe of unsubscribes) unsubscribe(); unsubscribeRegistry(); };
}

export function subscribeTrackerRegistry(listener: (state: TrackerRegistryState, previous: TrackerRegistryState) => void): () => void {
  return trackerRegistryStore.subscribe(listener);
}

export function getActiveTrackerStore(): DatasetStore { return trackerRegistryStore.getState().activeStore; }

export function getTrackerStore(summary: TrackerSummary): DatasetStore {
  if (summary.kind === "personal") return initialPersonal;
  const registry = trackerRegistryStore.getState().registry;
  return makeDatasetStore(summary, registry ? namespaceGenerationFor(registry, summary) : 1).store;
}

export function useActiveTrackerSummary(): TrackerSummary {
  return useStore(trackerRegistryStore, state => state.activeSummary ?? uninitializedPersonalSummary);
}

export function useDevicePreferences<T>(selector: (preferences: DevicePreferences) => T): T {
  return useStore(trackerRegistryStore, state => selector(state.devicePreferences));
}

export function useTrackerRegistry<T>(selector: (state: TrackerRegistryState) => T): T {
  return useStore(trackerRegistryStore, selector);
}

export function getActiveTrackerSummary(): TrackerSummary | null { return trackerRegistryStore.getState().activeSummary; }

export async function getPersonalVoiceTarget(accountSubject?: string): Promise<VoiceTarget | null> {
  const state = trackerRegistryStore.getState();
  if (!state.registry || !accountSubject || account?.subject !== accountSubject) return null;
  const summary = personalSummary(state.registry.personalDatasetId);
  const datasetStore = initialPersonal;
  if (datasetStore.getState().hydration.status !== "ready") await datasetStore.getState().initialize();
  const dataset = datasetStore.getState().dataset;
  if (!dataset || dataset.datasetId !== state.registry.personalDatasetId) return null;
  return { datasetId: dataset.datasetId, name: summary.name, membershipId: null, generation: state.registry.personalGeneration, writable: true, kind: "personal", dataset };
}

export async function getVoiceTarget(datasetId: string): Promise<VoiceTarget | null> {
  const state = trackerRegistryStore.getState();
  const summary = state.summaries.find(value => value.datasetId === datasetId);
  if (!summary || !state.registry) return null;
  const generation = generationFor(state.registry, summary);
  const namespaceGeneration = namespaceGenerationFor(state.registry, summary);
  const record = summary.kind === "personal" ? { store: initialPersonal } : makeDatasetStore(summary, namespaceGeneration);
  if (record.store.getState().hydration.status !== "ready") await record.store.getState().initialize();
  const dataset = record.store.getState().dataset;
  if (!dataset || dataset.datasetId !== summary.datasetId) return null;
  const writable = summary.kind === "personal"
    ? summary.datasetId === state.registry.personalDatasetId
    : (!!account && state.registry.ownerSubject === account.subject && !summary.archived && dataset.tracker?.access === "active");
  return { datasetId, name: summary.name, membershipId: summary.membershipId, generation, writable, kind: summary.kind, dataset };
}

export function getTrackerGeneration(summary: TrackerSummary): number {
  const registry = trackerRegistryStore.getState().registry;
  return registry ? generationFor(registry, summary) : 1;
}

export async function listVoiceTargets(): Promise<VoiceTarget[]> {
  const state = trackerRegistryStore.getState();
  const summaries = state.summaries.filter(value => value.kind === "personal" || (!value.archived && value.membershipId));
  const targets = await Promise.all(summaries.map(value => getVoiceTarget(value.datasetId)));
  return targets.filter((value): value is VoiceTarget => !!value && value.writable);
}

export async function addVoiceTransactionDurably(
  datasetId: string,
  input: Parameters<DatasetStoreState["addTransactionDurably"]>[0],
  requestId: string,
  expectedGeneration: number,
  expectedMembershipId: string | null,
): Promise<MutationResult<Transaction>> {
  const target = await getVoiceTarget(datasetId);
  const state = trackerRegistryStore.getState();
  const summary = state.summaries.find(value => value.datasetId === datasetId && value.membershipId === expectedMembershipId);
  if (!target || !summary || !state.registry || !target.writable || target.generation !== expectedGeneration || target.membershipId !== expectedMembershipId || generationFor(state.registry, summary) !== expectedGeneration || !targetIsCurrent(summary, expectedGeneration, summary.kind === "shared" ? account?.subject ?? null : null)) {
    return { ok: false, message: "tracker_membership_changed" };
  }
  if (target.kind === "shared" && (!account || state.registry?.ownerSubject !== account.subject)) return { ok: false, message: "tracker_permission_denied" };
  const record = target.kind === "personal" ? initialPersonal : storeRecords.get(storeRecordKey(summary, namespaceGenerationFor(state.registry!, summary)))?.store;
  if (!record) return { ok: false, message: "tracker_membership_changed" };
  return record.getState().addTransactionDurably(input, requestId, expectedGeneration);
}

export function getRegistryAdapterForTesting(): PersistenceAdapter { return registryAdapter; }
