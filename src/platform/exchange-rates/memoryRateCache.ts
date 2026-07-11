import type { RateCache, RateRecord } from "./types";

export class MemoryRateCache implements RateCache {
  private readonly values = new Map<string, RateRecord>();

  async get(key: string): Promise<RateRecord | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, record: RateRecord): Promise<void> {
    this.values.set(key, record);
  }
}

