import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { pullRequestSchema, pushRequestSchema, resolveConflictRequestSchema } from "../contracts/sync";
import { DynamoDbSyncRepository, type SyncRepository } from "../repository";

let repository: Promise<SyncRepository> | null = null;

async function getRepository(): Promise<SyncRepository> {
  if (!repository) repository = createRepository();
  return repository;
}

async function createRepository(): Promise<SyncRepository> {
  const tableName = process.env.SYNC_TABLE_NAME;
  if (!tableName) throw new Error("Sync persistence is not configured");
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  const client = new DynamoDBClient({
    endpoint,
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: endpoint
      ? { accessKeyId: "local", secretAccessKey: "local" }
      : undefined
  });
  return new DynamoDbSyncRepository(
    DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } }),
    tableName
  );
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const subject = getSubject(event);
    if (!subject) return json(401, { error: "unauthenticated" });
    const body = parseBody(event.body);
    const path = event.rawPath;
    if (event.requestContext.http.method === "POST" && path.endsWith("/sync/push")) {
      const request = pushRequestSchema.parse(body);
      return json(200, await (await getRepository()).push(subject, request.datasetId, request.changes));
    }
    if (event.requestContext.http.method === "POST" && path.endsWith("/sync/pull")) {
      const request = pullRequestSchema.parse(body);
      return json(200, await (await getRepository()).pull(subject, request.datasetId, request.cursor));
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

function getSubject(event: APIGatewayProxyEventV2): string | null {
  const requestContext = event.requestContext as APIGatewayProxyEventV2["requestContext"] & {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
  const claims = requestContext.authorizer?.jwt?.claims;
  const claimedSubject = typeof claims?.sub === "string" ? claims.sub : null;
  if (claimedSubject) return claimedSubject;
  const isLocalRuntime = process.env.APP_ENV === "local" || process.env.AWS_SAM_LOCAL === "true";
  if (isLocalRuntime) return event.headers?.["x-local-subject"] ?? event.headers?.["X-Local-Subject"] ?? null;
  return null;
}

function parseBody(body: string | undefined): unknown {
  return body ? JSON.parse(body) : {};
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
