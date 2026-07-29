import { CognitoAuthClient } from "../auth/cognitoAuthClient";
import { RuntimeAuthSessionStore } from "../auth/sessionStore";
import type { AuthClient } from "../auth/types";
import { HttpSyncClient } from "../sync/httpSyncClient";
import type { SyncClient } from "../sync/types";
import type { RuntimeCloudConfig } from "./cloudConfig";

export function createRuntimeAuthClient(config: RuntimeCloudConfig): AuthClient {
  return new CognitoAuthClient({
    region: config.cognitoRegion,
    clientId: config.cognitoClientId,
    backendStage: config.backendStage,
    sessionStore: new RuntimeAuthSessionStore(config.backendStage)
  });
}

export function createRuntimeSyncClient(
  config: RuntimeCloudConfig,
  getAccessToken: () => Promise<string | null>
): SyncClient {
  return new HttpSyncClient(config.syncApiUrl, getAccessToken);
}
