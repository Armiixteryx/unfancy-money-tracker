import { normalizeDeveloperSeedPath } from "../src/features/development/normalizeDeveloperSeedPath";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return normalizeDeveloperSeedPath(path);
}
