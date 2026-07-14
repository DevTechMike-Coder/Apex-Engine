import type { Candle, StrategyConfig } from "@/types";

/**
 * Single source of truth for indicator math and entry-signal logic.
 *
 * The original AI Studio build had two separate simulations: a real one
 * inside the backtest worker, and a `Math.random()` coin-flip driving the
 * "live" trade feed — so the two could never agree and the live panel's
 * signal reasons ("Golden Cross Detected") were fabricated. Everything here
 * is imported by both `workers/backtest.worker.ts` (historical) and
 * `lib/live-engine.ts` (streaming), so a signal fired live is the same
 * signal the backtester would have fired on that candle.
 */

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0]!;
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i]! - values[i - 1]!;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i]! - values[i - 1]!;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

export function macd(values: number[], fast: number, slow: number, signalPeriod: number) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine = fastEma.map((v, i) => v - (slowEma[i] ?? NaN));
  const signalLine = ema(
    macdLine.map((v) => (Number.isNaN(v) ? 0 : v)),
    signalPeriod
  );
  const histogram = macdLine.map((v, i) => v - (signalLine[i] ?? NaN));
  return { macdLine, signalLine, histogram };
}

export type Signal = { direction: "LONG" | "SHORT"; reason: string } | null;

/**
 * Evaluate an entry signal at candle index `i` given the strategy config.
 * Used identically by the worker's bar-by-bar loop and the live engine's
 * per-closed-candle check.
 */
export function evaluateSignal(candles: Candle[], i: number, config: StrategyConfig): Signal {
  const closes = candles.slice(0, i + 1).map((c) => c.close);
  if (closes.length < 2) return null;

  if (config.type === "SMA") {
    const fast = sma(closes, config.smaFast);
    const slow = sma(closes, config.smaSlow);
    const f0 = fast[i], f1 = fast[i - 1], s0 = slow[i], s1 = slow[i - 1];
    if ([f0, f1, s0, s1].some((v) => v === undefined || Number.isNaN(v))) return null;
    if (f1! <= s1! && f0! > s0!) return { direction: "LONG", reason: `SMA(${config.smaFast}) crossed above SMA(${config.smaSlow})` };
    if (f1! >= s1! && f0! < s0!) return { direction: "SHORT", reason: `SMA(${config.smaFast}) crossed below SMA(${config.smaSlow})` };
    return null;
  }

  if (config.type === "RSI") {
    const r = rsi(closes, config.rsiPeriod);
    const r0 = r[i], r1 = r[i - 1];
    if (r0 === undefined || r1 === undefined || Number.isNaN(r0) || Number.isNaN(r1)) return null;
    if (r1 <= config.rsiOversold && r0 > config.rsiOversold) return { direction: "LONG", reason: `RSI(${config.rsiPeriod}) exited oversold (${r0.toFixed(1)})` };
    if (r1 >= config.rsiOverbought && r0 < config.rsiOverbought) return { direction: "SHORT", reason: `RSI(${config.rsiPeriod}) exited overbought (${r0.toFixed(1)})` };
    return null;
  }

  // MACD
  const { macdLine, signalLine } = macd(closes, config.emaFast, config.emaSlow, config.emaSignal);
  const m0 = macdLine[i], m1 = macdLine[i - 1], sg0 = signalLine[i], sg1 = signalLine[i - 1];
  if ([m0, m1, sg0, sg1].some((v) => v === undefined || Number.isNaN(v))) return null;
  if (m1! <= sg1! && m0! > sg0!) return { direction: "LONG", reason: "MACD crossed above signal line" };
  if (m1! >= sg1! && m0! < sg0!) return { direction: "SHORT", reason: "MACD crossed below signal line" };
  return null;
}
