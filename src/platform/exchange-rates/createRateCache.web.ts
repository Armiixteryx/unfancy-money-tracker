import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { RateCache, RateRecord } from "./types";

interface RateDatabase extends DBSchema {
  rates: { key: string; value: RateRecord };
}

const DATABASE_NAME = "unfancy-money-tracker-rates";
const STORE_NAME = "rates";

class IndexedDbRateCache implements RateCache {
  private database: IDBPDatabase<RateDatabase> | null = null;

  private async getDatabase(): Promise<IDBPDatabase<RateDatabase>> {
    if (this.database) return this.database;
    this.database = await openDB<RateDatabase>(DATABASE_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      }
    });
    return this.database;
  }

  async get(key: string): Promise<RateRecord | null> {
    return (await (await this.getDatabase()).get(STORE_NAME, key)) ?? null;
  }

  async set(key: string, record: RateRecord): Promise<void> {
    await (await this.getDatabase()).put(STORE_NAME, record, key);
  }
}

export function createRateCache(): RateCache {
  return new IndexedDbRateCache();
}
