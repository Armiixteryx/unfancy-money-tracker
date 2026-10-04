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

export class VoiceAuthenticationError extends VoiceClientError {
  constructor() { super("Sign in to use voice."); }
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

export interface VoiceBackendConfiguration {
  backend?: string;
  localUrl?: string;
  devUrl?: string;
  prodUrl?: string;
}

// Endpoint selection is independent of future voice-only authentication.
export function resolveVoiceBackendUrl(config: VoiceBackendConfiguration): string {
  const backend = config.backend ?? "local";
  const configured = backend === "local" ? config.localUrl
    : backend === "dev" ? config.devUrl
    : backend === "prod" ? config.prodUrl : undefined;
  try {
    if (!configured) throw new Error();
    const url = new URL(configured);
    if (url.username || url.password ||
        (backend === "local" ? !["http:", "https:"].includes(url.protocol) : url.protocol !== "https:"))
      throw new Error();
    return resolveVoiceExpenseUrl(configured);
  } catch {
    throw new VoiceClientError("Voice entry is not configured. Enter manually.");
  }
}

export async function requestVoiceExpense(
  request: VoiceRequest,
  signal: AbortSignal,
  accessToken: string,
): Promise<VoiceResponse> {
  if (!accessToken) throw new VoiceAuthenticationError();
  const endpoint = resolveVoiceBackendUrl({
    backend: process.env.EXPO_PUBLIC_VOICE_BACKEND,
    localUrl: process.env.EXPO_PUBLIC_VOICE_API_URL,
    devUrl: process.env.EXPO_PUBLIC_VOICE_DEV_API_URL,
    prodUrl: process.env.EXPO_PUBLIC_VOICE_PROD_API_URL,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(voiceRequestSchema.parse(request)),
    signal,
  });
  if (response.status === 401 || response.status === 403) throw new VoiceAuthenticationError();
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
