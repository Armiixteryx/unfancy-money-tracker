import type { Dataset } from "../../domain/types";
import { createUuid } from "../identifiers/createUuid";
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
        revisions: isRecord(migrated.sync.revisions) ? migrated.sync.revisions : {},
        lastSyncedAt: migrated.sync.lastSyncedAt ?? null,
        reason: migrated.sync.reason ?? null
      }
    : {
        status: "idle",
        inboxCursor: null,
        outbox: [],
        conflicts: [],
        revisions: {},
        lastSyncedAt: null,
        reason: null
      };
  return migrated;
}

function migrateV1ToV2(input: UnknownRecord): UnknownRecord {
  const migrated = cloneRecord(input);
  migrated.schemaVersion = 2;
  if (!isRecord(migrated.sync)) return migrated;
  const sync = migrated.sync;
  sync.revisions = isRecord(sync.revisions) ? sync.revisions : {};
  sync.outbox = Array.isArray(sync.outbox)
    ? sync.outbox.map((change) => isRecord(change) ? {
        ...change,
        revision: typeof change.revision === "number" ? change.revision : (typeof change.baseRevision === "number" ? change.baseRevision + 1 : 1),
        payload: change.payload ?? null,
        tombstone: typeof change.tombstone === "boolean" ? change.tombstone : change.operation === "delete"
      } : change)
    : [];
  sync.conflicts = Array.isArray(sync.conflicts)
    ? sync.conflicts.map((conflict) => isRecord(conflict) ? { ...conflict, localPayload: conflict.localPayload ?? null, cloudPayload: conflict.cloudPayload ?? null } : conflict)
    : [];
  return migrated;
}

export function migrateSnapshot(raw: unknown, idFactory: IdFactory = createUuid): Dataset {
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
  if (version <= 1) {
    migrated = migrateV1ToV2(migrated);
  }

  return datasetEnvelopeSchema.parse(migrated) as Dataset;
}
