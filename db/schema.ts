/**
 * Drizzle schema for TimescaleDB hypertables.
 *
 * NOTE: Drizzle-kit doesn't know about `create_hypertable()`, compression
 * policies, or continuous aggregates — those are TimescaleDB-specific and
 * are applied via raw SQL in db/migrate.ts *after* the base tables exist.
 * This file only declares the relational shape Postgres/Drizzle understand.
 */
import { pgTable, timestamp, doublePrecision, text, primaryKey, index } from "drizzle-orm/pg-core";

// Raw per-tick feed. Hypertable partitioned on `time`. This is the durable
// record of every price update broadcast over the live WebSocket — kept so
// the live feed survives a server restart and can be replayed/re-aggregated.
export const ticks = pgTable(
  "ticks",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    symbol: text("symbol").notNull(),
    price: doublePrecision("price").notNull(),
    volume: doublePrecision("volume").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.time, t.symbol] }),
    symbolIdx: index("ticks_symbol_time_idx").on(t.symbol, t.time),
  })
);

// Base-granularity (1m) OHLCV candles. Hypertable partitioned on `time`.
// Every other interval the UI can request (5m/15m/1h/1d) is derived from
// this table on read via TimescaleDB's time_bucket() — see db/queries.ts.
export const ohlcvCandles = pgTable(
  "ohlcv_candles",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    symbol: text("symbol").notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.time, t.symbol] }),
    symbolIdx: index("ohlcv_symbol_time_idx").on(t.symbol, t.time),
  })
);
