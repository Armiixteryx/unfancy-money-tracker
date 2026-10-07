import { z } from "zod";
import { uuidV7Schema } from "../../domain/validation";
import { syncedPreferencesSchema, pushRequestSchema, pullRequestSchema, resolveConflictRequestSchema, pushResponseSchema, pullResponseSchema } from "./sync";

export const trackerRoleSchema = z.enum(["admin", "member"]);
export type TrackerRole = z.infer<typeof trackerRoleSchema>;
export const trackerSummarySchema = z.object({
  datasetId: uuidV7Schema,
  kind: z.enum(["personal", "shared"]),
  name: z.string().min(1).max(80),
  role: trackerRoleSchema,
  membershipId: uuidV7Schema.nullable(),
  archived: z.boolean(),
}).strict().superRefine((tracker, context) => {
  if ((tracker.kind === "personal" && (tracker.membershipId !== null || tracker.role !== "admin")) || (tracker.kind === "shared" && tracker.membershipId === null)) {
    context.addIssue({ code: "custom", path: ["membershipId"], message: "Tracker membership does not match its kind" });
  }
});
export type TrackerSummary = z.infer<typeof trackerSummarySchema>;
export const trackerMemberSchema = z.object({
  membershipId: uuidV7Schema,
  subject: z.string().min(1),
  email: z.string().email(),
  role: trackerRoleSchema,
}).strict();
export type TrackerMember = z.infer<typeof trackerMemberSchema>;
export const trackerScopeSchema = z.object({ datasetId: uuidV7Schema, membershipId: uuidV7Schema }).strict();
export type TrackerScope = z.infer<typeof trackerScopeSchema>;
export const createTrackerRequestSchema = z.object({ name: z.string().trim().min(1).max(80), currencies: syncedPreferencesSchema }).strict();
export type CreateTrackerRequest = z.infer<typeof createTrackerRequestSchema>;
export const renameTrackerRequestSchema = trackerScopeSchema.extend({ name: z.string().trim().min(1).max(80) });
export const memberRoleRequestSchema = trackerScopeSchema.extend({ targetMembershipId: uuidV7Schema, role: trackerRoleSchema });
export const removeMemberRequestSchema = trackerScopeSchema.extend({ targetMembershipId: uuidV7Schema });
export const inviteTrackerRequestSchema = trackerScopeSchema.extend({ email: z.string().email(), role: trackerRoleSchema });
export const revokeInvitationRequestSchema = trackerScopeSchema.extend({ invitationId: uuidV7Schema });
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const invitationTokenRequestSchema = z.object({ token: invitationTokenSchema }).strict();
export const invitationResultSchema = z.object({ invitationId: uuidV7Schema, url: z.string().url(), expiresAt: z.string().datetime() }).strict();
export const invitationPreviewSchema = z.object({ name: z.string().min(1).max(80), role: trackerRoleSchema, expiresAt: z.string().datetime() }).strict();
export type InvitationResult = z.infer<typeof invitationResultSchema>;
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
export const trackerListResponseSchema = z.object({ trackers: z.array(trackerSummarySchema) }).strict();
export const trackerMembersResponseSchema = z.object({ members: z.array(trackerMemberSchema) }).strict();
export const transactionCreatorSchema = z.object({ subject: z.string().min(1), email: z.string().email() }).strict();
export type TransactionCreator = z.infer<typeof transactionCreatorSchema>;
export const transactionAttributionSchema = z.object({ transactionId: uuidV7Schema, creator: transactionCreatorSchema }).strict();
export type TransactionAttribution = z.infer<typeof transactionAttributionSchema>;
export const sharedPushRequestSchema = pushRequestSchema.extend({ membershipId: uuidV7Schema });
export const sharedPullRequestSchema = pullRequestSchema.extend({ membershipId: uuidV7Schema });
export const sharedResolveRequestSchema = resolveConflictRequestSchema.extend({ membershipId: uuidV7Schema });
export const sharedPushResponseSchema = pushResponseSchema.extend({
  attribution: z.array(transactionAttributionSchema).default([]),
  rejectedChanges: z.array(z.object({ mutationId: uuidV7Schema, code: z.enum(["permission_denied", "tracker_archived", "membership_revoked"]) }).strict()).default([]),
});
export const sharedPullResponseSchema = pullResponseSchema.extend({ attribution: z.array(transactionAttributionSchema).default([]) });
export type SharedPushRequest = z.infer<typeof sharedPushRequestSchema>;
export type SharedPullRequest = z.infer<typeof sharedPullRequestSchema>;
export type SharedResolveRequest = z.infer<typeof sharedResolveRequestSchema>;
export type SharedPushResponse = z.infer<typeof sharedPushResponseSchema>;
export type SharedPullResponse = z.infer<typeof sharedPullResponseSchema>;
export type TrackerErrorCode = "unauthenticated" | "offline" | "invalid_request" | "server_error" | "membership_revoked" | "permission_denied" | "tracker_archived" | "last_admin" | "invitation_invalid" | "invitee_unavailable";
export class TrackerClientError extends Error {
  constructor(readonly code: TrackerErrorCode) { super(code); this.name = "TrackerClientError"; }
}
export interface TrackerClient {
  list(signal?: AbortSignal): Promise<TrackerSummary[]>;
  create(request: CreateTrackerRequest): Promise<TrackerSummary>;
  rename(request: z.infer<typeof renameTrackerRequestSchema>): Promise<TrackerSummary>;
  archive(scope: TrackerScope): Promise<TrackerSummary>;
  restore(scope: TrackerScope): Promise<TrackerSummary>;
  leave(scope: TrackerScope): Promise<void>;
  members(scope: TrackerScope): Promise<TrackerMember[]>;
  setRole(request: z.infer<typeof memberRoleRequestSchema>): Promise<void>;
  removeMember(request: z.infer<typeof removeMemberRequestSchema>): Promise<void>;
  invite(request: z.infer<typeof inviteTrackerRequestSchema>): Promise<InvitationResult>;
  revokeInvitation(request: z.infer<typeof revokeInvitationRequestSchema>): Promise<void>;
  previewInvitation(token: string): Promise<InvitationPreview>;
  acceptInvitation(token: string): Promise<TrackerSummary>;
  push(request: SharedPushRequest, signal?: AbortSignal): Promise<SharedPushResponse>;
  pull(request: SharedPullRequest, signal?: AbortSignal): Promise<SharedPullResponse>;
  resolveConflict(request: SharedResolveRequest, signal?: AbortSignal): Promise<SharedPushResponse>;
}
