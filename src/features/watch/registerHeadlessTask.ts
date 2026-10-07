import { AppRegistry, Platform } from "react-native";
import { authClient, getAuthenticatedAccountId } from "../../platform/auth/client";
import { subscribeAuthentication } from "../../platform/auth/lifecycle";
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";
import { watchAudioBridge } from "./bridge";
import { processWatchQueue } from "./processor";

const WATCH_AUDIO_TASK = "WatchAudioQueue";

if (Platform.OS === "android") AppRegistry.registerHeadlessTask(WATCH_AUDIO_TASK, () => async () => {
  let cancelled = false;
  const unsubscribe = subscribeAuthentication(() => {
    cancelled = true;
  });
  try {
    const identity = await authClient.restore();
    const accountId = identity ? await getAuthenticatedAccountId() : null;
    if (cancelled) return;
    if (!accountId) {
      await watchAudioBridge.failPendingForCurrentBinding("authentication_required").catch(() => undefined);
      await watchAudioBridge.setAccount(null);
      return;
    }
    const state = useLocalDatasetStore.getState();
    if (!state.dataset || state.hydration.status !== "ready") await state.initialize();
    await processWatchQueue(accountId, () => !cancelled);
  } catch {
    // React Native does not finish an ordinary rejected headless task. Close its durable
    // queue state when possible, and always resolve so subsequent jobs can run.
    await watchAudioBridge.failPendingForCurrentBinding("handoff_failed").catch(() => undefined);
  } finally { unsubscribe(); }
});
