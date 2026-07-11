import { NativePersistenceAdapter } from "./nativePersistenceAdapter";
import type { PersistenceAdapter } from "./types";

export function createPersistenceAdapter(namespace: string): PersistenceAdapter {
  return new NativePersistenceAdapter(namespace);
}

