# ApexEngine — Financial Backtesting Engine & Live Dashboard

Rebuilt to match the original architecture brief (Next.js App Router, TimescaleDB
time_bucket downsampling, Web Worker backtesting, refs+rAF for high-frequency
data, WebSocket ticks) rather than the AI-Studio output, which substituted
Vite+Express+in-memory state for most of that stack. Visual identity (dark
terminal theme, panel layout) is carried over from the original zip.

## Stack

- **Next.js 15 (App Router, React 19, TypeScript)**
- **Postgres/TimescaleDB via Drizzle ORM** — not Prisma. Prisma's query/schema
  engine binaries are fetched from `binaries.prisma.sh` at `prisma generate`
  time; that host was unreachable in the sandbox this was built in, so there
  was no way to verify a Prisma-based data layer actually works. Drizzle is
  pure JS/TS on top of `pg`, needs no binary download, and was fully tested
  end-to-end here (migration, insert, `time_bucket` downsample query, all run
  against a real local Postgres). It's also the ORM you already listed as
  part of your stack. Swap it back to Prisma if you'd rather — `db/queries.ts`
  is the only file with real query logic, everything else is thin plumbing.
- **Tailwind + hand-rolled shadcn-style primitives** (`components/ui/*`, using
  Radix + `class-variance-authority`) — the `shadcn` CLI pulls component
  source from `ui.shadcn.com`, also unreachable in-sandbox, so these are
  written by hand in the same structure `shadcn add` would generate.
- **lightweight-charts** (canvas-based candlesticks + indicator overlays)
- **Zustand** for global config only (symbol, strategy params, live-feed toggle)
- **Web Worker** (`workers/backtest.worker.ts`) for the historical simulation loop
- **WebSocket** (`server.ts`, custom server wrapping Next) for the live tick feed

## Architecture rules this build actually enforces

1. **Zero high-frequency React state.** `components/ChartContainer.tsx` drains
   the tick queue in a single `requestAnimationFrame` loop. The last price is
   written straight to a DOM node via ref (`textContent`), the candle series
   is updated imperatively through the `lightweight-charts` API, and the
   ticker-bar market snapshot is flushed to React state at a throttled ~4Hz —
   never per-tick, never per-frame for values only the latest one matters for.
2. **Thread separation.** The backtest loop runs entirely inside
   `workers/backtest.worker.ts`. The main thread only posts a config +
   candle array in and receives a finished result back.
3. **Network optimization.** `/api/candles` always caps its response to
   1000 rows server-side (`db/queries.ts`), regardless of what `count` the
   client requests, and downsamples via TimescaleDB's `time_bucket()` from a
   1-minute base table rather than shipping raw ticks to the client.
4. **Frame budget.** The rAF loop naturally caps redraws to the monitor's
   refresh rate; nothing polls or redraws on a `setInterval`.

`lib/indicators.ts` is imported by both the worker (historical) and
`lib/live-engine.ts` (streaming), so a live "SMA crossed above SMA" signal is
the same crossover the backtester would have caught on that candle — the
original AI Studio build had two independent implementations (one real, one
`Math.random()`) that could never agree with each other.

## Setup

```bash
docker compose up -d          # TimescaleDB on localhost:5433
cp .env.example .env          # DATABASE_URL already points at the compose db
npm install
npm run db:migrate            # creates hypertables + compression/retention policies
npm run db:backfill           # seeds ~1000 real 1m candles per symbol from Binance
npm run dev                   # custom server: Next.js + WebSocket on :3000
```

If TimescaleDB isn't running, `db:migrate` falls back to plain Postgres tables
plus a `time_bucket()` SQL polyfill so the app still works locally — you just
lose hypertable partitioning/compression/retention. Point `DATABASE_URL` at
any Postgres 14+ instance and it'll detect this automatically.

If `/api/candles` is unreachable for any reason, the dashboard falls back to
a client-generated random-walk series (`lib/utils.ts:generateHistoricalCandles`)
so you're never staring at a blank chart — the header shows which source is
live.

## What's genuinely new vs. the original zip

- Real TimescaleDB schema + `time_bucket` downsampling (`db/schema.ts`,
  `db/queries.ts`) — the original had a JS object with a comment claiming to
  be a hypertable.
- Persistent tick storage: every broadcast tick is batch-inserted into the
  `ticks` hypertable, and rolled into 1m `ohlcv_candles` on minute rollover
  (`server.ts`), matching the two-table schema the brief asked for.
- One shared indicator/signal module instead of two divergent simulations.
- Backend-enforced 1000-candle cap on every code path, not just the primary one.
- Bounded live-trade history (300 trades) instead of an unbounded array.

## What wasn't (and couldn't be) tested here

- Real TimescaleDB hypertables/compression policies — the sandbox this was
  built in only had a stock `apt` Postgres 16 available (TimescaleDB's own
  apt repo isn't network-reachable there). The migration code path that
  creates hypertables/compression/retention policies is written against
  TimescaleDB's documented API but wasn't exercised against a real instance —
  do that first via `docker compose up -d && npm run db:migrate`.
- Kraken API calls (`db/backfill.ts`, the 24hr sync in `server.ts`) —
  `api.kraken.com` wasn't reachable in-sandbox (network allowlist), same as
  Binance was originally. The response parsing was verified against Kraken's
  documented `/0/public/OHLC` response shape with a mocked payload instead of
  a live call.

Everything else — migration, insert, the `time_bucket` downsample query, the
Next.js build (worker code-splitting included), the WebSocket tick stream,
and tick persistence — was run end-to-end against a real local Postgres
during development.
