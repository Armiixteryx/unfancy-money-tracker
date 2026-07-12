import { CognitoAuthClient } from "../auth/cognitoAuthClient";
import { LocalAuthClient } from "../auth/localAuthClient";
import { RuntimeAuthSessionStore } from "../auth/sessionStore";
import type { AuthClient } from "../auth/types";
import { HttpSyncClient } from "../sync/httpSyncClient";
import { LocalSyncClient } from "../sync/localSyncClient";
import type { SyncClient } from "../sync/types";

export function createRuntimeAuthClient(): AuthClient {
  const region = process.env.EXPO_PUBLIC_COGNITO_REGION;
  const clientId = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID;
  return region && clientId ? new CognitoAuthClient({ region, clientId }) : new LocalAuthClient(new RuntimeAuthSessionStore());
}

export function createRuntimeSyncClient(getAccessToken: () => Promise<string | null>): SyncClient {
  const baseUrl = process.env.EXPO_PUBLIC_SYNC_API_URL;
  return baseUrl ? new HttpSyncClient(baseUrl, getAccessToken) : new LocalSyncClient();
}

export function runtimeCloudMode(): "configured" | "local" {
  return process.env.EXPO_PUBLIC_COGNITO_REGION && process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID && process.env.EXPO_PUBLIC_SYNC_API_URL ? "configured" : "local";
}
