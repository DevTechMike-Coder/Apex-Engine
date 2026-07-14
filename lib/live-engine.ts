import type { Candle, StrategyConfig, Trade } from "@/types";
import { evaluateSignal } from "./indicators";

interface OpenPosition {
  type: "LONG" | "SHORT";
  entryPrice: number;
  amount: number;
  entryTime: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}

export interface LiveEngineEvent {
  trade: Trade;
  balance: number;
}

/**
 * Drives the "live sandbox" panel. Signals are evaluated with the exact same
 * `evaluateSignal()` used by the backtest worker — no separate random-roll
 * logic — so a live "SMA crossed above SMA" toast corresponds to a real
 * crossover on the candle that just closed, not a coin flip.
 *
 * Deliberately framework-agnostic (no React state) so it can be driven
 * from inside the rAF drain loop without triggering renders itself; the
 * caller decides when to push results into React state.
 */
export class LiveEngine {
  private balance: number;
  private position: OpenPosition | null = null;
  private lastEvaluatedCandleTime = 0;

  constructor(initialBalance: number) {
    this.balance = initialBalance;
  }

  getBalance() {
    return this.balance;
  }

  reset(initialBalance: number) {
    this.balance = initialBalance;
    this.position = null;
    this.lastEvaluatedCandleTime = 0;
  }

  /** Call on every tick to check stop-loss/take-profit against the live price. */
  onTick(price: number, timeSec: number, config: StrategyConfig): LiveEngineEvent | null {
    if (!this.position) return null;
    const p = this.position;
    let shouldClose = false;
    let exitPrice = price;
    let reason = "";

    if (p.type === "LONG") {
      if (price <= p.stopLossPrice) { shouldClose = true; exitPrice = p.stopLossPrice; reason = "Stop Loss Executed"; }
      else if (price >= p.takeProfitPrice) { shouldClose = true; exitPrice = p.takeProfitPrice; reason = "Take Profit Executed"; }
    } else {
      if (price >= p.stopLossPrice) { shouldClose = true; exitPrice = p.stopLossPrice; reason = "Stop Loss Executed"; }
      else if (price <= p.takeProfitPrice) { shouldClose = true; exitPrice = p.takeProfitPrice; reason = "Take Profit Executed"; }
    }

    if (!shouldClose) return null;

    const pnlPct =
      p.type === "LONG"
        ? ((exitPrice - p.entryPrice) / p.entryPrice) * config.leverage
        : ((p.entryPrice - exitPrice) / p.entryPrice) * config.leverage;
    const profit = p.amount * p.entryPrice * pnlPct;
    this.balance = Math.max(0, this.balance + profit);
    this.position = null;

    const trade: Trade = {
      id: `live_close_${timeSec}_${Math.random().toString(36).slice(2, 7)}`,
      type: p.type === "LONG" ? "CLOSE_BUY" : "CLOSE_SELL",
      price: exitPrice,
      amount: p.amount,
      time: timeSec,
      profit,
      pnlPercentage: pnlPct * 100,
      balanceAfter: this.balance,
      reason,
    };
    return { trade, balance: this.balance };
  }

  /** Call whenever a candle closes (not per-tick) to check for a new entry signal. */
  onCandleClose(candles: Candle[], config: StrategyConfig): LiveEngineEvent | null {
    if (this.position || candles.length < 2) return null;
    const lastCandle = candles[candles.length - 1]!;
    if (lastCandle.time === this.lastEvaluatedCandleTime) return null;
    this.lastEvaluatedCandleTime = lastCandle.time;

    if (this.balance <= 1) return null;

    const signal = evaluateSignal(candles, candles.length - 1, config);
    if (!signal) return null;

    const entryPrice = lastCandle.close;
    const margin = this.balance * 0.95;
    const amount = (margin * config.leverage) / entryPrice;
    const slFactor = config.stopLoss / 100;
    const tpFactor = config.takeProfit / 100;

    this.position = {
      type: signal.direction,
      entryPrice,
      amount,
      entryTime: lastCandle.time,
      stopLossPrice: signal.direction === "LONG" ? entryPrice * (1 - slFactor) : entryPrice * (1 + slFactor),
      takeProfitPrice: signal.direction === "LONG" ? entryPrice * (1 + tpFactor) : entryPrice * (1 - tpFactor),
    };

    const trade: Trade = {
      id: `live_open_${lastCandle.time}_${Math.random().toString(36).slice(2, 7)}`,
      type: signal.direction === "LONG" ? "BUY" : "SELL",
      price: entryPrice,
      amount,
      time: lastCandle.time,
      profit: 0,
      pnlPercentage: 0,
      balanceAfter: this.balance,
      reason: signal.reason,
    };
    return { trade, balance: this.balance };
  }
}
