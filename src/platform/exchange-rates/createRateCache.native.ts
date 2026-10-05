import { MMKV } from "react-native-mmkv";

import { rateRecordSchema, type RateCache, type RateRecord } from "./types";

const storage = new MMKV({ id: "unfancy.exchange-rates" });

const CUTOVER_MARKER = "blended-cutover-v1";

export function createRateCache(): RateCache {
  // This MMKV instance contains rates only; the financial dataset and preferences use separate storage.
  if (!storage.getBoolean(CUTOVER_MARKER)) {
    storage.clearAll();
    storage.set(CUTOVER_MARKER, true);
  }
  return {
    async get(key: string): Promise<RateRecord | null> {
      const value = storage.getString(key);
      if (!value) return null;
      try {
        const parsed = rateRecordSchema.safeParse(JSON.parse(value));
        return parsed.success ? parsed.data : null;
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
