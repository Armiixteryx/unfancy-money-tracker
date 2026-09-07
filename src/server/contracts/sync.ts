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
  revision: number;
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
export type AcknowledgedChange = { idempotencyKey: string; recordType: SyncRecordType; recordId: string; revision: number };
export type PushResponse = { acknowledged: readonly string[]; acknowledgedChanges: readonly AcknowledgedChange[]; conflicts: readonly SyncConflict[]; cursor: string };
export type PullRequest = { datasetId: string; cursor: string };
export type PullResponse = { changes: readonly SyncChange[]; cursor: string };
export type ResolveConflictRequest = { datasetId: string; conflict: SyncConflict; choice: "keep_local" | "keep_cloud" };

export class SyncClientError extends Error {
  constructor(readonly code: "unauthenticated" | "offline" | "conflict" | "invalid_request" | "incomplete_sync" | "server_error", message: string) {
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
  tombstone: z.boolean(),
  revision: z.number().int().nonnegative()
}).superRefine((change, context) => {
  if ((change.operation === "delete") !== change.tombstone) {
    context.addIssue({ code: "custom", path: ["tombstone"], message: "Delete changes must be tombstones and upserts must not be tombstones" });
  }
});

export const acknowledgedChangeSchema = z.object({
  idempotencyKey: z.string().uuid(),
  recordType: z.enum(["transaction", "category", "budget", "preference"]),
  recordId: z.string().uuid(),
  revision: z.number().int().nonnegative()
});

export const syncConflictSchema = z.object({
  recordType: z.enum(["transaction", "category", "budget", "preference"]),
  recordId: z.string().uuid(),
  localRevision: z.number().int().nonnegative(),
  cloudRevision: z.number().int().nonnegative(),
  localPayload: z.unknown().nullable(),
  cloudPayload: z.unknown().nullable(),
  resolution: z.literal("pending")
});

export const pushResponseSchema = z.object({
  acknowledged: z.array(z.string().uuid()),
  acknowledgedChanges: z.array(acknowledgedChangeSchema),
  conflicts: z.array(syncConflictSchema),
  cursor: z.string().regex(/^\d+$/)
});

export const pullResponseSchema = z.object({
  changes: z.array(syncChangeSchema),
  cursor: z.string().regex(/^\d+$/)
});

export const pushRequestSchema = z.object({ datasetId: z.string().uuid(), changes: z.array(syncChangeSchema).max(20) });
export const pullRequestSchema = z.object({ datasetId: z.string().uuid(), cursor: z.string().regex(/^\d+$/) });
export const resolveConflictRequestSchema = z.object({
  datasetId: z.string().uuid(),
  conflict: syncConflictSchema,
  choice: z.enum(["keep_local", "keep_cloud"])
});

export interface SyncClient {
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
  resolveConflict(request: ResolveConflictRequest): Promise<PushResponse>;
}
