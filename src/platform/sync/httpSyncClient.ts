import { pullRequestSchema, pushRequestSchema, resolveConflictRequestSchema, SyncClientError, type PullRequest, type PullResponse, type PushRequest, type PushResponse, type ResolveConflictRequest, type SyncClient } from "./types";

type AccessTokenProvider = () => Promise<string | null>;

export class HttpSyncClient implements SyncClient {
  constructor(private readonly baseUrl: string, private readonly getAccessToken: AccessTokenProvider) {}

  push(request: PushRequest): Promise<PushResponse> {
    return this.request("/sync/push", "POST", pushRequestSchema.parse(request));
  }

  pull(request: PullRequest): Promise<PullResponse> {
    return this.request("/sync/pull", "POST", pullRequestSchema.parse(request));
  }

  resolveConflict(request: ResolveConflictRequest): Promise<PushResponse> {
    return this.request("/sync/conflicts/resolve", "POST", resolveConflictRequestSchema.parse(request));
  }

  private async request<T>(path: string, method: "POST", body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    if (!token) throw new SyncClientError("unauthenticated", "Sign in again to sync your data.");
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        if (response.status === 409) throw new SyncClientError("conflict", "A sync conflict needs your choice.");
        if (response.status === 401 || response.status === 403) throw new SyncClientError("unauthenticated", "Sign in again to sync your data.");
        throw new SyncClientError("server_error", "Sync is temporarily unavailable.");
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof SyncClientError) throw error;
      throw new SyncClientError("offline", "Sync is unavailable while offline.");
    }
  }
}

