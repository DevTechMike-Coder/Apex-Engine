/**
 * Custom server: Next.js can't host a persistent WebSocket connection from
 * inside a Route Handler (serverless request/response model), so — same as
 * the original AI Studio scaffold — we wrap Next's request handler with a
 * plain http.Server and attach `ws` to the `/ticks` upgrade path ourselves.
 */
import "dotenv/config";
import http from "http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { insertTicks, upsertCandle } from "./db/queries";
import type { Symbol as MarketSymbol } from "./types";

const dev = process.env.NODE_ENV !== "production";
const PORT = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

const SYMBOLS: MarketSymbol[] = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
const KRAKEN_MAP: Record<MarketSymbol, string> = {
  "BTC/USDT": "XBTUSDT",
  "ETH/USDT": "ETHUSDT",
  "SOL/USDT": "SOLUSDT",
};

const priceStates: Record<MarketSymbol, { price: number; high: number; low: number; change: number; volume: number }> = {
  "BTC/USDT": { price: 64200, high: 64500, low: 63800, change: 1.25, volume: 1540300 },
  "ETH/USDT": { price: 3450, high: 3480, low: 3410, change: -0.45, volume: 890450 },
  "SOL/USDT": { price: 145.5, high: 148.0, low: 142.5, change: 5.12, volume: 435010 },
};

// Buffers ticks in memory and flushes to TimescaleDB in batches — writing
// every single 100ms tick individually would be needless round-trips.
let tickBuffer: { time: Date; symbol: string; price: number; volume: number }[] = [];
// Accumulates the in-progress 1m candle per symbol so it can be upserted
// into `ohlcv_candles` when the minute rolls over (a hand-rolled stand-in
// for what a TimescaleDB continuous aggregate would do automatically).
const activeMinuteCandle: Record<MarketSymbol, { bucketStart: number; open: number; high: number; low: number; close: number; volume: number } | null> = {
  "BTC/USDT": null,
  "ETH/USDT": null,
  "SOL/USDT": null,
};

async function syncPriceStatesFromKraken() {
  try {
    const pairs = SYMBOLS.map((s) => KRAKEN_MAP[s]).join(",");
    const url = `https://api.kraken.com/0/public/Ticker?pair=${pairs}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const json = await res.json();
    if (json.error && json.error.length > 0) {
      console.warn("[sync] Kraken Ticker error:", json.error.join(", "));
      return;
    }
    const result = json.result as Record<string, { c: [string, string]; o: string; v: [string, string]; h: [string, string]; l: [string, string] }>;

    for (const symbol of SYMBOLS) {
      const krakenPair = KRAKEN_MAP[symbol];
      const entry = result[krakenPair];
      if (!entry) continue;

      const last = parseFloat(entry.c[0]);
      const open = parseFloat(entry.o);
      const changePct = open > 0 ? ((last - open) / open) * 100 : 0;

      priceStates[symbol] = {
        price: last,
        high: parseFloat(entry.h[1]),
        low: parseFloat(entry.l[1]),
        change: changePct,
        volume: Math.floor(parseFloat(entry.v[1])),
      };
    }
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    console.warn("[sync] Kraken Ticker sync failed, keeping last known state:", e.message, e.cause ? `— cause: ${String(e.cause)}` : "");
  }
}

function rollTick(symbol: MarketSymbol, price: number, volume: number, tsMs: number) {
  const bucketStart = Math.floor(tsMs / 60_000) * 60_000;
  const active = activeMinuteCandle[symbol];

  if (!active || active.bucketStart !== bucketStart) {
    if (active) {
      // Previous minute closed — persist it.
      upsertCandle({
        time: new Date(active.bucketStart),
        symbol,
        open: active.open,
        high: active.high,
        low: active.low,
        close: active.close,
        volume: active.volume,
      }).catch((err) => console.error("[rollup] upsert failed:", err));
    }
    activeMinuteCandle[symbol] = { bucketStart, open: price, high: price, low: price, close: price, volume };
  } else {
    active.high = Math.max(active.high, price);
    active.low = Math.min(active.low, price);
    active.close = price;
    active.volume += volume;
  }
}

async function flushTickBuffer() {
  if (tickBuffer.length === 0) return;
  const batch = tickBuffer;
  tickBuffer = [];
  try {
    await insertTicks(batch);
  } catch (err) {
    console.error("[persist] tick batch insert failed:", err);
  }
}

app.prepare().then(async () => {
  const server = http.createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ noServer: true });
  const activeConnections = new Set<WebSocket>();

  server.on("upgrade", (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : "";
    if (pathname === "/ticks") {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws) => {
    activeConnections.add(ws);
    console.log(`[ws] client connected (${activeConnections.size} active)`);
    ws.on("close", () => {
      activeConnections.delete(ws);
      console.log(`[ws] client disconnected (${activeConnections.size} active)`);
    });
  });

  // 24h stats sync
  syncPriceStatesFromKraken();
  setInterval(syncPriceStatesFromKraken, 30_000);

  // Tick generation + broadcast + persistence, 10Hz
  setInterval(() => {
    const now = Date.now();
    for (const symbol of SYMBOLS) {
      const state = priceStates[symbol];
      const volatility = 0.0003;
      const trend = symbol === "SOL/USDT" ? 0.0001 : 0.00002;
      const change = state.price * (Math.random() - 0.49 + trend) * volatility;
      state.price = parseFloat((state.price + change).toFixed(2));
      state.high = Math.max(state.high, state.price);
      state.low = Math.min(state.low, state.price);
      const tickVolume = Math.floor(1 + Math.random() * 5);
      state.volume += tickVolume;

      rollTick(symbol, state.price, tickVolume, now);
      tickBuffer.push({ time: new Date(now), symbol, price: state.price, volume: tickVolume });

      if (activeConnections.size > 0) {
        const payload = JSON.stringify({
          timestamp: now,
          symbol,
          price: state.price,
          volume: tickVolume,
          change24h: state.change,
          volume24h: state.volume,
          high24h: state.high,
          low24h: state.low,
        });
        activeConnections.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) client.send(payload);
        });
      }
    }
  }, 100);

  // Batch-flush persisted ticks every 5s rather than per-tick
  setInterval(flushTickBuffer, 5_000);

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`> ApexEngine ready on http://localhost:${PORT} (${dev ? "dev" : "production"})`);
  });
});
