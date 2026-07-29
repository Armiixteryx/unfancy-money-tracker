import { describe, expect, it } from "vitest";

import { readRuntimeCloudConfig } from "./cloudConfig";

describe("runtime cloud configuration", () => {
  it("routes local and dev builds to the dev backend", () => {
    for (const appEnvironment of ["local", "dev"]) {
      const result = readRuntimeCloudConfig({
        EXPO_PUBLIC_ENV: appEnvironment,
        EXPO_PUBLIC_COGNITO_REGION: "us-east-1",
        EXPO_PUBLIC_COGNITO_CLIENT_ID: "client-id",
        EXPO_PUBLIC_SYNC_API_URL: "https://api.example.test"
      });
      expect(result).toEqual({
        ok: true,
        value: {
          appEnvironment,
          backendStage: "dev",
          cognitoRegion: "us-east-1",
          cognitoClientId: "client-id",
          syncApiUrl: "https://api.example.test"
        }
      });
    }
  });

  it("routes production builds only to the production backend", () => {
    const result = readRuntimeCloudConfig({
      EXPO_PUBLIC_ENV: "prod",
      EXPO_PUBLIC_COGNITO_REGION: "us-east-1",
      EXPO_PUBLIC_COGNITO_CLIENT_ID: "prod-client",
      EXPO_PUBLIC_SYNC_API_URL: "https://prod.example.test"
    });
    expect(result.ok && result.value.backendStage).toBe("prod");
  });

  it("keeps anonymous use available when cloud configuration is incomplete", () => {
    expect(readRuntimeCloudConfig({ EXPO_PUBLIC_ENV: "local" })).toEqual({
      ok: false,
      message: "Cloud backup is not configured for this build. Anonymous local tracking remains available."
    });
  });
});
