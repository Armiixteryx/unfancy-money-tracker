import { z } from "zod";

export type SyncRecordType = "transaction" | "category" | "budget" | "preference";
export type SyncOperation = "upsert" | "delete";

export type SyncChange = {
  idempotencyKey: string;
  recordType: SyncRecordType;
  recordId: string;
  operation: SyncOperation;
  baseRevision: number;
  payload: unknown | null;
  tombstone: boolean;
};

export type SyncConflict = {
  recordType: SyncRecordType;
  recordId: string;
  localRevision: number;
  cloudRevision: number;
  localPayload: unknown | null;
  cloudPayload: unknown | null;
  resolution: "pending";
};

export type PushRequest = { datasetId: string; changes: readonly SyncChange[] };
export type PushResponse = { acknowledged: readonly string[]; conflicts: readonly SyncConflict[]; cursor: string };
export type PullRequest = { datasetId: string; cursor: string };
export type PullResponse = { changes: readonly SyncChange[]; cursor: string };
export type ResolveConflictRequest = { datasetId: string; conflict: SyncConflict; choice: "keep_local" | "keep_cloud" };

export class SyncClientError extends Error {
  constructor(readonly code: "unauthenticated" | "offline" | "conflict" | "invalid_request" | "server_error", message: string) {
    super(message);
    this.name = "SyncClientError";
  }
}

export const syncChangeSchema = z.object({
  idempotencyKey: z.string().uuid(),
  recordType: z.enum(["transaction", "category", "budget", "preference"]),
  recordId: z.string().uuid(),
  operation: z.enum(["upsert", "delete"]),
  baseRevision: z.number().int().nonnegative(),
  payload: z.unknown().nullable(),
  tombstone: z.boolean()
});

export const pushRequestSchema = z.object({ datasetId: z.string().uuid(), changes: z.array(syncChangeSchema).max(100) });
export const pullRequestSchema = z.object({ datasetId: z.string().uuid(), cursor: z.string().regex(/^\d+$/) });
export const resolveConflictRequestSchema = z.object({
  datasetId: z.string().uuid(),
  conflict: z.object({
    recordType: z.enum(["transaction", "category", "budget", "preference"]),
    recordId: z.string().uuid(),
    localRevision: z.number().int().nonnegative(),
    cloudRevision: z.number().int().nonnegative(),
    localPayload: z.unknown().nullable(),
    cloudPayload: z.unknown().nullable(),
    resolution: z.literal("pending")
  }),
  choice: z.enum(["keep_local", "keep_cloud"])
});

export interface SyncClient {
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
  resolveConflict(request: ResolveConflictRequest): Promise<PushResponse>;
}

