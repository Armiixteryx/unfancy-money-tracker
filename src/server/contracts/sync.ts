import { z } from "zod";
import {
  currencyCodeSchema,
  selectedCurrenciesSchema,
} from "../../domain/currency";
import { syncCategoryIdSchema, uuidV7Schema } from "../../domain/validation";
import {
  budgetSchema,
  categorySchema,
  transactionSchema,
} from "../../domain/recordSchemas";

export const syncedPreferencesSchema = z
  .object({
    baseCurrency: currencyCodeSchema,
    selectedCurrencies: selectedCurrenciesSchema,
  })
  .strict()
  .refine((value) => value.selectedCurrencies.includes(value.baseCurrency));
export type SyncedPreferences = z.infer<typeof syncedPreferencesSchema>;
export const syncRecordTypeSchema = z.enum([
  "transaction",
  "category",
  "budget",
  "preference",
]);
export type SyncRecordType = z.infer<typeof syncRecordTypeSchema>;
export type SyncOperation = "upsert" | "delete";
export const syncChangeSchema = z
  .object({
    mutationId: uuidV7Schema,
    recordType: syncRecordTypeSchema,
    recordId: z.string(),
    operation: z.enum(["upsert", "delete"]),
    baseRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    payload: z.unknown().nullable(),
    tombstone: z.boolean(),
    editedAt: z.string().datetime(),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    committedAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((change, context) => {
    const idSchema =
      change.recordType === "category"
        ? syncCategoryIdSchema
        : change.recordType === "preference"
          ? z.literal("currency")
          : uuidV7Schema;
    if (!idSchema.safeParse(change.recordId).success)
      context.addIssue({
        code: "custom",
        path: ["recordId"],
        message: "Invalid identity",
      });
    if (
      (change.operation === "delete") !== change.tombstone ||
      (change.tombstone && change.payload !== null)
    )
      context.addIssue({ code: "custom", message: "Invalid deletion state" });
    if (!change.tombstone) {
      const schema =
        change.recordType === "category"
          ? categorySchema
          : change.recordType === "transaction"
            ? transactionSchema
            : change.recordType === "budget"
              ? budgetSchema
              : syncedPreferencesSchema;
      const parsed = schema.safeParse(change.payload);
      if (change.recordType === "transaction" && typeof change.payload === "object" && change.payload !== null && "creator" in change.payload) {
        context.addIssue({ code: "custom", path: ["payload", "creator"], message: "Transaction authorship is server metadata" });
      }
      if (
        change.recordType === "transaction" ||
        change.recordType === "budget"
      ) {
        const categoryId =
          typeof change.payload === "object" &&
          change.payload !== null &&
          "categoryId" in change.payload
            ? change.payload.categoryId
            : null;
        if (!syncCategoryIdSchema.safeParse(categoryId).success)
          context.addIssue({
            code: "custom",
            path: ["payload", "categoryId"],
            message: "Invalid category identity",
          });
      }
      if (
        !parsed.success ||
        (change.recordType !== "preference" &&
          (parsed.data as { id?: string }).id !== change.recordId)
      )
        context.addIssue({
          code: "custom",
          path: ["payload"],
          message: "Invalid record",
        });
    }
  });
export type SyncChange = z.infer<typeof syncChangeSchema>;
export const acknowledgedChangeSchema = z.object({
  mutationId: uuidV7Schema,
  recordType: syncRecordTypeSchema,
  recordId: z.string(),
  revision: z.number().int().positive(),
  committedAt: z.string().datetime(),
});
export type AcknowledgedChange = z.infer<typeof acknowledgedChangeSchema>;
export const syncConflictSchema = z.object({
  mutationId: uuidV7Schema,
  recordType: syncRecordTypeSchema,
  recordId: z.string(),
  cloudRecordId: z.string(),
  localRevision: z.number().int().nonnegative(),
  cloudRevision: z.number().int().nonnegative(),
  localPayload: z.unknown().nullable(),
  cloudPayload: z.unknown().nullable(),
  localDeleted: z.boolean(),
  cloudDeleted: z.boolean(),
  localEditedAt: z.string().datetime(),
  cloudEditedAt: z.string().datetime().nullable(),
  cloudCommittedAt: z.string().datetime().nullable(),
  reason: z.enum(["concurrent_edit", "duplicate_budget"]),
  resolution: z.literal("pending"),
  categoryDeletionId: syncCategoryIdSchema.optional(),
});
export type SyncConflict = z.infer<typeof syncConflictSchema>;
export const pushResponseSchema = z
  .object({
    acknowledgedChanges: z.array(acknowledgedChangeSchema),
    conflicts: z.array(syncConflictSchema),
  })
  .strict();
export type PushResponse = z.infer<typeof pushResponseSchema>;
export const pullResponseSchema = z
  .object({
    changes: z.array(syncChangeSchema),
    cursor: z.string().regex(/^\d+$/),
    hasMore: z.boolean(),
  })
  .strict();
export type PullResponse = z.infer<typeof pullResponseSchema>;
export const bootstrapResponseSchema = z
  .object({
    datasetId: uuidV7Schema,
    ownerSubject: z.string().min(1),
    empty: z.boolean(),
  })
  .strict();
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
export const pushRequestSchema = z
  .object({
    datasetId: uuidV7Schema,
    changes: z.array(syncChangeSchema).max(20),
  })
  .strict();
export type PushRequest = z.infer<typeof pushRequestSchema>;
export const pullRequestSchema = z
  .object({
    datasetId: uuidV7Schema,
    cursor: z.string().regex(/^\d+$/),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();
export type PullRequest = z.infer<typeof pullRequestSchema>;
export const resolveConflictRequestSchema = z
  .object({
    datasetId: uuidV7Schema,
    conflict: syncConflictSchema,
    choice: z.enum(["keep_local", "keep_cloud"]),
    mutationId: uuidV7Schema,
    editedAt: z.string().datetime(),
  })
  .strict();
export type ResolveConflictRequest = z.infer<
  typeof resolveConflictRequestSchema
>;
export class SyncClientError extends Error {
  constructor(
    readonly code:
      | "unauthenticated"
      | "membership_revoked"
      | "permission_denied"
      | "tracker_archived"
      | "offline"
      | "invalid_request"
      | "server_error"
      | "different_login"
      | "local_save_failed"
      | "local_reset_required",
    message = code,
  ) {
    super(message);
    this.name = "SyncClientError";
  }
}
export interface SyncClient {
  bootstrap(signal?: AbortSignal): Promise<BootstrapResponse>;
  push(request: PushRequest, signal?: AbortSignal): Promise<PushResponse>;
  pull(request: PullRequest, signal?: AbortSignal): Promise<PullResponse>;
  resolveConflict(
    request: ResolveConflictRequest,
    signal?: AbortSignal,
  ): Promise<PushResponse>;
}
