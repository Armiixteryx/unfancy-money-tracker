import { z } from "zod";
import { authClient } from "../../platform/auth/client";
import { resolveLocalApiUrl } from "../../platform/runtime/localApiUrl";
import { resolveVoiceBackendUrl } from "../voice/api";
import {
  bootstrapResponseSchema,
  pullResponseSchema,
  pushResponseSchema,
  SyncClientError,
  type PushRequest,
  type PullRequest,
  type ResolveConflictRequest,
  type SyncClient,
} from "../../server/contracts/sync";

export function resolveSyncBackendUrl(
  explicit: string | undefined,
  backend = process.env.EXPO_PUBLIC_VOICE_BACKEND ?? "local",
): string {
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (
        !["local", "dev", "prod"].includes(backend) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (backend === "local"
          ? !["http:", "https:"].includes(url.protocol)
          : url.protocol !== "https:")
      )
        throw new Error();
      return resolveLocalApiUrl(url.toString()).replace(/\/$/, "");
    } catch {
      throw new SyncClientError("invalid_request");
    }
  }
  return resolveVoiceBackendUrl({
    backend,
    localUrl: process.env.EXPO_PUBLIC_VOICE_API_URL,
    devUrl: process.env.EXPO_PUBLIC_VOICE_DEV_API_URL,
    prodUrl: process.env.EXPO_PUBLIC_VOICE_PROD_API_URL,
  }).replace(/\/voice\/expense\/?$/, "");
}

export class HttpSyncClient implements SyncClient {
  constructor(
    private readonly endpoint = () =>
      resolveSyncBackendUrl(process.env.EXPO_PUBLIC_SYNC_API_URL),
  ) {}
  private async request<T>(
    route: string,
    value: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let token: string;
    try {
      token = await authClient.accessToken();
    } catch {
      throw new SyncClientError("unauthenticated");
    }
    const timeout = new AbortController();
    const abort = () => timeout.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 25000);
    try {
      if (signal?.aborted) throw new SyncClientError("offline");
      const response = await fetch(`${this.endpoint()}/sync/${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(value),
        signal: timeout.signal,
      });
      if (response.status === 401 || response.status === 403)
        throw new SyncClientError("unauthenticated");
      if (!response.ok)
        throw new SyncClientError(
          response.status >= 500 ? "server_error" : "invalid_request",
        );
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) throw new SyncClientError("server_error");
      return parsed.data;
    } catch (error) {
      if (error instanceof SyncClientError) throw error;
      throw new SyncClientError("offline");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  bootstrap(signal?: AbortSignal) {
    return this.request("bootstrap", {}, bootstrapResponseSchema, signal);
  }
  push(request: PushRequest, signal?: AbortSignal) {
    return this.request("push", request, pushResponseSchema, signal);
  }
  pull(request: PullRequest, signal?: AbortSignal) {
    return this.request("pull", request, pullResponseSchema, signal);
  }
  resolveConflict(request: ResolveConflictRequest, signal?: AbortSignal) {
    return this.request(
      "conflicts/resolve",
      request,
      pushResponseSchema,
      signal,
    );
  }
}
