import { create } from "zustand";
import type { StrategyConfig, Symbol as MarketSymbol } from "@/types";

interface AppState {
  symbol: MarketSymbol;
  setSymbol: (s: MarketSymbol) => void;

  config: StrategyConfig;
  setConfig: (c: StrategyConfig | ((prev: StrategyConfig) => StrategyConfig)) => void;

  isLiveFeedActive: boolean;
  setIsLiveFeedActive: (v: boolean) => void;
}

const defaultConfig: StrategyConfig = {
  type: "SMA",
  smaFast: 10,
  smaSlow: 30,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  emaFast: 12,
  emaSlow: 26,
  emaSignal: 9,
  stopLoss: 1.5,
  takeProfit: 4.5,
  leverage: 10,
  initialBalance: 10000,
};

/**
 * Global app-state config ONLY, per the architecture brief: strategy
 * parameters, selected symbol, live-feed toggle. Raw ticks, candle buffers,
 * and canvas state never live here — those stay in refs (see
 * components/ChartContainer.tsx) so a 10Hz tick stream never triggers a
 * React re-render of the whole tree.
 */
export const useAppStore = create<AppState>((set) => ({
  symbol: "BTC/USDT",
  setSymbol: (s) => set({ symbol: s }),

  config: defaultConfig,
  setConfig: (c) =>
    set((state) => ({ config: typeof c === "function" ? c(state.config) : c })),

  isLiveFeedActive: false,
  setIsLiveFeedActive: (v) => set({ isLiveFeedActive: v }),
}));
