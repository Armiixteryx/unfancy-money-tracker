import { errorCode, type ErrorCode } from "../../domain/errors";
import { z } from "zod";
import { resolveLocalApiUrl } from "../../platform/runtime/localApiUrl";
import {
  voiceRequestSchema,
  voiceResponseSchema,
  voiceErrorMessages,
  type VoiceRequest,
  type VoiceResponse,
} from "../../contracts/voice";
export class VoiceClientError extends Error {
  readonly code: ErrorCode;
  constructor(message: string) { super(message); this.code = errorCode(message); }
}

export function resolveVoiceExpenseUrl(configuredUrl: string): string {
  const url = new URL(resolveLocalApiUrl(configuredUrl));
  url.pathname =
    url.pathname
      .replace(/\/(?:rates|voice\/expense)\/?$/, "")
      .replace(/\/$/, "") + "/voice/expense";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function requestVoiceExpense(
  request: VoiceRequest,
  signal: AbortSignal,
): Promise<VoiceResponse> {
  const configured = process.env.EXPO_PUBLIC_VOICE_API_URL;
  if (!configured)
    throw new VoiceClientError(
      "Voice entry is not configured. Enter manually.",
    );
  const response = await fetch(resolveVoiceExpenseUrl(configured), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(voiceRequestSchema.parse(request)),
    signal,
  });
  if (!response.ok) {
    let code: unknown;
    try {
      const body = z.object({ code: z.string() }).parse(await response.json());
      code = body.code;
    } catch {
      /* Only local, sanitized messages are shown. */
    }
    throw new VoiceClientError(
      typeof code === "string" && code in voiceErrorMessages
        ? voiceErrorMessages[code as keyof typeof voiceErrorMessages]
        : voiceErrorMessages.unavailable,
    );
  }
  const parsed = voiceResponseSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.requestId !== request.requestId)
    throw new VoiceClientError(voiceErrorMessages.unavailable);
  return parsed.data;
}
