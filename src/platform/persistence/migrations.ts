import { emptySyncState } from "../../features/sync/state";
import type { Dataset } from "../../domain/types";
import { isCurrencyCode, normalizeSelectedCurrencies, type CurrencyCode } from "../../domain/currency";
import { createUuid } from "../identifiers/createUuid";
import { datasetEnvelopeSchema } from "./schema";
import { CURRENT_SCHEMA_VERSION } from "./version";

type UnknownRecord = Record<string, unknown>;
type IdFactory = () => string;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneRecord(value: UnknownRecord): UnknownRecord {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(cloned)) throw new Error("Snapshot is not an object");
  return cloned;
}

function migrateV0ToV1(input: UnknownRecord, idFactory: IdFactory): UnknownRecord {
  const migrated = cloneRecord(input);
  migrated.schemaVersion = 1;
  migrated.datasetId = typeof migrated.datasetId === "string" ? migrated.datasetId : idFactory();
  migrated.transactions = Array.isArray(migrated.transactions) ? migrated.transactions : [];
  migrated.categories = Array.isArray(migrated.categories) ? migrated.categories : [];
  migrated.budgets = Array.isArray(migrated.budgets) ? migrated.budgets : [];
  migrated.categoryDeletionTombstones = Array.isArray(migrated.categoryDeletionTombstones) ? migrated.categoryDeletionTombstones : [];
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

function tombstoneKey(value: unknown): string | null {
  if (!isRecord(value) || value.recordType !== "category" || typeof value.recordId !== "string" || typeof value.deletedAt !== "string") return null;
  return `${value.recordId}:${value.deletedAt}`;
}

function migrateV2ToV3(input: UnknownRecord): UnknownRecord {
  const migrated = cloneRecord(input);
  const categoryTombstones = Array.isArray(migrated.categoryDeletionTombstones) ? migrated.categoryDeletionTombstones : [];
  const legacyTombstones = Array.isArray(migrated.recordTombstones)
    ? migrated.recordTombstones.filter((tombstone) => tombstoneKey(tombstone) !== null)
    : [];
  const seen = new Set<string>();
  migrated.categoryDeletionTombstones = [...categoryTombstones, ...legacyTombstones].filter((tombstone) => {
    const key = tombstoneKey(tombstone);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  delete migrated.recordTombstones;
  delete migrated.sync;
  migrated.schemaVersion = 3;
  return migrated;
}

function migrateV3ToV4(input: UnknownRecord): UnknownRecord {
  const migrated = cloneRecord(input);
  migrated.preferences = isRecord(migrated.preferences)
    ? { ...migrated.preferences, firstRunNoticeDismissed: migrated.preferences.firstRunNoticeDismissed === true }
    : { baseCurrency: "USD", theme: "system", analyticsConsent: false, firstRunNoticeDismissed: false };
  migrated.schemaVersion = 4;
  return migrated;
}
function migrateV4ToV5(input: UnknownRecord): UnknownRecord {
  const migrated = cloneRecord(input);
  const preferences = isRecord(migrated.preferences) ? migrated.preferences : {};
  const baseValue = preferences.baseCurrency;
  const baseCurrency = baseValue === undefined
    ? "USD"
    : isCurrencyCode(baseValue as string) ? baseValue as CurrencyCode : baseValue;
  const currencies: CurrencyCode[] = isCurrencyCode(baseCurrency as string) ? [baseCurrency as CurrencyCode] : [];
  for (const records of [migrated.transactions, migrated.budgets]) {
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      if (isRecord(record) && isCurrencyCode(record.currency as string)) currencies.push(record.currency as CurrencyCode);
    }
  }
  migrated.preferences = {
    ...preferences,
    baseCurrency,
    selectedCurrencies: normalizeSelectedCurrencies(currencies),
    firstRunNoticeDismissed: preferences.firstRunNoticeDismissed === true
  };
  migrated.schemaVersion = 5;
  return migrated;
}

function migrateV6ToV7(input: UnknownRecord): UnknownRecord {
  const migrated = cloneRecord(input);
  migrated.schemaVersion = 7;
  if (Array.isArray(migrated.categories)) {
    migrated.categories = migrated.categories.map((category) => {
      if (!isRecord(category) || typeof category.isSystem !== "boolean" || typeof category.isArchived !== "boolean") return category;
      // Schema 6 only protected Uncategorized; never infer other defaults from names.
      const key = category.defaultCategoryKey === undefined && category.isSystem === true
        ? "uncategorized"
        : category.defaultCategoryKey;
      return key === undefined ? category : { ...category, defaultCategoryKey: key, isSystem: true, isArchived: false };
    });
  }
  return migrated;
}

export function migrateSnapshot(raw: unknown, idFactory: IdFactory = createUuid): Dataset {
  if (!isRecord(raw)) throw new Error("Snapshot is not an object");
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (!Number.isInteger(version) || version < 0) throw new Error("Snapshot schema version is invalid");
  if (version > CURRENT_SCHEMA_VERSION) throw new Error("Snapshot schema version is newer than this app");

  let migrated = cloneRecord(raw);
  if (version === 0) migrated = migrateV0ToV1(migrated, idFactory);
  if (version <= 1) migrated = migrateV1ToV2(migrated);
  if (version <= 2) migrated = migrateV2ToV3(migrated);
  if (version <= 3) migrated = migrateV3ToV4(migrated);
  if (version <= 4) migrated = migrateV4ToV5(migrated);

  if (version <= 5) {
    migrated.schemaVersion = 6;
    if (isRecord(migrated.preferences)) migrated.preferences.language = "system";
    if (Array.isArray(migrated.categories)) migrated.categories = migrated.categories.map((category) => isRecord(category) && category.isSystem === true ? { ...category, defaultCategoryKey: "uncategorized" } : category);
  }

  if (version <= 6) migrated = migrateV6ToV7(migrated);

  if (version <= 7) {
    // Keep every record and the migration backup; only keyed built-ins change identity.
    const ids = new Map<string,string>();
    if (Array.isArray(migrated.categories)) migrated.categories = migrated.categories.map(category => {
      if (!isRecord(category) || !category.isSystem || typeof category.defaultCategoryKey !== "string" || typeof category.kind !== "string" || typeof category.id !== "string") return category;
      const id = `${category.kind}-${category.defaultCategoryKey}`;
      ids.set(category.id,id); return { ...category,id };
    });
    for (const key of ["transactions","budgets"]) if (Array.isArray(migrated[key])) migrated[key] = migrated[key].map(record => isRecord(record) && typeof record.categoryId === "string" ? { ...record,categoryId:ids.get(record.categoryId) ?? record.categoryId } : record);
    migrated.schemaVersion = 8;
    migrated.sync = emptySyncState();
  }
  return datasetEnvelopeSchema.parse(migrated) as Dataset;
}
