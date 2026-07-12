import { useMutation } from "@tanstack/react-query";

import type { Dataset } from "../../../domain/types";
import type { ResolveConflictRequest, PushResponse, SyncClient } from "../../../platform/sync/types";
import { syncLocalDatasetWithRetry, type InitialSyncResult } from "../services";

export function useSyncRemoteState(syncClient: SyncClient) {
  const sync = useMutation<InitialSyncResult, unknown, Dataset>({
    mutationFn: (dataset) => syncLocalDatasetWithRetry(dataset, syncClient)
  });
  const resolveConflict = useMutation<PushResponse, unknown, ResolveConflictRequest>({
    mutationFn: (request) => syncClient.resolveConflict(request)
  });
  return { sync, resolveConflict };
}
