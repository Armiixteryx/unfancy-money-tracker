import { WebPersistenceAdapter } from "./webPersistenceAdapter";
import type { PersistenceAdapter } from "./types";

export function createPersistenceAdapter(namespace: string): PersistenceAdapter {
  return new WebPersistenceAdapter(namespace);
}

