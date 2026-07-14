import { sql } from "drizzle-orm";
import { db } from "./client";

export type Interval = "1m" | "5m" | "15m" | "1h" | "1d";

const INTERVAL_SQL: Record<Interval, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "1h": "1 hour",
  "1d": "1 day",
};

export interface DownsampledCandle {
  time: number; // unix seconds, for lightweight-charts
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Phase 1 deliverable: downsample the 1m base `ohlcv_candles` hypertable to
 * whatever interval the client asked for using TimescaleDB's time_bucket().
 * Bounded by `limit` so the client never receives more than ~1000 candles
 * regardless of range (rule #3 in the architecture brief).
 */
export async function getDownsampledCandles(
  symbol: string,
  interval: Interval,
  limit: number
): Promise<DownsampledCandle[]> {
  const bucket = INTERVAL_SQL[interval];
  const boundedLimit = Math.max(1, Math.min(limit, 1000));

  const result = await db.execute<{
    bucket: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: string;
  }>(sql`
    WITH bucketed AS (
      SELECT
        time_bucket(${bucket}::interval, time) AS bucket,
        (array_agg(open  ORDER BY time ASC))[1]  AS open,
        max(high)                                AS high,
        min(low)                                 AS low,
        (array_agg(close ORDER BY time DESC))[1] AS close,
        sum(volume)                              AS volume
      FROM ohlcv_candles
      WHERE symbol = ${symbol}
      GROUP BY bucket
      ORDER BY bucket DESC
      LIMIT ${boundedLimit}
    )
    SELECT * FROM bucketed ORDER BY bucket ASC;
  `);

  return result.rows.map((row) => ({
    time: Math.floor(new Date(row.bucket).getTime() / 1000),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }));
}

/** Bulk insert raw ticks (called by the WS server's persistence batch). */
export async function insertTicks(
  rows: { time: Date; symbol: string; price: number; volume: number }[]
) {
  if (rows.length === 0) return;
  const values = sql.join(
    rows.map(
      (r) =>
        sql`(${r.time.toISOString()}::timestamptz, ${r.symbol}, ${r.price}, ${r.volume})`
    ),
    sql`, `
  );
  await db.execute(sql`
    INSERT INTO ticks (time, symbol, price, volume)
    VALUES ${values}
    ON CONFLICT (time, symbol) DO NOTHING;
  `);
}

/** Upsert a rolled-up 1m candle (called by the server's aggregation job). */
export async function upsertCandle(row: {
  time: Date;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}) {
  await db.execute(sql`
    INSERT INTO ohlcv_candles (time, symbol, open, high, low, close, volume)
    VALUES (${row.time.toISOString()}::timestamptz, ${row.symbol}, ${row.open}, ${row.high}, ${row.low}, ${row.close}, ${row.volume})
    ON CONFLICT (time, symbol) DO UPDATE SET
      high = GREATEST(ohlcv_candles.high, EXCLUDED.high),
      low = LEAST(ohlcv_candles.low, EXCLUDED.low),
      close = EXCLUDED.close,
      volume = ohlcv_candles.volume + EXCLUDED.volume;
  `);
}
