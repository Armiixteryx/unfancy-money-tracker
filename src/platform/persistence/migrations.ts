import { v4 as uuid } from "uuid";

import type { Dataset } from "../../domain/types";
import { datasetEnvelopeSchema } from "./schema";
import { CURRENT_SCHEMA_VERSION } from "./version";

type UnknownRecord = Record<string, unknown>;
type IdFactory = () => string;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneRecord(value: UnknownRecord): UnknownRecord {
  const serialized = JSON.stringify(value);
  const cloned: unknown = JSON.parse(serialized);
  if (!isRecord(cloned)) {
    throw new Error("Snapshot is not an object");
  }
  return cloned;
}

function migrateV0ToV1(input: UnknownRecord, idFactory: IdFactory): UnknownRecord {
  const migrated = cloneRecord(input);
  migrated.schemaVersion = 1;
  migrated.datasetId = typeof migrated.datasetId === "string" ? migrated.datasetId : idFactory();
  migrated.transactions = Array.isArray(migrated.transactions) ? migrated.transactions : [];
  migrated.categories = Array.isArray(migrated.categories) ? migrated.categories : [];
  migrated.budgets = Array.isArray(migrated.budgets) ? migrated.budgets : [];
  migrated.categoryDeletionTombstones = Array.isArray(migrated.categoryDeletionTombstones)
    ? migrated.categoryDeletionTombstones
    : [];
  migrated.recordTombstones = Array.isArray(migrated.recordTombstones) ? migrated.recordTombstones : [];
  migrated.preferences = isRecord(migrated.preferences)
    ? {
        baseCurrency: migrated.preferences.baseCurrency ?? "USD",
        theme: migrated.preferences.theme ?? "system",
        analyticsConsent: migrated.preferences.analyticsConsent ?? false
      }
    : { baseCurrency: "USD", theme: "system", analyticsConsent: false };
  migrated.sync = isRecord(migrated.sync)
    ? {
        status: migrated.sync.status ?? "idle",
        inboxCursor: migrated.sync.inboxCursor ?? null,
        outbox: Array.isArray(migrated.sync.outbox) ? migrated.sync.outbox : [],
        conflicts: Array.isArray(migrated.sync.conflicts) ? migrated.sync.conflicts : [],
        lastSyncedAt: migrated.sync.lastSyncedAt ?? null,
        reason: migrated.sync.reason ?? null
      }
    : {
        status: "idle",
        inboxCursor: null,
        outbox: [],
        conflicts: [],
        lastSyncedAt: null,
        reason: null
      };
  return migrated;
}

export function migrateSnapshot(raw: unknown, idFactory: IdFactory = uuid): Dataset {
  if (!isRecord(raw)) {
    throw new Error("Snapshot is not an object");
  }
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (!Number.isInteger(version) || version < 0) {
    throw new Error("Snapshot schema version is invalid");
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error("Snapshot schema version is newer than this app");
  }

  let migrated = cloneRecord(raw);
  if (version === 0) {
    migrated = migrateV0ToV1(migrated, idFactory);
  }

  return datasetEnvelopeSchema.parse(migrated) as Dataset;
}
