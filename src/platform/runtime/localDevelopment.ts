export function isLocalDevelopmentRuntime(): boolean {
  return process.env.EXPO_PUBLIC_ENV === "local";
}
