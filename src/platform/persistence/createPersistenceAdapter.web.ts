import { WebPersistenceAdapter } from "./webPersistenceAdapter";
import type { PersistenceAdapter } from "./types";
import { isDemoRuntime } from "../runtime/demo";
import { demoPersistenceAdapter } from "../../features/demo/persistence";

export function createPersistenceAdapter(namespace: string): PersistenceAdapter {
  if (isDemoRuntime()) return demoPersistenceAdapter(namespace);
  return new WebPersistenceAdapter(namespace);
}

