import { createPersistenceAdapter } from "./createPersistenceAdapter";

const LEGACY_SESSION_STAGES = ["dev", "prod"] as const;
const LEGACY_SESSION_KEY_PREFIX = "unfancy.auth.session:";

export type LegacySessionStage = (typeof LEGACY_SESSION_STAGES)[number];

export type LegacySession = {
  backendStage: LegacySessionStage;
  accountId: string;
};

export type LegacySessionRecord = {
  present: boolean;
  session: LegacySession | null;
};

export type LegacyCleanupAdapter = {
  readSession(stage: LegacySessionStage): Promise<LegacySessionRecord>;
  resetNamespace(namespace: string): Promise<void>;
  clearSession(stage: LegacySessionStage): Promise<void>;
};

export class LegacyCleanupError extends Error {
  constructor(readonly failedStages: readonly LegacySessionStage[]) {
    super("A previous local account cache could not be cleaned up");
    this.name = "LegacyCleanupError";
  }
}

function namespaceFor(session: LegacySession): string {
  return `account:${session.backendStage}:${session.accountId}`;
}

export async function cleanupLegacyAccountCaches(adapter: LegacyCleanupAdapter): Promise<void> {
  const records = await Promise.all(LEGACY_SESSION_STAGES.map(async (stage) => ({ stage, record: await adapter.readSession(stage) })));
  const resetNamespaces = new Set<string>();
  const failedStages: LegacySessionStage[] = [];

  for (const { stage, record } of records) {
    if (!record.present) continue;
    if (!record.session) {
      try {
        await adapter.clearSession(stage);
      } catch {
        failedStages.push(stage);
      }
      continue;
    }

    const namespace = namespaceFor(record.session);
    try {
      if (!resetNamespaces.has(namespace)) {
        await adapter.resetNamespace(namespace);
        resetNamespaces.add(namespace);
      }
      await adapter.clearSession(stage);
    } catch {
      failedStages.push(stage);
    }
  }

  if (failedStages.length > 0) throw new LegacyCleanupError(failedStages);
}

function parseSession(raw: string | null, present: boolean): LegacySessionRecord {
  if (!present || !raw) return { present, session: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { present: true, session: null };
    const value = parsed as Record<string, unknown>;
    const backendStage = value.backendStage;
    const accountId = value.accountId;
    if ((backendStage !== "dev" && backendStage !== "prod") || typeof accountId !== "string" || accountId.length === 0) {
      return { present: true, session: null };
    }
    return { present: true, session: { backendStage, accountId } };
  } catch {
    return { present: true, session: null };
  }
}

async function readStoredSession(stage: LegacySessionStage): Promise<LegacySessionRecord> {
  const key = `${LEGACY_SESSION_KEY_PREFIX}${stage}`;
  if (typeof globalThis.localStorage !== "undefined") {
    const raw = globalThis.localStorage.getItem(key);
    if (raw !== null) return parseSession(raw, true);
  }
  try {
    const secureStore = await import("expo-secure-store");
    const raw = await secureStore.getItemAsync(key);
    return parseSession(raw, raw !== null);
  } catch {
    return { present: false, session: null };
  }
}

async function clearStoredSession(stage: LegacySessionStage): Promise<void> {
  const key = `${LEGACY_SESSION_KEY_PREFIX}${stage}`;
  const hasBrowserStorage = typeof globalThis.localStorage !== "undefined";
  if (hasBrowserStorage) globalThis.localStorage.removeItem(key);
  try {
    const secureStore = await import("expo-secure-store");
    await secureStore.deleteItemAsync(key);
  } catch {
    if (!hasBrowserStorage) throw new Error("legacy session could not be cleared");
  }
}

const defaultAdapter: LegacyCleanupAdapter = {
  readSession: readStoredSession,
  async resetNamespace(namespace) {
    const { DatasetPersistence } = await import("./datasetPersistence");
    await new DatasetPersistence(createPersistenceAdapter(namespace)).reset();
  },
  clearSession: clearStoredSession
};

export function runLegacyAccountCacheCleanup(): Promise<void> {
  return cleanupLegacyAccountCaches(defaultAdapter);
}
