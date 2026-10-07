import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";

import { useAuth } from "../auth/AuthProvider";
import { subscribeAuthentication } from "../../platform/auth/lifecycle";
import { HttpSyncClient } from "./api";
import { SyncCoordinator, type SyncStatus } from "./coordinator";
import { SyncClientError, type BootstrapResponse, type PullRequest, type PullResponse, type PushRequest, type PushResponse, type ResolveConflictRequest, type SyncClient } from "../../server/contracts/sync";
import { TrackerClientError, type TrackerClient, type TrackerSummary, type TransactionAttribution } from "../../server/contracts/trackers";
import { HttpTrackerClient } from "../trackers/api";
import { getTrackerGeneration, getTrackerStore, reconcileSharedTrackers, trackerRegistryStore, useActiveTrackerSummary, useTrackerRegistry } from "../trackers/store";

class SharedTrackerSyncClient implements SyncClient {
  constructor(private readonly summary: TrackerSummary, private readonly subject: string, private readonly client: TrackerClient) {}
  private async refreshMembership(signal?: AbortSignal, revokeOnFailure = false) {
    try {
      await reconcileSharedTrackers(this.subject, await this.client.list(signal));
    } catch {
      if (!revokeOnFailure) return;
      const current = trackerRegistryStore.getState().summaries;
      await reconcileSharedTrackers(this.subject, current.filter(value => value.datasetId !== this.summary.datasetId || value.membershipId !== this.summary.membershipId));
    }
  }
  private async translateTrackerError(error: unknown, signal?: AbortSignal): Promise<never> {
    if (!(error instanceof TrackerClientError)) throw error;
    if (error.code === "membership_revoked") {
      await this.refreshMembership(signal, true);
      throw new SyncClientError("membership_revoked");
    }
    if (error.code === "permission_denied" || error.code === "tracker_archived") {
      await this.refreshMembership(signal);
      throw new SyncClientError(error.code);
    }
    if (error.code === "unauthenticated" || error.code === "offline" || error.code === "invalid_request" || error.code === "server_error") {
      throw new SyncClientError(error.code);
    }
    throw new SyncClientError("server_error");
  }
  bootstrap(): Promise<BootstrapResponse> {
    return Promise.resolve({ datasetId: this.summary.datasetId, ownerSubject: this.subject, empty: false });
  }
  async push(request: PushRequest, signal?: AbortSignal): Promise<PushResponse> {
    let response;
    try {
      response = await this.client.push({ ...request, membershipId: this.summary.membershipId! }, signal);
    } catch (error) {
      if (error instanceof TrackerClientError && (error.code === "permission_denied" || error.code === "tracker_archived")) {
        await this.refreshMembership(signal);
        return {
          acknowledgedChanges: [], conflicts: [], attribution: [],
          rejectedChanges: request.changes.map(change => ({ mutationId: change.mutationId, code: error.code as "permission_denied" | "tracker_archived" })),
        } as PushResponse;
      }
      return this.translateTrackerError(error, signal);
    }
    const rejected = response.rejectedChanges ?? [];
    if (rejected.some(value => value.code === "membership_revoked")) {
      await this.refreshMembership(signal, true);
      throw new SyncClientError("membership_revoked");
    }
    else if (rejected.length) await this.refreshMembership(signal);
    return response;
  }
  async pull(request: PullRequest, signal?: AbortSignal): Promise<PullResponse> {
    let response;
    try { response = await this.client.pull({ ...request, membershipId: this.summary.membershipId! }, signal); }
    catch (error) { return this.translateTrackerError(error, signal); }
    const attribution = new Map(response.attribution.map((item: TransactionAttribution) => [item.transactionId, item.creator]));
    return {
      ...response,
      changes: response.changes.map(change => {
        if (change.recordType !== "transaction" || change.tombstone || !change.payload || typeof change.payload !== "object") return change;
        const creator = attribution.get(change.recordId);
        return creator ? { ...change, payload: { ...change.payload, creator } } : change;
      }),
    };
  }
  async resolveConflict(request: ResolveConflictRequest, signal?: AbortSignal): Promise<PushResponse> {
    let response;
    try { response = await this.client.resolveConflict({ ...request, membershipId: this.summary.membershipId! }, signal); }
    catch (error) {
      if (error instanceof TrackerClientError && (error.code === "permission_denied" || error.code === "tracker_archived")) {
        await this.refreshMembership(signal);
        return {
          acknowledgedChanges: [], conflicts: [], attribution: [],
          rejectedChanges: [{ mutationId: request.mutationId, code: error.code }],
        } as PushResponse;
      }
      return this.translateTrackerError(error, signal);
    }
    if (response.rejectedChanges.some(value => value.code === "membership_revoked")) {
      await this.refreshMembership(signal, true);
      throw new SyncClientError("membership_revoked");
    }
    if (response.rejectedChanges.length) await this.refreshMembership(signal);
    return response;
  }
}

type ManagedSync = { key: string; store: ReturnType<typeof getTrackerStore>; coordinator: SyncCoordinator; unsubscribeStore: () => void; unsubscribeCoordinator: () => void };
class TrackerSyncManager {
  private entries = new Map<string, ManagedSync>();
  private listeners = new Set<() => void>();
  private authenticated = false;
  private online = true;
  private personalClient = new HttpSyncClient();
  private trackerClient = new HttpTrackerClient();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private emit() { this.listeners.forEach(listener => listener()); }
  private key(summary: TrackerSummary) { return `${summary.kind}:${summary.datasetId}:${summary.membershipId ?? "personal"}:g${getTrackerGeneration(summary)}`; }
  configure(summaries: readonly TrackerSummary[], authenticated: boolean) {
    this.authenticated = authenticated;
    const present = new Set(summaries.map(summary => this.key(summary)));
    for (const [key, entry] of this.entries) if (!present.has(key)) {
      entry.coordinator.cancel(); entry.unsubscribeStore(); entry.unsubscribeCoordinator(); this.entries.delete(key);
    }
    for (const summary of summaries) {
      const key = this.key(summary);
      if (this.entries.has(key)) continue;
      const store = getTrackerStore(summary);
      const subject = trackerRegistryStore.getState().principal?.subject;
      const client = summary.kind === "shared" && subject
        ? new SharedTrackerSyncClient(summary, subject, this.trackerClient)
        : this.personalClient;
      const coordinator = new SyncCoordinator(store, client);
      coordinator.authenticationChanged(authenticated && (summary.kind === "personal" || trackerRegistryStore.getState().registry?.ownerSubject === subject));
      coordinator.setOnline(this.online);
      const unsubscribeCoordinator = coordinator.subscribe(() => this.emit());
      const unsubscribeStore = store.subscribe((next, previous) => {
        if (next.datasetEpoch !== previous.datasetEpoch) coordinator.cancel();
        if (next.saveStatus === "idle" && previous.saveStatus !== "idle" && next.dataset) void coordinator.run();
      });
      this.entries.set(key, { key, store, coordinator, unsubscribeStore, unsubscribeCoordinator });
      void store.getState().initialize().then(() => coordinator.run());
    }
    for (const entry of this.entries.values()) entry.coordinator.authenticationChanged(authenticated);
    this.emit();
  }
  active(summary: TrackerSummary | null): SyncCoordinator | null { return summary ? this.entries.get(this.key(summary))?.coordinator ?? null : null; }
  status(summary: TrackerSummary | null): SyncStatus { return this.active(summary)?.status ?? "disabled"; }
  setOnline(online: boolean) { this.online = online; for (const entry of this.entries.values()) entry.coordinator.setOnline(online); }
  async runAll() { await Promise.all([...this.entries.values()].map(entry => entry.coordinator.run())); }
  dispose() { for (const entry of this.entries.values()) { entry.coordinator.cancel(); entry.unsubscribeStore(); entry.unsubscribeCoordinator(); } this.entries.clear(); }
}

const Context = createContext<TrackerSyncManager | null>(null);
export function SyncProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const summaries = useTrackerRegistry(state => state.summaries);
  const manager = useMemo(() => new TrackerSyncManager(), []);
  useEffect(() => { manager.configure(summaries, !!auth.identity); }, [auth.epoch, auth.identity, auth.subject, manager, summaries]);
  useEffect(() => {
    const unAuth = subscribeAuthentication(() => manager.configure(trackerRegistryStore.getState().summaries, false));
    const unNetwork = NetInfo.addEventListener(state => manager.setOnline(state.isConnected !== false && state.isInternetReachable !== false));
    const app = AppState.addEventListener("change", state => { if (state === "active") void manager.runAll(); });
    return () => { unAuth(); unNetwork(); app.remove(); manager.dispose(); };
  }, [manager]);
  return <Context.Provider value={manager}>{children}</Context.Provider>;
}

export function useSync() {
  const manager = useContext(Context);
  const summary = useActiveTrackerSummary();
  const subscribe = useCallback((listener: () => void) => manager?.subscribe(listener) ?? (() => undefined), [manager]);
  const getStatus = useCallback(() => manager?.status(summary) ?? "disabled", [manager, summary]);
  const status = useSyncExternalStore(subscribe, getStatus, getStatus);
  return { coordinator: manager?.active(summary) ?? null, status };
}
