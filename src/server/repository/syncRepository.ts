import type { PullResponse, PushResponse, ResolveConflictRequest, SyncChange, SyncConflict } from "../contracts/sync";

export interface SyncRepository {
  push(ownerSubject: string, datasetId: string, changes: readonly SyncChange[]): Promise<PushResponse>;
  pull(ownerSubject: string, datasetId: string, cursor: string): Promise<PullResponse>;
  resolveConflict(ownerSubject: string, request: ResolveConflictRequest): Promise<PushResponse>;
}

export type StoredSyncChange = SyncChange & { revision: number; sequence: string };
export type StoredConflict = SyncConflict;
