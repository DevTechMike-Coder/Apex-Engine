/**
 * Seeds the `ohlcv_candles` hypertable with real 1m candles from Kraken's
 * public REST API, so the dashboard has genuine history to downsample on
 * first run. Run once via `npm run db:backfill`.
 *
 * Originally used Binance, which geo-blocks a long list of countries/regions
 * at the network level (connection resets or DNS failures, not HTTP error
 * responses) — Kraken doesn't apply the same block list. If Kraken is also
 * unreachable from your network, the dashboard still works fine without
 * this: `/api/candles` falls back to client-generated candles automatically.
 */
import { pool } from "./client";
import { upsertCandle } from "./queries";

// Kraken pair naming is its own thing (legacy assets get X/Z prefixes, e.g.
// BTC/USD -> XXBTZUSD) but its USDT pairs use the plain form directly.
const SYMBOLS: Record<string, string> = {
  "BTC/USDT": "XBTUSDT",
  "ETH/USDT": "ETHUSDT",
  "SOL/USDT": "SOLUSDT",
};

interface KrakenOhlcResponse {
  error: string[];
  result: Record<string, unknown>;
}

async function backfillSymbol(symbol: string, krakenPair: string) {
  const url = `https://api.kraken.com/0/public/OHLC?pair=${krakenPair}&interval=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kraken OHLC request failed: ${res.status}`);
  const json = (await res.json()) as KrakenOhlcResponse;

  if (json.error && json.error.length > 0) {
    throw new Error(`Kraken API error: ${json.error.join(", ")}`);
  }

  const resultKey = Object.keys(json.result).find((k) => k !== "last");
  if (!resultKey) throw new Error("Kraken response had no OHLC data");

  const rows = json.result[resultKey] as [number, string, string, string, string, string, string, number][];

  for (const row of rows) {
    const [time, open, high, low, close, , volume] = row;
    await upsertCandle({
      time: new Date(time * 1000),
      symbol,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: parseFloat(volume),
    });
  }
  console.log(`[backfill] ${symbol}: inserted ${rows.length} candles`);
}

async function run() {
  for (const [symbol, krakenPair] of Object.entries(SYMBOLS)) {
    try {
      await backfillSymbol(symbol, krakenPair);
    } catch (err) {
      const e = err as Error & { cause?: unknown };
      console.error(`[backfill] ${symbol} failed, skipping:`, e.message, e.cause ? `— cause: ${String(e.cause)}` : "");
    }
  }
  await pool.end();
}

run();
