export const authConfig = {
  userPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID ?? "us-east-1_gCLS9k4s0",
  userPoolClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? "63kh2vrfpvd7h9moob0m9l2umf",
};
export const credentialNamespace = `unfancy.auth.${authConfig.userPoolId}.${authConfig.userPoolClientId}`;
