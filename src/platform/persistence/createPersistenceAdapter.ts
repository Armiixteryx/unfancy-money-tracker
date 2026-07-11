import { MemoryPersistenceAdapter } from "./memoryPersistenceAdapter";
import type { PersistenceAdapter } from "./types";

export function createPersistenceAdapter(namespace: string): PersistenceAdapter {
  // Expo Metro replaces this module with the .native.ts or .web.ts variant.
  // The memory adapter keeps Node-based domain/store tests platform-neutral.
  void namespace;
  return new MemoryPersistenceAdapter();
}
