import { pullRequestSchema, pullResponseSchema, pushRequestSchema, pushResponseSchema, resolveConflictRequestSchema, SyncClientError, type PullRequest, type PullResponse, type PushRequest, type PushResponse, type ResolveConflictRequest, type SyncClient } from "./types";

type AccessTokenProvider = () => Promise<string | null>;
type HttpSyncClientConfig = { fetcher?: typeof fetch };

export class HttpSyncClient implements SyncClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly baseUrl: string, private readonly getAccessToken: AccessTokenProvider, config: HttpSyncClientConfig = {}) {
    this.fetcher = config.fetcher ?? fetch;
  }

  push(request: PushRequest): Promise<PushResponse> {
    return this.request("/sync/push", "POST", pushRequestSchema.parse(request), pushResponseSchema);
  }

  pull(request: PullRequest): Promise<PullResponse> {
    return this.request("/sync/pull", "POST", pullRequestSchema.parse(request), pullResponseSchema);
  }

  resolveConflict(request: ResolveConflictRequest): Promise<PushResponse> {
    return this.request("/sync/conflicts/resolve", "POST", resolveConflictRequestSchema.parse(request), pushResponseSchema);
  }

  private async request<T>(path: string, method: "POST", body: unknown, responseSchema: { parse(value: unknown): T }): Promise<T> {
    const token = await this.getAccessToken();
    if (!token) throw new SyncClientError("unauthenticated", "Sign in again to sync your data.");
    try {
      const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        if (response.status === 409) throw new SyncClientError("conflict", "A sync conflict needs your choice.");
        if (response.status === 401 || response.status === 403) throw new SyncClientError("unauthenticated", "Sign in again to sync your data.");
        throw new SyncClientError("server_error", "Sync is temporarily unavailable.");
      }
      try {
        return responseSchema.parse(await response.json());
      } catch {
        throw new SyncClientError("invalid_request", "The sync service returned an invalid response.");
      }
    } catch (error) {
      if (error instanceof SyncClientError) throw error;
      throw new SyncClientError("offline", "Sync is unavailable while offline.");
    }
  }
}
