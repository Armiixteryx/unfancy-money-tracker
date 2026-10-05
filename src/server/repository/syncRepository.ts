import type { BootstrapResponse, PullResponse, PushResponse, ResolveConflictRequest, SyncChange } from "../contracts/sync";
export interface SyncRepository {
  bootstrap(ownerSubject: string): Promise<BootstrapResponse>;
  push(ownerSubject: string, datasetId: string, changes: readonly SyncChange[]): Promise<PushResponse>;
  pull(ownerSubject: string, datasetId: string, cursor: string, limit?: number): Promise<PullResponse>;
  resolveConflict(ownerSubject: string, request: ResolveConflictRequest): Promise<PushResponse>;
}
export class DatasetAccessError extends Error { constructor() { super("Dataset access denied"); this.name = "DatasetAccessError"; } }
export class InvalidSyncPayloadError extends Error { constructor() { super("Invalid sync request"); this.name = "InvalidSyncPayloadError"; } }
