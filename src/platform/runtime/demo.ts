/** Demo is an explicit build target; missing cloud configuration never enables it. */
export function isDemoRuntime(): boolean {
  return process.env.EXPO_PUBLIC_ENV === "demo";
}
