import { z } from "zod";

import { authClient } from "../../platform/auth/client";
import { resolveSyncBackendUrl } from "../sync/api";
import {
  invitationPreviewSchema,
  invitationResultSchema,
  trackerListResponseSchema,
  trackerMembersResponseSchema,
  trackerSummarySchema,
  TrackerClientError,
  type CreateTrackerRequest,
  type InvitationPreview,
  type InvitationResult,
  type TrackerClient,
  type TrackerMember,
  type TrackerScope,
  type TrackerSummary,
  type SharedPullRequest,
  type SharedPullResponse,
  type SharedPushRequest,
  type SharedPushResponse,
  type SharedResolveRequest,
} from "../../server/contracts/trackers";
import {
  sharedPullResponseSchema,
  sharedPushResponseSchema,
} from "../../server/contracts/trackers";

const emptyResponseSchema = z.object({}).strict();

export class HttpTrackerClient implements TrackerClient {
  constructor(private readonly endpoint = () => resolveSyncBackendUrl(process.env.EXPO_PUBLIC_SYNC_API_URL)) {}

  private async request<T>(route: string, value: unknown, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    let token: string;
    try { token = await authClient.accessToken(); }
    catch { throw new TrackerClientError("unauthenticated"); }
    const timeout = new AbortController();
    const abort = () => timeout.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 25_000);
    try {
      const response = await fetch(`${this.endpoint()}${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(value),
        signal: timeout.signal,
      });
      if (response.status === 401) throw new TrackerClientError("unauthenticated");
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { code?: unknown; error?: unknown } | null;
        const code = body?.code ?? body?.error;
        if (code === "membership_revoked" || code === "permission_denied" || code === "tracker_archived" || code === "last_admin" || code === "invitation_invalid" || code === "invitee_unavailable") throw new TrackerClientError(code);
        if (response.status === 403) throw new TrackerClientError("permission_denied");
        throw new TrackerClientError(response.status >= 500 ? "server_error" : "invalid_request");
      }
      if (response.status === 204) return schema.parse({});
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) throw new TrackerClientError("server_error");
      return parsed.data;
    } catch (error) {
      if (error instanceof TrackerClientError) throw error;
      throw new TrackerClientError(signal?.aborted ? "offline" : "offline");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  async list(signal?: AbortSignal): Promise<TrackerSummary[]> {
    return (await this.request("/trackers/list", {}, trackerListResponseSchema, signal)).trackers;
  }
  create(request: CreateTrackerRequest) { return this.request("/trackers/create", request, trackerSummarySchema); }
  rename(request: Parameters<TrackerClient["rename"]>[0]) { return this.request("/trackers/rename", request, trackerSummarySchema); }
  archive(scope: TrackerScope) { return this.request("/trackers/archive", scope, trackerSummarySchema); }
  restore(scope: TrackerScope) { return this.request("/trackers/restore", scope, trackerSummarySchema); }
  async leave(scope: TrackerScope) { await this.request("/trackers/leave", scope, emptyResponseSchema); }
  async members(scope: TrackerScope): Promise<TrackerMember[]> { return (await this.request("/trackers/members", scope, trackerMembersResponseSchema)).members; }
  async setRole(request: Parameters<TrackerClient["setRole"]>[0]) { await this.request("/trackers/role", request, emptyResponseSchema); }
  async removeMember(request: Parameters<TrackerClient["removeMember"]>[0]) { await this.request("/trackers/remove", request, emptyResponseSchema); }
  invite(request: Parameters<TrackerClient["invite"]>[0]): Promise<InvitationResult> { return this.request("/trackers/invite", request, invitationResultSchema); }
  async revokeInvitation(request: Parameters<TrackerClient["revokeInvitation"]>[0]) { await this.request("/trackers/revoke-invitation", request, emptyResponseSchema); }
  previewInvitation(token: string): Promise<InvitationPreview> { return this.request("/trackers/preview-invitation", { token }, invitationPreviewSchema); }
  acceptInvitation(token: string) { return this.request("/trackers/accept-invitation", { token }, trackerSummarySchema); }

  push(request: SharedPushRequest, signal?: AbortSignal): Promise<SharedPushResponse> { return this.request("/sync/v2/push", request, sharedPushResponseSchema, signal); }
  pull(request: SharedPullRequest, signal?: AbortSignal): Promise<SharedPullResponse> { return this.request("/sync/v2/pull", request, sharedPullResponseSchema, signal); }
  resolveConflict(request: SharedResolveRequest, signal?: AbortSignal): Promise<SharedPushResponse> { return this.request("/sync/v2/conflicts/resolve", request, sharedPushResponseSchema, signal); }
}
