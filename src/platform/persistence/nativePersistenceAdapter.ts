import { MMKV } from "react-native-mmkv";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { PersistenceAdapter } from "./types";

const SNAPSHOT_KEY = "dataset.snapshot";
const RECOVERY_KEY = "dataset.recovery";
const MIGRATION_BACKUP_KEY = "dataset.migration-backup";

function encryptionKeyName(datasetId: string): string {
  return `unfancy.dataset-key.${datasetId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

async function getOrCreateEncryptionKey(keyName: string): Promise<string> {
  const stored = await SecureStore.getItemAsync(keyName);
  if (stored) return stored;

  const generated = [...await Crypto.getRandomBytesAsync(16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(keyName, generated, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
  });
  return generated;
}

export class NativePersistenceAdapter implements PersistenceAdapter {
  private storage: MMKV | null = null;

  constructor(private readonly datasetId: string) {}

  private async getStorage(): Promise<MMKV> {
    if (this.storage) return this.storage;
    const encryptionKey = await getOrCreateEncryptionKey(encryptionKeyName(this.datasetId));
    this.storage = new MMKV({ id: `unfancy.dataset.${this.datasetId}`, encryptionKey });
    return this.storage;
  }

  async readSnapshot(): Promise<string | null> {
    return (await this.getStorage()).getString(SNAPSHOT_KEY) ?? null;
  }

  async readRecoverySnapshot(): Promise<string | null> {
    return (await this.getStorage()).getString(RECOVERY_KEY) ?? null;
  }

  async writeSnapshot(snapshot: string): Promise<void> {
    (await this.getStorage()).set(SNAPSHOT_KEY, snapshot);
  }

  async quarantineSnapshot(snapshot: string): Promise<void> {
    (await this.getStorage()).set(RECOVERY_KEY, snapshot);
  }

  async backupMigrationSnapshot(snapshot: string): Promise<void> {
    (await this.getStorage()).set(MIGRATION_BACKUP_KEY, snapshot);
  }

  async restoreRecoverySnapshot(): Promise<void> {
    const storage = await this.getStorage();
    const recovery = storage.getString(RECOVERY_KEY);
    if (!recovery) throw new Error("No preserved snapshot is available");
    storage.set(SNAPSHOT_KEY, recovery);
  }

  async reset(): Promise<void> {
    const storage = await this.getStorage();
    storage.delete(SNAPSHOT_KEY);
    storage.delete(RECOVERY_KEY);
    storage.delete(MIGRATION_BACKUP_KEY);
    await SecureStore.deleteItemAsync(encryptionKeyName(this.datasetId));
    this.storage = null;
  }
}
