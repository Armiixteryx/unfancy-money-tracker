import { useStore, type StoreApi, type UseBoundStore } from "zustand";
import type { DatasetStoreState } from "./datasetStore";
import { getActiveTrackerStore, subscribeTrackerStores, trackerRegistryStore } from "../../trackers/store";

export * from "./datasetStore";

type DatasetStore = UseBoundStore<StoreApi<DatasetStoreState>>;
type ActiveDatasetHook = {
  <T>(selector: (state: DatasetStoreState) => T): T;
  getState: () => DatasetStoreState;
  getInitialState: () => DatasetStoreState;
  setState: DatasetStore["setState"];
  subscribe: DatasetStore["subscribe"];
};

const useActiveDatasetStore = (<T,>(selector: (state: DatasetStoreState) => T): T => {
  const store = useStore(trackerRegistryStore, state => state.activeStore);
  return useStore(store, selector);
}) as ActiveDatasetHook;

const activeDatasetApi: StoreApi<DatasetStoreState> = {
  getState: () => getActiveTrackerStore().getState(),
  getInitialState: () => getActiveTrackerStore().getInitialState(),
  setState: (partial, replace) => {
    if (replace) getActiveTrackerStore().setState(partial as DatasetStoreState, true);
    else getActiveTrackerStore().setState(partial as Partial<DatasetStoreState>);
  },
  subscribe: listener => subscribeTrackerStores(() => listener(getActiveTrackerStore().getState(), getActiveTrackerStore().getState())),
};
useActiveDatasetStore.getState = activeDatasetApi.getState;
useActiveDatasetStore.getInitialState = activeDatasetApi.getInitialState;
useActiveDatasetStore.setState = activeDatasetApi.setState;
useActiveDatasetStore.subscribe = activeDatasetApi.subscribe;

export const useLocalDatasetStore = useActiveDatasetStore;
