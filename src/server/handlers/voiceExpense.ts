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
import {
  classifyExpense,
  sanitizeProviderError,
  transcribeAudio,
} from "../voice/providers";

type Dependencies = {
  transcribe: typeof transcribeAudio;
  classify: typeof classifyExpense;
  deadlineMs?: number;
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
