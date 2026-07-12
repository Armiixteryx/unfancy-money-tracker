import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { PersistenceAdapter } from "./types";

interface PersistenceDatabase extends DBSchema {
  snapshots: { key: string; value: string };
  keys: { key: string; value: CryptoKey };
}

const DATABASE_NAME = "unfancy-money-tracker";
const SNAPSHOT_STORE = "snapshots";
const KEY_STORE = "keys";
const RECOVERY_SUFFIX = ":recovery";
const MIGRATION_BACKUP_SUFFIX = ":migration-backup";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

export class WebPersistenceAdapter implements PersistenceAdapter {
  private database: IDBPDatabase<PersistenceDatabase> | null = null;

  constructor(private readonly datasetId: string) {}

  private async getDatabase(): Promise<IDBPDatabase<PersistenceDatabase>> {
    if (this.database) return this.database;
    this.database = await openDB<PersistenceDatabase>(DATABASE_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) database.createObjectStore(SNAPSHOT_STORE);
        if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE);
      }
    });
    return this.database;
  }

  private async getKey(database: IDBPDatabase<PersistenceDatabase>, allowCreate: boolean): Promise<CryptoKey> {
    const existing = await database.get(KEY_STORE, this.datasetId);
    if (existing) return existing;
    if (!allowCreate) throw new Error("encryption key unavailable");

    const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await database.put(KEY_STORE, generated, this.datasetId);
    return generated;
  }

  private async encrypt(database: IDBPDatabase<PersistenceDatabase>, value: string, allowCreate: boolean): Promise<string> {
    const key = await this.getKey(database, allowCreate);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(iv) },
      key,
      asArrayBuffer(new TextEncoder().encode(value))
    );
    return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
  }

  private async decrypt(database: IDBPDatabase<PersistenceDatabase>, value: string): Promise<string> {
    const key = await this.getKey(database, false);
    const [ivEncoded, payloadEncoded] = value.split(".");
    if (!ivEncoded || !payloadEncoded) throw new Error("snapshot is unreadable");
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(base64ToBytes(ivEncoded)) },
      key,
      asArrayBuffer(base64ToBytes(payloadEncoded))
    );
    return new TextDecoder().decode(decrypted);
  }

  async readSnapshot(): Promise<string | null> {
    const database = await this.getDatabase();
    const value = await database.get(SNAPSHOT_STORE, this.datasetId);
    return value ? this.decrypt(database, value) : null;
  }

  async readRecoverySnapshot(): Promise<string | null> {
    const database = await this.getDatabase();
    const value = await database.get(SNAPSHOT_STORE, `${this.datasetId}${RECOVERY_SUFFIX}`);
    return value ? this.decrypt(database, value) : null;
  }

  async writeSnapshot(snapshot: string): Promise<void> {
    const database = await this.getDatabase();
    const existing = await database.get(SNAPSHOT_STORE, this.datasetId);
    await database.put(SNAPSHOT_STORE, await this.encrypt(database, snapshot, existing === undefined), this.datasetId);
  }

  async quarantineSnapshot(snapshot: string): Promise<void> {
    const database = await this.getDatabase();
    const existing = await database.get(KEY_STORE, this.datasetId);
    if (!existing) return;
    await database.put(SNAPSHOT_STORE, await this.encrypt(database, snapshot, false), `${this.datasetId}${RECOVERY_SUFFIX}`);
  }

  async backupMigrationSnapshot(snapshot: string): Promise<void> {
    const database = await this.getDatabase();
    const existing = await database.get(KEY_STORE, this.datasetId);
    if (!existing) return;
    await database.put(SNAPSHOT_STORE, await this.encrypt(database, snapshot, false), `${this.datasetId}${MIGRATION_BACKUP_SUFFIX}`);
  }

  async restoreRecoverySnapshot(): Promise<void> {
    const database = await this.getDatabase();
    const recovery = await database.get(SNAPSHOT_STORE, `${this.datasetId}${RECOVERY_SUFFIX}`);
    if (!recovery) throw new Error("No preserved snapshot is available");
    await database.put(SNAPSHOT_STORE, recovery, this.datasetId);
  }

  async reset(): Promise<void> {
    const database = await this.getDatabase();
    await database.delete(SNAPSHOT_STORE, this.datasetId);
    await database.delete(SNAPSHOT_STORE, `${this.datasetId}${RECOVERY_SUFFIX}`);
    await database.delete(SNAPSHOT_STORE, `${this.datasetId}${MIGRATION_BACKUP_SUFFIX}`);
    await database.delete(KEY_STORE, this.datasetId);
  }
}
