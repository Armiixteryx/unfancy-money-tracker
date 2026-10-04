import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { rateRecordSchema, type RateCache, type RateRecord } from "./types";

interface RateDatabase extends DBSchema {
  rates: { key: string; value: RateRecord };
}

const DATABASE_NAME = "unfancy-money-tracker-rates";
const STORE_NAME = "rates";

class IndexedDbRateCache implements RateCache {
  private database: Promise<IDBPDatabase<RateDatabase>> | null = null;

  private async getDatabase(): Promise<IDBPDatabase<RateDatabase>> {
    if (this.database) return this.database;
    this.database = openDB<RateDatabase>(DATABASE_NAME, 2, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
        else if (oldVersion < 2) void transaction.objectStore(STORE_NAME).clear();
      }
    });
    return this.database;
  }

  async get(key: string): Promise<RateRecord | null> {
    const parsed = rateRecordSchema.safeParse(await (await this.getDatabase()).get(STORE_NAME, key));
    return parsed.success ? parsed.data : null;
  }

  async set(key: string, record: RateRecord): Promise<void> {
    await (await this.getDatabase()).put(STORE_NAME, record, key);
  }
}

export function createRateCache(): RateCache {
  return new IndexedDbRateCache();
}
