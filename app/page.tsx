"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Activity, Github } from "lucide-react";
import { Toaster, toast } from "sonner";
import BacktestControlPanel from "@/components/BacktestControlPanel";
import ChartContainer from "@/components/ChartContainer";
import PerformanceDashboard from "@/components/PerformanceDashboard";
import MarketStats from "@/components/MarketStats";
import { useAppStore } from "@/lib/store";
import { generateHistoricalCandles } from "@/lib/utils";
import type { Candle, BacktestResult, Trade, MarketState, WorkerResponse } from "@/types";

const SEED_MARKET_STATE: Record<string, MarketState> = {
  "BTC/USDT": { symbol: "BTC/USDT", price: 64200, change24h: 1.25, volume24h: 1540300, high24h: 64500, low24h: 63800 },
  "ETH/USDT": { symbol: "ETH/USDT", price: 3450, change24h: -0.45, volume24h: 890450, high24h: 3480, low24h: 3410 },
  "SOL/USDT": { symbol: "SOL/USDT", price: 145.5, change24h: 5.12, volume24h: 435010, high24h: 148.0, low24h: 142.5 },
};

export default function Home() {
  const { symbol, config, isLiveFeedActive, setIsLiveFeedActive } = useAppStore();

  const [historicalCandles, setHistoricalCandles] = useState<Candle[]>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(true);
  const [dataSource, setDataSource] = useState<"timescaledb" | "fallback">("timescaledb");

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const [liveTrades, setLiveTrades] = useState<Trade[]>([]);
  const [liveBalance, setLiveBalance] = useState(config.initialBalance);
  const [marketStates, setMarketStates] = useState<Record<string, MarketState>>(SEED_MARKET_STATE);

  // Phase 3: dedicated Web Worker for the backtest simulation loop —
  // created once, terminated on unmount.
  useEffect(() => {
    workerRef.current = new Worker(new URL("../workers/backtest.worker.ts", import.meta.url));
    workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
      setIsBacktesting(false);
      if ("error" in e.data) {
        toast.error(`Backtest failed: ${e.data.error}`);
        return;
      }
      setResult(e.data);
      toast.success(`Backtest complete — ${e.data.totalTrades} trades, ${e.data.cumulativeRoi.toFixed(2)}% ROI`);
    };
    return () => workerRef.current?.terminate();
  }, []);

  // Phase 1: fetch downsampled candles from the TimescaleDB-backed route
  // handler; fall back to a client-generated series only if the API/DB is
  // unreachable (e.g. fresh clone before `npm run db:migrate` was run).
  useEffect(() => {
    let cancelled = false;
    setIsLoadingCandles(true);
    setLiveTrades([]);
    setLiveBalance(config.initialBalance);

    fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=1m&count=800`)
      .then((res) => {
        if (!res.ok) throw new Error("api unavailable");
        return res.json();
      })
      .then((json: { data: Candle[] }) => {
        if (cancelled) return;
        if (!json.data || json.data.length === 0) throw new Error("no data");
        setHistoricalCandles(json.data);
        setDataSource("timescaledb");
      })
      .catch(() => {
        if (cancelled) return;
        setHistoricalCandles(generateHistoricalCandles(symbol, 800));
        setDataSource("fallback");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCandles(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const runBacktest = useCallback(() => {
    if (!workerRef.current || historicalCandles.length === 0) return;
    setIsBacktesting(true);
    setResult(null);
    workerRef.current.postMessage({ candles: historicalCandles, config });
  }, [historicalCandles, config]);

  const handleMarketUpdate = useCallback((state: MarketState) => {
    setMarketStates((prev) => ({ ...prev, [state.symbol]: state }));
  }, []);

  const handleLiveTrade = useCallback((trade: Trade, balance: number) => {
    setLiveBalance(balance);
    setLiveTrades((prev) => {
      const next = [trade, ...prev];
      // Cap client-side history so a long-running session doesn't grow unbounded.
      return next.length > 300 ? next.slice(0, 300) : next;
    });
    toast(trade.type.includes("CLOSE") ? `Closed ${trade.type === "CLOSE_BUY" ? "long" : "short"}` : `Opened ${trade.type}`, {
      description: trade.reason,
    });
  }, []);

  return (
    <main className="min-h-screen bg-[#020202]">
      <Toaster theme="dark" position="top-right" />
      <header className="border-b border-white/10 bg-[#050505]/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-sm font-bold font-mono uppercase tracking-widest text-white">ApexEngine</h1>
              <p className="text-[9px] text-white/40 font-mono uppercase tracking-tighter">High-Throughput Backtesting &amp; Live Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded-sm border border-white/10 text-white/40">
              {dataSource === "timescaledb" ? "TimescaleDB Connected" : "Fallback Data (DB unreachable)"}
            </span>
            <a href="https://github.com/DevTechMike-Coder" target="_blank" rel="noreferrer" className="text-white/40 hover:text-white">
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <MarketStats marketStates={marketStates} selectedSymbol={symbol} onSelect={useAppStore.getState().setSymbol} />

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
          <BacktestControlPanel onRunBacktest={runBacktest} isBacktesting={isBacktesting} />

          <div className="space-y-6">
            {isLoadingCandles ? (
              <div className="h-[420px] flex items-center justify-center border border-white/10 rounded-lg bg-[#0a0a0a] text-white/30 font-mono text-xs uppercase tracking-widest">
                Loading candle history...
              </div>
            ) : (
              <ChartContainer
                symbol={symbol}
                historicalCandles={historicalCandles}
                trades={isLiveFeedActive ? liveTrades : (result?.trades ?? [])}
                config={config}
                isLiveFeedActive={isLiveFeedActive}
                setIsLiveFeedActive={setIsLiveFeedActive}
                onMarketUpdate={handleMarketUpdate}
                onLiveTrade={handleLiveTrade}
              />
            )}

            {isLiveFeedActive && (
              <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-4 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">Live Sandbox Balance</span>
                <span className="text-lg font-bold font-mono text-primary">${liveBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <PerformanceDashboard result={result} isBacktesting={isBacktesting} />
          </div>
        </div>
      </div>
    </main>
  );
}
