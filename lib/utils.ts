import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Candle, Symbol as MarketSymbol } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/**
 * Client-side fallback candle generator. Only used if `/api/candles`
 * (Postgres/TimescaleDB) is unreachable — e.g. first boot before the DB is
 * migrated/backfilled — so the dashboard is never a blank screen.
 */
export function generateHistoricalCandles(symbol: MarketSymbol, count: number): Candle[] {
  let basePrice = symbol === "BTC/USDT" ? 64000 : symbol === "ETH/USDT" ? 3400 : 150;
  const candles: Candle[] = [];
  let t = Math.floor(Date.now() / 1000) - count * 60;

  for (let i = 0; i < count; i++) {
    const volatility = 0.0015;
    const open = basePrice;
    const change = basePrice * (Math.random() - 0.49) * volatility;
    const close = basePrice + change;
    const range = basePrice * Math.random() * volatility * 0.7;
    const high = Math.max(open, close) + range;
    const low = Math.min(open, close) - range * (0.5 + Math.random() * 0.5);

    candles.push({
      time: t,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(200 + Math.random() * 1800),
    });

    basePrice = close;
    t += 60;
  }
  return candles;
}
