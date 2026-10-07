import { CognitoJwtVerifier } from "aws-jwt-verify";
import { z } from "zod";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { pullRequestSchema, pushRequestSchema, resolveConflictRequestSchema } from "../contracts/sync";
import {
  sharedPullRequestSchema,
  sharedResolveRequestSchema,
  sharedPushRequestSchema,
  trackerScopeSchema,
} from "../contracts/trackers";
import { PostgresSyncRepository } from "../repository/postgresSyncRepository";
import { InvalidSyncPayloadError } from "../repository/syncRepository";
import { PostgresTrackerRepository, TrackerRepositoryError } from "../repository/postgresTrackerRepository";
import { getPostgresPool } from "../repository/postgres";
async function getRepository() { return new PostgresSyncRepository(await getPostgresPool()); }
async function getTrackerRepository() { return new PostgresTrackerRepository(await getPostgresPool()); }

const internalOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("tracker.list"), actor: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("tracker.create"), actor: z.string().min(1), actorEmail: z.string().email(), request: z.unknown() }).strict(),
  z.object({ operation: z.literal("tracker.rename"), actor: z.string().min(1), request: z.unknown() }).strict(),
  z.object({ operation: z.literal("tracker.archive"), actor: z.string().min(1), scope: trackerScopeSchema }).strict(),
  z.object({ operation: z.literal("tracker.restore"), actor: z.string().min(1), scope: trackerScopeSchema }).strict(),
  z.object({ operation: z.literal("tracker.leave"), actor: z.string().min(1), scope: trackerScopeSchema }).strict(),
  z.object({ operation: z.literal("tracker.members"), actor: z.string().min(1), scope: trackerScopeSchema }).strict(),
  z.object({ operation: z.literal("tracker.role"), actor: z.string().min(1), request: z.unknown() }).strict(),
  z.object({ operation: z.literal("tracker.remove"), actor: z.string().min(1), request: z.unknown() }).strict(),
  z.object({ operation: z.literal("tracker.assert-admin"), actor: z.string().min(1), scope: trackerScopeSchema }).strict(),
  z.object({ operation: z.literal("tracker.authorize-voice"), actor: z.string().min(1), scope: trackerScopeSchema }).strict(),
  z.object({ operation: z.literal("tracker.invite"), actor: z.string().min(1), request: z.unknown(), target: z.object({ subject: z.string().min(1), email: z.string().email() }).strict(), tokenHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
  z.object({ operation: z.literal("tracker.revoke-invitation"), actor: z.string().min(1), request: z.unknown() }).strict(),
  z.object({ operation: z.literal("tracker.preview-invitation"), actor: z.string().min(1), tokenHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
  z.object({ operation: z.literal("tracker.accept-invitation"), actor: z.string().min(1), actorEmail: z.string().email(), tokenHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
]);

export type InternalWorkerResult = { ok: true; value: unknown } | { ok: false; code: string };

/** IAM-only worker interface used by the public relay and voice Lambda. */
export async function handleInternalOperation(input: unknown): Promise<InternalWorkerResult> {
  try {
    const operation = internalOperationSchema.parse(input);
    const trackers = await getTrackerRepository();
    let value: unknown;
    switch (operation.operation) {
      case "tracker.list": value = await trackers.list(operation.actor); break;
      case "tracker.create": value = await trackers.create(operation.actor, operation.actorEmail, operation.request); break;
      case "tracker.rename": value = await trackers.rename(operation.actor, operation.request); break;
      case "tracker.archive": value = await trackers.archive(operation.actor, operation.scope); break;
      case "tracker.restore": value = await trackers.archive(operation.actor, operation.scope, true); break;
      case "tracker.leave": await trackers.leave(operation.actor, operation.scope); value = {}; break;
      case "tracker.members": value = await trackers.members(operation.actor, operation.scope); break;
      case "tracker.role": await trackers.setRole(operation.actor, operation.request); value = {}; break;
      case "tracker.remove": await trackers.removeMember(operation.actor, operation.request); value = {}; break;
      case "tracker.assert-admin": await trackers.assertAdmin(operation.actor, operation.scope); value = {}; break;
      case "tracker.authorize-voice": await trackers.authorizeActiveMember(operation.actor, operation.scope); value = {}; break;
      case "tracker.invite": value = await trackers.createInvitation(operation.actor, operation.request, operation.target, operation.tokenHash); break;
      case "tracker.revoke-invitation": await trackers.revokeInvitation(operation.actor, operation.request); value = {}; break;
      case "tracker.preview-invitation": value = await trackers.previewInvitation(operation.actor, operation.tokenHash); break;
      case "tracker.accept-invitation": value = await trackers.acceptInvitation(operation.actor, operation.actorEmail, operation.tokenHash); break;
    }
    return { ok: true, value };
  } catch (error) {
    if (error instanceof TrackerRepositoryError) return { ok: false, code: error.code };
    if (error instanceof InvalidSyncPayloadError || (error instanceof Error && error.name === "ZodError"))
      return { ok: false, code: "invalid_request" };
    if (error instanceof Error && ["membership_revoked", "permission_denied", "tracker_archived"].includes(error.message))
      return { ok: false, code: error.message };
    return { ok: false, code: "server_error" };
  }
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2 | InternalWorkerResult> {
  try {
    if (typeof event === "object" && event !== null && "operation" in event)
      return await handleInternalOperation(event);
    const subject = await getSubject(event);
    if (!subject) return json(401, { error: "unauthenticated" });
    if (event.requestContext.http.method === "POST" && event.rawPath.endsWith("/sync/bootstrap")) return json(200, await (await getRepository()).bootstrap(subject));
    const body = parseBody(event.body);
    const path = event.rawPath;
    if (event.requestContext.http.method === "POST" && path.endsWith("/sync/push")) {
      const request = pushRequestSchema.parse(body);
      return json(200, await (await getRepository()).push(subject, request.datasetId, request.changes));
    }
    if (event.requestContext.http.method === "POST" && path.endsWith("/sync/pull")) {
      const request = pullRequestSchema.parse(body);
      return json(200, await (await getRepository()).pull(subject, request.datasetId, request.cursor, request.limit));
    }
    if (event.requestContext.http.method === "POST" && path.endsWith("/sync/conflicts/resolve")) {
      const request = resolveConflictRequestSchema.parse(body);
      return json(200, await (await getRepository()).resolveConflict(subject, request));
    }
    if (event.requestContext.http.method === "POST" && path.endsWith("/sync/v2/push")) {
      const request = sharedPushRequestSchema.parse(body);
      return json(200, await (await getRepository()).pushShared(subject, request));
    }
    if (event.requestContext.http.method === "POST" && path.endsWith("/sync/v2/pull")) {
      const request = sharedPullRequestSchema.parse(body);
      return json(200, await (await getRepository()).pullShared(subject, request));
    }
    if (event.requestContext.http.method === "POST" && path.endsWith("/sync/v2/conflicts/resolve")) {
      const request = sharedResolveRequestSchema.parse(body);
      return json(200, await (await getRepository()).resolveConflictShared(subject, request));
    }
    return json(404, { error: "not_found" });
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: "invalid_request" });
    if (error instanceof Error && error.name === "ZodError") return json(400, { error: "invalid_request" });
    if (error instanceof Error && error.name === "InvalidSyncPayloadError") return json(400, { error: "invalid_request" });
    if (error instanceof Error && error.name === "DatasetAccessError") return json(403, { error: "forbidden" });
    if (error instanceof TrackerRepositoryError) return json(trackerStatus(error.code), { error: error.code });
    if (error instanceof Error && ["membership_revoked", "permission_denied", "tracker_archived"].includes(error.message))
      return json(trackerStatus(error.message), { error: error.message });
    return json(500, { error: "server_error" });
  }
}

function trackerStatus(code: string): number {
  if (code === "invalid_request" || code === "invitation_invalid") return 400;
  if (code === "membership_revoked" || code === "permission_denied") return 403;
  if (code === "tracker_archived" || code === "last_admin" || code === "invitee_unavailable") return 409;
  return 500;
}

const verifier=CognitoJwtVerifier.create({ userPoolId:process.env.COGNITO_USER_POOL_ID ?? "us-east-1_gCLS9k4s0",clientId:process.env.COGNITO_CLIENT_ID ?? "63kh2vrfpvd7h9moob0m9l2umf",tokenUse:"access",scope:"aws.cognito.signin.user.admin" });
export async function getSubject(event: APIGatewayProxyEventV2): Promise<string | null> {
  const context=event.requestContext as APIGatewayProxyEventV2["requestContext"] & { authorizer?:{ jwt?:{ claims?:Record<string,unknown> } } };
  const claims=context.authorizer?.jwt?.claims;
  if (typeof claims?.sub === "string" && claims.token_use === "access") return claims.sub;
  const isLocal=process.env.APP_ENV==="local" || process.env.AWS_SAM_LOCAL==="true";
  if (!isLocal) return null;
  // The local-only integration hook is disabled unless explicitly opted in by the test runner.
  if (process.env.ALLOW_LOCAL_SYNC_SUBJECT==="1") {
    const subject=event.headers?.["x-local-subject"]; if (subject) return subject;
  }
  const header=event.headers?.authorization ?? event.headers?.Authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try { return (await verifier.verify(header.slice(7))).sub; } catch { return null; }
}

function parseBody(body: string | undefined): unknown {
  return body ? JSON.parse(body) : {};
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
