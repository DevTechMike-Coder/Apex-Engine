/**
 * Raw-SQL migration runner.
 *
 * Base table shape comes from db/schema.ts; TimescaleDB-specific bits
 * (hypertable partitioning, compression, retention) can't be expressed by
 * drizzle-kit, so they're applied here directly against the extension.
 *
 * Safe to re-run: every statement is idempotent.
 */
import { pool } from "./client";

async function run() {
  const client = await pool.connect();
  try {
    console.log("[migrate] creating base tables...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticks (
        time    TIMESTAMPTZ NOT NULL,
        symbol  TEXT NOT NULL,
        price   DOUBLE PRECISION NOT NULL,
        volume  DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (time, symbol)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ticks_symbol_time_idx ON ticks (symbol, time DESC);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ohlcv_candles (
        time    TIMESTAMPTZ NOT NULL,
        symbol  TEXT NOT NULL,
        open    DOUBLE PRECISION NOT NULL,
        high    DOUBLE PRECISION NOT NULL,
        low     DOUBLE PRECISION NOT NULL,
        close   DOUBLE PRECISION NOT NULL,
        volume  DOUBLE PRECISION NOT NULL,
        PRIMARY KEY (time, symbol)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ohlcv_symbol_time_idx ON ohlcv_candles (symbol, time DESC);`);

    let hasTimescale = false;
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS timescaledb;`);
      const check = await client.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'timescaledb';`
      );
      hasTimescale = (check.rowCount ?? 0) > 0;
    } catch (err) {
      hasTimescale = false;
    }

    if (hasTimescale) {
      console.log("[migrate] TimescaleDB extension present — converting to hypertables...");
      await client.query(`SELECT create_hypertable('ticks', 'time', if_not_exists => TRUE);`);
      await client.query(`SELECT create_hypertable('ohlcv_candles', 'time', if_not_exists => TRUE);`);

      // Ticks are only needed for the live buffer + short-term replay —
      // compress after 1 day, drop after 30. Candles are kept indefinitely.
      await client.query(`ALTER TABLE ticks SET (timescaledb.compress, timescaledb.compress_segmentby = 'symbol');`).catch(() => {});
      await client.query(`SELECT add_compression_policy('ticks', INTERVAL '1 day', if_not_exists => TRUE);`).catch(() => {});
      await client.query(`SELECT add_retention_policy('ticks', INTERVAL '30 days', if_not_exists => TRUE);`).catch(() => {});
    } else {
      // Local/dev fallback: no TimescaleDB extension available (e.g. a
      // vanilla Postgres container). The app still works — you just lose
      // hypertable partitioning, compression, and native retention/CAGGs.
      // `time_bucket` itself must still exist for db/queries.ts to work, so
      // polyfill the specific 2-arg (interval, timestamptz) signature we use.
      console.warn(
        "[migrate] TimescaleDB extension not found — creating plain tables + a time_bucket() polyfill for local dev. " +
        "Use the docker-compose.yml (timescale/timescaledb image) for a real deployment."
      );
      await client.query(`
        CREATE OR REPLACE FUNCTION time_bucket(bucket_width INTERVAL, ts TIMESTAMPTZ)
        RETURNS TIMESTAMPTZ AS $$
          SELECT to_timestamp(
            floor(extract(epoch FROM ts) / extract(epoch FROM bucket_width))
            * extract(epoch FROM bucket_width)
          ) AT TIME ZONE 'UTC';
        $$ LANGUAGE SQL IMMUTABLE;
      `);
    }

    console.log("[migrate] done.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
