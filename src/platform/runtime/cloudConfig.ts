import { z } from "zod";

export type BackendStage = "dev" | "prod";

export type RuntimeCloudConfig = {
  appEnvironment: "local" | "dev" | "prod";
  backendStage: BackendStage;
  cognitoRegion: string;
  cognitoClientId: string;
  syncApiUrl: string;
};

export type RuntimeCloudConfigResult =
  | { ok: true; value: RuntimeCloudConfig }
  | { ok: false; message: string };

const runtimeCloudConfigSchema = z.object({
  appEnvironment: z.enum(["local", "dev", "prod"]),
  cognitoRegion: z.string().min(1),
  cognitoClientId: z.string().min(1),
  syncApiUrl: z.string().url()
});

export function readRuntimeCloudConfig(
  environment: Record<string, string | undefined> = process.env
): RuntimeCloudConfigResult {
  const parsed = runtimeCloudConfigSchema.safeParse({
    appEnvironment: environment.EXPO_PUBLIC_ENV,
    cognitoRegion: environment.EXPO_PUBLIC_COGNITO_REGION,
    cognitoClientId: environment.EXPO_PUBLIC_COGNITO_CLIENT_ID,
    syncApiUrl: environment.EXPO_PUBLIC_SYNC_API_URL
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Cloud backup is not configured for this build. Anonymous local tracking remains available."
    };
  }
  return {
    ok: true,
    value: {
      ...parsed.data,
      backendStage: parsed.data.appEnvironment === "prod" ? "prod" : "dev"
    }
  };
}
