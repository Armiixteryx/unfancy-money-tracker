import type { Pool } from "pg";
import {
  rateRecordSchema,
  type RateCache,
  type RateRecord,
} from "../../platform/exchange-rates/types";
export class PostgresRateCache implements RateCache {
  constructor(private readonly pool: Pool) {}
  async get(key: string): Promise<RateRecord | null> {
    const result = await this.pool.query(
      "SELECT base,quote,rate::text,effective_date,fetched_at,provider,status FROM exchange_rates WHERE cache_key=$1",
      [key],
    );
    const row = result.rows[0];
    if (!row) return null;
    return rateRecordSchema.parse({
      ...row,
      effectiveDate: row.effective_date.toISOString().slice(0, 10),
      fetchedAt: row.fetched_at.toISOString(),
    });
  }
  async set(key: string, record: RateRecord) {
    const value = rateRecordSchema.parse(record);
    await this.pool.query(
      "INSERT INTO exchange_rates VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(cache_key) DO UPDATE SET base=EXCLUDED.base,quote=EXCLUDED.quote,rate=EXCLUDED.rate,effective_date=EXCLUDED.effective_date,fetched_at=EXCLUDED.fetched_at,provider=EXCLUDED.provider,status=EXCLUDED.status",
      [
        key,
        value.base,
        value.quote,
        value.rate,
        value.effectiveDate,
        value.fetchedAt,
        value.provider,
        value.status,
      ],
    );
  }
}
