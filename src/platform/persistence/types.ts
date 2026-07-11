import type { Dataset } from "../../domain/types";

export type HydrationState =
  | { status: "loading" }
  | { status: "ready"; dataset: Dataset }
  | { status: "recovery"; errorCode: PersistenceRecoveryCode; backupAvailable: boolean };

export type PersistenceRecoveryCode =
  | "snapshot_unreadable"
  | "snapshot_invalid"
  | "migration_failed"
  | "encryption_key_unavailable"
  | "storage_unavailable";

export interface PersistenceAdapter {
  readSnapshot(): Promise<string | null>;
  writeSnapshot(snapshot: string): Promise<void>;
  quarantineSnapshot(snapshot: string): Promise<void>;
  reset(): Promise<void>;
}

