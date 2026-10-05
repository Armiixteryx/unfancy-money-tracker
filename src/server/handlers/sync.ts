import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { pullRequestSchema, pushRequestSchema, resolveConflictRequestSchema } from "../contracts/sync";
import { PostgresSyncRepository } from "../repository/postgresSyncRepository";
import { getPostgresPool } from "../repository/postgres";
async function getRepository() { return new PostgresSyncRepository(await getPostgresPool()); }

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
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
    return json(404, { error: "not_found" });
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: "invalid_request" });
    if (error instanceof Error && error.name === "ZodError") return json(400, { error: "invalid_request" });
    if (error instanceof Error && error.name === "InvalidSyncPayloadError") return json(400, { error: "invalid_request" });
    if (error instanceof Error && error.name === "DatasetAccessError") return json(403, { error: "forbidden" });
    return json(500, { error: "server_error" });
  }
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
