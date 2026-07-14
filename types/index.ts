export type Symbol = "BTC/USDT" | "ETH/USDT" | "SOL/USDT";
export type Interval = "1m" | "5m" | "15m" | "1h" | "1d";
export type StrategyType = "SMA" | "RSI" | "MACD";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Tick {
  timestamp: number; // unix ms
  symbol: Symbol;
  price: number;
  volume: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

export interface MarketState {
  symbol: Symbol;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

export interface StrategyConfig {
  type: StrategyType;
  smaFast: number;
  smaSlow: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  emaFast: number;
  emaSlow: number;
  emaSignal: number;
  stopLoss: number; // percent
  takeProfit: number; // percent
  leverage: number;
  initialBalance: number;
}

export type TradeType = "BUY" | "SELL" | "CLOSE_BUY" | "CLOSE_SELL";

export interface Trade {
  id: string;
  type: TradeType;
  price: number;
  amount: number;
  time: number; // unix seconds
  profit: number;
  pnlPercentage: number;
  balanceAfter: number;
  reason: string;
}

export interface EquityPoint {
  time: number;
  equity: number;
  drawdownPct: number;
}

export interface BacktestResult {
  initialBalance: number;
  finalBalance: number;
  cumulativeRoi: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  trades: Trade[];
  equityCurve: EquityPoint[];
  drawdownCurve: EquityPoint[];
}

export interface WorkerRequest {
  candles: Candle[];
  config: StrategyConfig;
}

export type WorkerResponse = BacktestResult | { error: string };
