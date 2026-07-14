import type { Candle, StrategyConfig, BacktestResult, Trade, EquityPoint, WorkerRequest } from "../types";
import { evaluateSignal } from "../lib/indicators";

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { candles, config } = e.data;

  if (!candles || candles.length === 0 || !config) {
    (self as unknown as Worker).postMessage({ error: "Invalid candles or strategy config" });
    return;
  }

  try {
    const result = runSimulation(candles, config);
    (self as unknown as Worker).postMessage(result);
  } catch (error) {
    (self as unknown as Worker).postMessage({
      error: error instanceof Error ? error.message : "Unknown error during simulation",
    });
  }
};

interface OpenPosition {
  type: "LONG" | "SHORT";
  entryPrice: number;
  amount: number;
  entryTime: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}

function runSimulation(candles: Candle[], config: StrategyConfig): BacktestResult {
  const { stopLoss, takeProfit, leverage, initialBalance } = config;

  let balance = initialBalance;
  let position: OpenPosition | null = null;
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  const drawdownCurve: EquityPoint[] = [];

  let peakEquity = initialBalance;
  const warmup = Math.max(config.smaSlow, config.rsiPeriod, config.emaSlow) + 2;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!;
    const price = candle.close;

    // 1. Manage open position: stop-loss / take-profit against this bar's range
    if (position) {
      let shouldClose = false;
      let exitPrice = price;
      let reason = "";

      if (position.type === "LONG") {
        if (candle.low <= position.stopLossPrice) {
          shouldClose = true; exitPrice = position.stopLossPrice; reason = "Stop Loss Hit";
        } else if (candle.high >= position.takeProfitPrice) {
          shouldClose = true; exitPrice = position.takeProfitPrice; reason = "Take Profit Hit";
        }
      } else {
        if (candle.high >= position.stopLossPrice) {
          shouldClose = true; exitPrice = position.stopLossPrice; reason = "Stop Loss Hit";
        } else if (candle.low <= position.takeProfitPrice) {
          shouldClose = true; exitPrice = position.takeProfitPrice; reason = "Take Profit Hit";
        }
      }

      if (shouldClose) {
        const pnlPct =
          position.type === "LONG"
            ? ((exitPrice - position.entryPrice) / position.entryPrice) * leverage
            : ((position.entryPrice - exitPrice) / position.entryPrice) * leverage;
        const profit = position.amount * position.entryPrice * pnlPct;
        balance = Math.max(0, balance + profit);

        trades.push({
          id: `close_${candle.time}_${trades.length}`,
          type: position.type === "LONG" ? "CLOSE_BUY" : "CLOSE_SELL",
          price: exitPrice,
          amount: position.amount,
          time: candle.time,
          profit,
          pnlPercentage: pnlPct * 100,
          balanceAfter: balance,
          reason,
        });

        position = null;
      }
    }

    // 2. Look for a new entry signal (shared logic — identical to the live engine)
    if (!position && i >= warmup && balance > 1) {
      const signal = evaluateSignal(candles, i, config);
      if (signal) {
        const entryPrice = price;
        const margin = balance * 0.95;
        const amount = (margin * leverage) / entryPrice;
        const slFactor = stopLoss / 100;
        const tpFactor = takeProfit / 100;

        const stopLossPrice = signal.direction === "LONG" ? entryPrice * (1 - slFactor) : entryPrice * (1 + slFactor);
        const takeProfitPrice = signal.direction === "LONG" ? entryPrice * (1 + tpFactor) : entryPrice * (1 - tpFactor);

        position = { type: signal.direction, entryPrice, amount, entryTime: candle.time, stopLossPrice, takeProfitPrice };

        trades.push({
          id: `open_${candle.time}_${trades.length}`,
          type: signal.direction === "LONG" ? "BUY" : "SELL",
          price: entryPrice,
          amount,
          time: candle.time,
          profit: 0,
          pnlPercentage: 0,
          balanceAfter: balance,
          reason: signal.reason,
        });
      }
    }

    // 3. Mark-to-market equity + drawdown, once per bar
    const unrealized = position
      ? position.type === "LONG"
        ? position.amount * (price - position.entryPrice) * leverage
        : position.amount * (position.entryPrice - price) * leverage
      : 0;
    const equity = balance + unrealized;
    peakEquity = Math.max(peakEquity, equity);
    const drawdownPct = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;

    equityCurve.push({ time: candle.time, equity, drawdownPct: 0 });
    drawdownCurve.push({ time: candle.time, equity, drawdownPct });
  }

  const closedTrades = trades.filter((t) => t.type === "CLOSE_BUY" || t.type === "CLOSE_SELL");
  const winningTrades = closedTrades.filter((t) => t.profit > 0);
  const losingTrades = closedTrades.filter((t) => t.profit <= 0);
  const grossProfit = winningTrades.reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(losingTrades.reduce((s, t) => s + t.profit, 0));

  return {
    initialBalance,
    finalBalance: balance,
    cumulativeRoi: parseFloat((((balance - initialBalance) / initialBalance) * 100).toFixed(2)),
    maxDrawdown: parseFloat(Math.max(0, ...drawdownCurve.map((d) => d.drawdownPct)).toFixed(2)),
    winRate: closedTrades.length ? parseFloat(((winningTrades.length / closedTrades.length) * 100).toFixed(1)) : 0,
    profitFactor: grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? Infinity : 0,
    totalTrades: closedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    trades,
    equityCurve,
    drawdownCurve,
  };
}
