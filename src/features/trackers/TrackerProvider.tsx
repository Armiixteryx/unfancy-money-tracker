import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import type { Preferences } from "../../domain/types";
import type { TrackerSummary } from "../../server/contracts/trackers";
import { useAuth } from "../auth/AuthProvider";
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";
import { HttpTrackerClient } from "./api";
import { acceptSharedSyncNotice, initializeTrackerRegistry, reconcileSharedTrackers, registerCreatedOrJoinedTracker, setTrackerPrincipal, trackerRegistryStore } from "./store";

type TrackerContextValue = {
  client: HttpTrackerClient;
  refresh: () => Promise<void>;
  createShared: (name: string) => Promise<TrackerSummary>;
  acceptShared: (token: string) => Promise<TrackerSummary>;
  isRefreshing: boolean;
  error: string | null;
};

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function TrackerProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const client = useMemo(() => new HttpTrackerClient(), []);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const dataset = useLocalDatasetStore(state => state.dataset);

  const refresh = useCallback(async () => {
    if (!auth.subject) return;
    setIsRefreshing(true);
    setError(null);
    try {
      const summaries = await client.list();
      await reconcileSharedTrackers(auth.subject, summaries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "tracker_refresh_failed");
      throw cause;
    } finally { setIsRefreshing(false); }
  }, [auth.subject, client]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await setTrackerPrincipal(auth.subject && auth.identity ? { subject: auth.subject, email: auth.identity } : null);
      await initializeTrackerRegistry();
      if (!alive) return;
      setReady(true);
      if (auth.subject) {
        try {
          const summaries = await client.list();
          await reconcileSharedTrackers(auth.subject, summaries);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "tracker_refresh_failed");
        }
      }
    })();
    return () => { alive = false; };
  }, [auth.subject, auth.identity, auth.epoch, client]);

  const createShared = useCallback(async (name: string) => {
    if (!ready || !auth.subject || !auth.identity || !dataset) throw new Error("tracker_auth_required");
    if (!trackerRegistryStore.getState().registry?.sharedNoticeAcceptedAt && !await acceptSharedSyncNotice()) throw new Error("tracker_notice_save_failed");
    const summary = await client.create({ name, currencies: { baseCurrency: dataset.preferences.baseCurrency, selectedCurrencies: dataset.preferences.selectedCurrencies } });
    if (trackerRegistryStore.getState().principal?.subject !== auth.subject) throw new Error("tracker_account_changed_during_creation");
    const preferences: Preferences = { ...dataset.preferences, language: trackerRegistryStore.getState().devicePreferences.language, theme: trackerRegistryStore.getState().devicePreferences.theme, analyticsConsent: trackerRegistryStore.getState().devicePreferences.analyticsConsent, firstRunNoticeDismissed: trackerRegistryStore.getState().devicePreferences.firstRunNoticeDismissed };
    if (!await registerCreatedOrJoinedTracker(summary, preferences, auth.subject)) throw new Error("tracker_local_initialization_failed");
    try { await refresh(); } catch { /* Created data remains durable and retries on next refresh. */ }
    return summary;
  }, [auth.identity, auth.subject, client, dataset, ready, refresh]);

  const acceptShared = useCallback(async (token: string) => {
    if (!ready || !auth.subject || !auth.identity || !dataset) throw new Error("tracker_auth_required");
    if (!trackerRegistryStore.getState().registry?.sharedNoticeAcceptedAt && !await acceptSharedSyncNotice()) throw new Error("tracker_notice_save_failed");
    const summary = await client.acceptInvitation(token);
    if (trackerRegistryStore.getState().principal?.subject !== auth.subject) throw new Error("tracker_account_changed_during_join");
    const preferences: Preferences = { ...dataset.preferences, language: trackerRegistryStore.getState().devicePreferences.language, theme: trackerRegistryStore.getState().devicePreferences.theme, analyticsConsent: trackerRegistryStore.getState().devicePreferences.analyticsConsent, firstRunNoticeDismissed: trackerRegistryStore.getState().devicePreferences.firstRunNoticeDismissed };
    if (!await registerCreatedOrJoinedTracker(summary, preferences, auth.subject)) throw new Error("tracker_local_initialization_failed");
    try { await refresh(); } catch { /* Membership is restored on the next refresh. */ }
    return summary;
  }, [auth.identity, auth.subject, client, dataset, ready, refresh]);

  const value = useMemo(() => ({ client, refresh, createShared, acceptShared, isRefreshing, error }), [acceptShared, client, createShared, error, isRefreshing, refresh]);
  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTrackers(): TrackerContextValue {
  const value = useContext(TrackerContext);
  if (!value) throw new Error("TrackerProvider is missing");
  return value;
}
