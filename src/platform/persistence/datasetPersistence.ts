import { v4 as uuid } from "uuid";

import { seedDefaultCategories } from "../../domain/categories";
import type { Dataset, UUID } from "../../domain/types";
import { datasetEnvelopeSchema } from "./schema";
import type { HydrationState, PersistenceAdapter, PersistenceRecoveryCode } from "./types";
import { CURRENT_SCHEMA_VERSION } from "./version";
import { migrateSnapshot } from "./migrations";

export class PersistenceWriteError extends Error {
  readonly code = "storage_unavailable" as const;

  constructor() {
    super("Local data could not be saved");
    this.name = "PersistenceWriteError";
  }
}

export function createEmptyDataset(
  idFactory: () => UUID = uuid,
  now: string = new Date().toISOString()
): Dataset {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    datasetId: idFactory(),
    transactions: [],
    categories: seedDefaultCategories(idFactory, now),
    budgets: [],
    categoryDeletionTombstones: [],
    recordTombstones: [],
    preferences: { baseCurrency: "USD", theme: "system", analyticsConsent: false },
    sync: {
      status: "idle",
      inboxCursor: null,
      outbox: [],
      conflicts: [],
      lastSyncedAt: null,
      reason: null
    }
  };
}

function recoveryCode(error: unknown): PersistenceRecoveryCode {
  if (error instanceof SyntaxError) return "snapshot_unreadable";
  if (error instanceof Error && error.message.includes("schema version")) return "migration_failed";
  if (error instanceof Error && error.message.includes("key")) return "encryption_key_unavailable";
  if (error instanceof Error && error.message.includes("storage")) return "storage_unavailable";
  return "snapshot_invalid";
}

export async function hydrateDataset(adapter: PersistenceAdapter): Promise<HydrationState> {
  let raw: string | null;
  try {
    raw = await adapter.readSnapshot();
  } catch (error) {
    return { status: "recovery", errorCode: recoveryCode(error), backupAvailable: true };
  }

  if (raw === null) {
    return { status: "ready", dataset: createEmptyDataset() };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return { status: "ready", dataset: migrateSnapshot(parsed) };
  } catch (error) {
    try {
      await adapter.quarantineSnapshot(raw);
    } catch {
      // Recovery state remains actionable even when the backup copy cannot be written.
    }
    return { status: "recovery", errorCode: recoveryCode(error), backupAvailable: true };
  }
}

export class DatasetPersistence {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly adapter: PersistenceAdapter) {}

  hydrate(): Promise<HydrationState> {
    return hydrateDataset(this.adapter);
  }

  save(dataset: Dataset): Promise<void> {
    const validated = datasetEnvelopeSchema.parse(dataset);
    const snapshot = JSON.stringify(validated);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      try {
        await this.adapter.writeSnapshot(snapshot);
      } catch {
        throw new PersistenceWriteError();
      }
    });
    return this.writeQueue;
  }

  reset(): Promise<void> {
    return this.adapter.reset();
  }
}
