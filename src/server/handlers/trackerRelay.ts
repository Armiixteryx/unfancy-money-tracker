import { createHash, randomBytes } from "node:crypto";
import { AdminGetUserCommand, CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { z } from "zod";
import {
  createTrackerRequestSchema,
  inviteTrackerRequestSchema,
  invitationPreviewSchema,
  invitationResultSchema,
  invitationTokenRequestSchema,
  memberRoleRequestSchema,
  removeMemberRequestSchema,
  renameTrackerRequestSchema,
  revokeInvitationRequestSchema,
  trackerListResponseSchema,
  trackerMembersResponseSchema,
  trackerScopeSchema,
  trackerSummarySchema,
} from "../contracts/trackers";
import { handleInternalOperation, getSubject } from "./sync";

const cognito = new CognitoIdentityProviderClient({ maxAttempts: 2, requestHandler: { connectionTimeout: 1000, requestTimeout: 4000 } });
const lambda = new LambdaClient({ maxAttempts: 2, requestHandler: { connectionTimeout: 1000, requestTimeout: 25000 } });
const bodyLimit = 16 * 1024;
type VerifiedAccount = { subject: string; email: string };

class RelayError extends Error {
  constructor(readonly code: string) { super(code); }
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const actor = await getSubject(event);
    if (!actor) return json(401, { error: "unauthenticated" });
    const segments = event.rawPath.split("/").filter(Boolean);
    const action = segments[segments.length - 1];
    const body = parseBody(event.body, event.isBase64Encoded);
    if (event.requestContext.http.method !== "POST") return json(404, { error: "not_found" });

    if (action === "list") {
      const result = await invoke({ operation: "tracker.list", actor });
      return result.ok ? json(200, trackerListResponseSchema.parse({ trackers: result.value })) : relayFailure(result.code);
    }
    if (action === "create") {
      const request = createTrackerRequestSchema.parse(body);
      const account = await getVerifiedAccountBySubject(actor);
      const result = await invoke({ operation: "tracker.create", actor, actorEmail: account.email, request });
      return result.ok ? json(200, trackerSummarySchema.parse(result.value)) : relayFailure(result.code);
    }

    if (action === "invite") {
      const request = inviteTrackerRequestSchema.parse(body);
      const joinOrigin = configuredJoinOrigin();
      const authorization = await invoke({ operation: "tracker.assert-admin", actor, scope: projectTrackerScope(request) });
      if (!authorization.ok) return relayFailure(authorization.code);
      const target = await getVerifiedAccountByEmail(request.email);
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const result = await invoke({ operation: "tracker.invite", actor, request, target, tokenHash });
      if (!result.ok) return relayFailure(result.code);
      const invitation = z.object({ invitationId: z.string().uuid(), expiresAt: z.string().datetime() }).strict().parse(result.value);
      const url = new URL("/join", joinOrigin);
      url.hash = `token=${token}`;
      return json(200, invitationResultSchema.parse({ ...invitation, url: url.toString() }));
    }

    if (action === "preview-invitation") {
      const { token } = invitationTokenRequestSchema.parse(body);
      const result = await invoke({ operation: "tracker.preview-invitation", actor, tokenHash: hashToken(token) });
      return result.ok ? json(200, invitationPreviewSchema.parse(result.value)) : relayFailure(result.code);
    }
    if (action === "accept-invitation") {
      const { token } = invitationTokenRequestSchema.parse(body);
      const account = await getVerifiedAccountBySubject(actor);
      const result = await invoke({ operation: "tracker.accept-invitation", actor, actorEmail: account.email, tokenHash: hashToken(token) });
      return result.ok ? json(200, trackerSummarySchema.parse(result.value)) : relayFailure(result.code);
    }

    if (action === "rename") {
      const request = renameTrackerRequestSchema.parse(body);
      const result = await invoke({ operation: "tracker.rename", actor, request });
      return result.ok ? json(200, trackerSummarySchema.parse(result.value)) : relayFailure(result.code);
    }
    if (action === "archive" || action === "restore" || action === "leave" || action === "members") {
      const parsedScope = trackerScopeSchema.parse(body);
      const operation = action === "archive" ? "tracker.archive" : action === "restore" ? "tracker.restore" : action === "leave" ? "tracker.leave" : "tracker.members";
      const result = await invoke({ operation, actor, scope: parsedScope } as const);
      if (!result.ok) return relayFailure(result.code);
      if (action === "archive" || action === "restore") return json(200, trackerSummarySchema.parse(result.value));
      if (action === "members") return json(200, trackerMembersResponseSchema.parse({ members: result.value }));
      return json(200, {});
    }
    if (action === "role") {
      const request = memberRoleRequestSchema.parse(body);
      const result = await invoke({ operation: "tracker.role", actor, request });
      return result.ok ? json(200, {}) : relayFailure(result.code);
    }
    if (action === "remove") {
      const request = removeMemberRequestSchema.parse(body);
      const result = await invoke({ operation: "tracker.remove", actor, request });
      return result.ok ? json(200, {}) : relayFailure(result.code);
    }
    if (action === "revoke-invitation") {
      const request = revokeInvitationRequestSchema.parse(body);
      const result = await invoke({ operation: "tracker.revoke-invitation", actor, request });
      return result.ok ? json(200, {}) : relayFailure(result.code);
    }
    return json(404, { error: "not_found" });
  } catch (error) {
    if (error instanceof RelayError) return relayFailure(error.code);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json(400, { error: "invalid_request" });
    return json(500, { error: "server_error" });
  }
}

/** Keep action-specific fields out of strict membership-scope worker messages. */
export function projectTrackerScope(request: { datasetId: string; membershipId: string }) {
  return { datasetId: request.datasetId, membershipId: request.membershipId };
}

type WorkerResult = { ok: true; value: unknown } | { ok: false; code: string };
async function invoke(request: unknown): Promise<WorkerResult> {
  if (process.env.APP_ENV === "local")
    return await handleInternalOperation(request) as WorkerResult;
  const functionName = process.env.SYNC_WORKER_FUNCTION_NAME;
  if (!functionName) return { ok: false, code: "server_error" };
  try {
    const response = await lambda.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(request)),
    }));
    if (response.FunctionError || !response.Payload) return { ok: false, code: "server_error" };
    const parsed = JSON.parse(Buffer.from(response.Payload).toString("utf8")) as unknown;
    const result = z.union([
      z.object({ ok: z.literal(true), value: z.unknown() }).strict(),
      z.object({ ok: z.literal(false), code: z.string() }).strict(),
    ]).safeParse(parsed);
    return result.success ? result.data : { ok: false, code: "server_error" };
  } catch {
    return { ok: false, code: "server_error" };
  }
}

async function getVerifiedAccountByEmail(email: string): Promise<VerifiedAccount> {
  const poolId = requiredPoolId();
  try {
    const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: email }));
    return verifiedAccount(user, email);
  } catch {
    throw new RelayError("invitee_unavailable");
  }
}

async function getVerifiedAccountBySubject(subject: string): Promise<VerifiedAccount> {
  const poolId = requiredPoolId();
  try {
    const escaped = subject.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    const listed = await cognito.send(new ListUsersCommand({ UserPoolId: poolId, Filter: `sub = "${escaped}"`, Limit: 1 }));
    const username = listed.Users?.[0]?.Username;
    if (!username) throw new Error("unavailable");
    const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: username }));
    return verifiedAccount(user, undefined, subject);
  } catch {
    throw new RelayError("invitee_unavailable");
  }
}

function verifiedAccount(user: { Enabled?: boolean; UserStatus?: string; UserAttributes?: { Name?: string; Value?: string }[] }, expectedEmail?: string, expectedSubject?: string): VerifiedAccount {
  const attributes = new Map((user.UserAttributes ?? []).map(({ Name, Value }) => [Name, Value]));
  const subject = attributes.get("sub");
  const email = attributes.get("email");
  const verified = attributes.get("email_verified");
  if (!user.Enabled || user.UserStatus !== "CONFIRMED" || !subject || !email || verified !== "true")
    throw new Error("unavailable");
  if (expectedSubject && subject !== expectedSubject) throw new Error("unavailable");
  if (expectedEmail && normalizeEmail(email) !== normalizeEmail(expectedEmail)) throw new Error("unavailable");
  return { subject, email: normalizeEmail(email) };
}

function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
function requiredPoolId(): string {
  const poolId = process.env.COGNITO_USER_POOL_ID;
  if (!poolId) throw new Error("Cognito pool is not configured");
  return poolId;
}
function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function configuredJoinOrigin(): string {
  const raw = process.env.PUBLIC_APP_ORIGIN;
  if (!raw) throw new RelayError("server_error");
  try {
    const parsed = new URL(raw);
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || !["", "/"].includes(parsed.pathname))
      throw new Error("invalid origin");
    if (parsed.protocol !== "https:" && !(process.env.APP_ENV === "local" && localHost && parsed.protocol === "http:"))
      throw new Error("invalid origin");
    return parsed.origin;
  } catch {
    throw new RelayError("server_error");
  }
}
function parseBody(body: string | undefined, isBase64Encoded?: boolean): unknown {
  if (!body) return {};
  const decoded = isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
  if (Buffer.byteLength(decoded) > bodyLimit) throw new SyntaxError("request too large");
  return JSON.parse(decoded);
}
function relayFailure(code: string): APIGatewayProxyResultV2 {
  const status = code === "invalid_request" || code === "invitation_invalid" ? 400
    : code === "membership_revoked" || code === "permission_denied" ? 403
    : code === "tracker_archived" || code === "last_admin" || code === "invitee_unavailable" ? 409
    : 500;
  return json(status, { error: code });
}
function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) };
}
