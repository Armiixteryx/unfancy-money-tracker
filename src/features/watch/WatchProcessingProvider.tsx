import { useAuth } from "../auth/AuthProvider";
import { subscribeAuthentication } from "../../platform/auth/lifecycle";
import { getAuthenticatedAccountId } from "../../platform/auth/client";
import { watchAudioBridge } from "./bridge";
import { processWatchQueue } from "./processor";
import { useEffect, type PropsWithChildren } from "react";

export function WatchProcessingProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.identity || !watchAudioBridge.available) {
      let disposed = false;
      void watchAudioBridge.failPendingForCurrentBinding("authentication_required").catch(() => undefined)
        .then(() => disposed ? undefined : watchAudioBridge.setAccount(null)).catch(() => undefined);
      return () => { disposed = true; };
    }
    let cancelled = false;
    let active = false;
    let rerun = false;
    const run = async () => {
      if (active) { rerun = true; return; }
      if (cancelled) return;
      active = true;
      try {
        const accountId = await getAuthenticatedAccountId();
        if (cancelled) return;
        if (!accountId) { await watchAudioBridge.failPendingForCurrentBinding("authentication_required").catch(() => undefined); await watchAudioBridge.setAccount(null); return; }
        await processWatchQueue(accountId, () => !cancelled);
      } catch {
        // Queue errors remain visible in Settings; preserve manual app use.
      } finally {
        active = false;
        if (rerun && !cancelled) { rerun = false; void run(); }
      }
    };
    const unsubscribe = watchAudioBridge.subscribe(() => void run());
    const authSubscription = subscribeAuthentication(() => {
      cancelled = true;
    });
    void run();
    return () => { cancelled = true; unsubscribe(); authSubscription(); };
  }, [auth.identity, auth.epoch]);
  return children;
}
