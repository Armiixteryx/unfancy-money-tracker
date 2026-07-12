import { MemoryRateCache } from "./memoryRateCache";
import type { RateCache } from "./types";

export function createRateCache(): RateCache {
  return new MemoryRateCache();
}
