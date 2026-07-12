import { MMKV } from "react-native-mmkv";

import type { RateCache, RateRecord } from "./types";

const storage = new MMKV({ id: "unfancy.exchange-rates" });

export function createRateCache(): RateCache {
  return {
    async get(key: string): Promise<RateRecord | null> {
      const value = storage.getString(key);
      if (!value) return null;
      try {
        return JSON.parse(value) as RateRecord;
      } catch {
        storage.delete(key);
        return null;
      }
    },
    async set(key: string, record: RateRecord): Promise<void> {
      storage.set(key, JSON.stringify(record));
    }
  };
}
