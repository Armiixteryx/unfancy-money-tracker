import { CognitoJwtVerifier } from "aws-jwt-verify";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  MAX_AUDIO_BYTES,
  MAX_REQUEST_BYTES,
  voiceErrorMessages,
  voiceRequestSchema,
  voiceResponseSchema,
  type VoiceRequest,
} from "../../contracts/voice";
import { VoiceError } from "../voice/parser";
import { handleInternalOperation } from "./sync";
import {
  classifyExpense,
  sanitizeProviderError,
  transcribeAudio,
} from "../voice/providers";

const verifier = CognitoJwtVerifier.create({ userPoolId: process.env.COGNITO_USER_POOL_ID ?? "us-east-1_gCLS9k4s0", clientId: process.env.COGNITO_CLIENT_ID ?? "63kh2vrfpvd7h9moob0m9l2umf", tokenUse: "access", scope: "aws.cognito.signin.user.admin" });
export function createVoiceAuthorizer(tokenVerifier: { verify: (token: string) => Promise<unknown> }) {
  return async (event: APIGatewayProxyEventV2) => {
    const header = event.headers?.authorization ?? event.headers?.Authorization;
    if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const claims = await tokenVerifier.verify(header.slice(7));
    if (typeof claims !== "object" || claims === null || !("sub" in claims) || typeof claims.sub !== "string")
      throw new Error("Unauthorized");
    return claims.sub;
  };
}
const authorize = createVoiceAuthorizer(verifier);

type Dependencies = {
  transcribe: typeof transcribeAudio;
  classify: typeof classifyExpense;
  deadlineMs?: number;
  authorize?: (event: APIGatewayProxyEventV2) => Promise<string | void>;
  authorizeTracker?: (actor: string, scope: { datasetId: string; membershipId: string }) => Promise<void>;
};
function decodeRequest(event: APIGatewayProxyEventV2): VoiceRequest {
  if (
    !event.body ||
    event.body.length > MAX_REQUEST_BYTES * (event.isBase64Encoded ? 1.34 : 1)
  )
    throw new VoiceError("invalid_audio");
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  if (Buffer.byteLength(body) > MAX_REQUEST_BYTES)
    throw new VoiceError("invalid_audio");
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new VoiceError("invalid_audio");
  }
  const parsed = voiceRequestSchema.safeParse(raw);
  if (!parsed.success) {
    if (
      typeof raw === "object" &&
      raw !== null &&
      "categories" in raw &&
      Array.isArray(raw.categories) &&
      raw.categories.length > 255
    )
      throw new VoiceError("too_many_categories");
    throw new VoiceError("invalid_audio");
  }
  const audio = Buffer.from(parsed.data.audio, "base64");
  if (
    !audio.length ||
    audio.length > MAX_AUDIO_BYTES ||
    audio.toString("base64") !== parsed.data.audio
  )
    throw new VoiceError("invalid_audio");
  const type = parsed.data.mimeType;
  const valid = type.includes("webm")
    ? audio.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    : type.includes("ogg")
      ? audio.subarray(0, 4).toString() === "OggS"
      : audio.subarray(4, 8).toString() === "ftyp";
  if (!valid) throw new VoiceError("invalid_audio");
  return parsed.data;
}
export function createVoiceHandler(dependencies: Dependencies) {
  return async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyResultV2> => {
    let subject: string | void;
    try { subject = await (dependencies.authorize ?? authorize)(event); } catch { return { statusCode: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }, body: JSON.stringify({ code: "unauthorized" }) }; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new VoiceError("timeout"));
      }, dependencies.deadlineMs ?? 27000);
    });
    try {
      const request = decodeRequest(event);
      if (request.tracker) {
        if (!subject) return { statusCode: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }, body: JSON.stringify({ code: "unauthorized" }) };
        try {
          await (dependencies.authorizeTracker ?? authorizeTracker)(subject, request.tracker);
        } catch {
          return { statusCode: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }, body: JSON.stringify({ code: "tracker_unavailable" }) };
        }
      }
      const result = await Promise.race([
        timeout,
        (async () => {
          const text = await dependencies.transcribe(
            request,
            controller.signal,
          );
          controller.signal.throwIfAborted();
          const transaction = await dependencies.classify(
            text,
            request,
            controller.signal,
          );
          controller.signal.throwIfAborted();
          return voiceResponseSchema.parse({
            requestId: request.requestId,
            transaction,
          });
        })(),
      ]);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify(result),
      };
    } catch (error) {
      const safe = controller.signal.aborted
        ? new VoiceError("timeout")
        : sanitizeProviderError(error);
      const status =
        safe.code === "timeout"
          ? 504
          : safe.code === "throttled"
            ? 429
            : ["unavailable", "credits_exhausted"].includes(safe.code)
              ? 503
              : 422;
      return {
        statusCode: status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({
          code: safe.code,
          message: voiceErrorMessages[safe.code],
        }),
      };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
}
export const handler = createVoiceHandler({
  transcribe: transcribeAudio,
  classify: classifyExpense,
});

const workerClient = new LambdaClient({ maxAttempts: 2, requestHandler: { connectionTimeout: 1000, requestTimeout: 5000 } });
async function authorizeTracker(actor: string, scope: { datasetId: string; membershipId: string }): Promise<void> {
  const request = { operation: "tracker.authorize-voice", actor, scope };
  const result = process.env.APP_ENV === "local"
    ? await handleInternalOperation(request)
    : await invokeTrackerWorker(request);
  if (!result.ok) throw new Error("Tracker is unavailable");
}
async function invokeTrackerWorker(request: unknown): Promise<{ ok: boolean }> {
  const functionName = process.env.SYNC_WORKER_FUNCTION_NAME;
  if (!functionName) throw new Error("Tracker worker is not configured");
  const response = await workerClient.send(new InvokeCommand({ FunctionName: functionName, InvocationType: "RequestResponse", Payload: Buffer.from(JSON.stringify(request)) }));
  if (response.FunctionError || !response.Payload) throw new Error("Tracker worker is unavailable");
  const result = JSON.parse(Buffer.from(response.Payload).toString("utf8")) as unknown;
  if (typeof result !== "object" || result === null || !("ok" in result) || typeof result.ok !== "boolean")
    throw new Error("Tracker worker is unavailable");
  return result as { ok: boolean };
}
