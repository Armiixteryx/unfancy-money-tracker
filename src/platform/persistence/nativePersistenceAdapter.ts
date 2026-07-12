import { MMKV } from "react-native-mmkv";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { PersistenceAdapter } from "./types";

const SNAPSHOT_KEY = "dataset.snapshot";
const RECOVERY_KEY = "dataset.recovery";

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
    const encryptionKey = await getOrCreateEncryptionKey(`unfancy.dataset-key.${this.datasetId}`);
    this.storage = new MMKV({ id: `unfancy.dataset.${this.datasetId}`, encryptionKey });
    return this.storage;
  }

  async readSnapshot(): Promise<string | null> {
    return (await this.getStorage()).getString(SNAPSHOT_KEY) ?? null;
  }

  async writeSnapshot(snapshot: string): Promise<void> {
    (await this.getStorage()).set(SNAPSHOT_KEY, snapshot);
  }

  async quarantineSnapshot(snapshot: string): Promise<void> {
    (await this.getStorage()).set(RECOVERY_KEY, snapshot);
  }

  async reset(): Promise<void> {
    const storage = await this.getStorage();
    storage.delete(SNAPSHOT_KEY);
    storage.delete(RECOVERY_KEY);
    await SecureStore.deleteItemAsync(`unfancy.dataset-key.${this.datasetId}`);
    this.storage = null;
  }
}
