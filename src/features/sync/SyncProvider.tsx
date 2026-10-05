import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../auth/AuthProvider";
import { subscribeAuthentication } from "../../platform/auth/lifecycle";
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";
import { HttpSyncClient } from "./api";
import { SyncCoordinator } from "./coordinator";
const Context = createContext<SyncCoordinator | null>(null);
export function SyncProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const coordinator = useMemo(
    () => new SyncCoordinator(useLocalDatasetStore, new HttpSyncClient()),
    [],
  );
  useEffect(() => {
    coordinator.authenticationChanged(!!auth.identity);
    void coordinator.run();
  }, [coordinator, auth.identity, auth.epoch]);
  useEffect(() => {
    const unAuth = subscribeAuthentication(() =>
      coordinator.authenticationChanged(false),
    );
    const unStore = useLocalDatasetStore.subscribe((next, previous) => {
      if (next.datasetEpoch !== previous.datasetEpoch) {
        coordinator.cancel();
        void coordinator.run();
      }
      if (
        next.saveStatus === "idle" &&
        previous.saveStatus !== "idle" &&
        next.dataset
      ) {
        // Debounce a local write through completion of any active request.
        void coordinator.run().then(() => {
          const current = useLocalDatasetStore.getState().dataset;
          if (
            current?.sync?.outbox.some((entry) => !entry.submitted) &&
            coordinator.status === "idle"
          )
            void coordinator.run();
        });
      }
    });
    const unNetwork = NetInfo.addEventListener((state) =>
      coordinator.setOnline(
        state.isConnected !== false && state.isInternetReachable !== false,
      ),
    );
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void coordinator.run();
    });
    return () => {
      unAuth();
      unStore();
      unNetwork();
      app.remove();
      coordinator.cancel();
    };
  }, [coordinator]);
  return <Context.Provider value={coordinator}>{children}</Context.Provider>;
}
export function useSync() {
  const coordinator = useContext(Context);
  const status = useSyncExternalStore(
    coordinator?.subscribe ?? (() => () => {}),
    () => coordinator?.status ?? "disabled",
  );
  return { coordinator, status };
}
