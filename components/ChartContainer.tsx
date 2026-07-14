"use client";
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type LineData,
  type Time,
} from "lightweight-charts";
import { Play, Square, Activity, Wifi, WifiOff } from "lucide-react";
import type { Candle, Tick, StrategyConfig, Trade, MarketState, Symbol as MarketSymbol } from "@/types";
import { sma } from "@/lib/indicators";
import { LiveEngine } from "@/lib/live-engine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChartContainerProps {
  symbol: MarketSymbol;
  historicalCandles: Candle[];
  trades: Trade[];
  config: StrategyConfig;
  isLiveFeedActive: boolean;
  setIsLiveFeedActive: (active: boolean) => void;
  onMarketUpdate: (state: MarketState) => void;
  onLiveTrade: (trade: Trade, balance: number) => void;
}

export default function ChartContainer({
  symbol,
  historicalCandles,
  trades,
  config,
  isLiveFeedActive,
  setIsLiveFeedActive,
  onMarketUpdate,
  onLiveTrade,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPriceDomRef = useRef<HTMLSpanElement>(null);
  const activeCandlesDomRef = useRef<HTMLSpanElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fastLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const slowLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const currentCandlesRef = useRef<Candle[]>([]);
  const tickQueueRef = useRef<Tick[]>([]);
  const rafRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const liveEngineRef = useRef<LiveEngine>(new LiveEngine(config.initialBalance));
  const configRef = useRef(config); // rAF loop reads latest config without re-subscribing
  const marketStateBufferRef = useRef<Partial<MarketState>>({});

  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    liveEngineRef.current.reset(config.initialBalance);
  }, [symbol, config.initialBalance]);

  // Chart lifecycle
  useEffect(() => {
    if (!containerRef.current) return;
    currentCandlesRef.current = [...historicalCandles];
    setActiveCount(currentCandlesRef.current.length);

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 420,
      layout: { background: { color: "#050505" }, textColor: "#a0a0a0" },
      grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
      crosshair: { mode: 1 },
      timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10B981", downColor: "#EF4444", borderVisible: false,
      wickUpColor: "#10B981", wickDownColor: "#EF4444",
    });
    candleSeriesRef.current = candleSeries;

    fastLineRef.current = chart.addSeries(LineSeries, { color: "#3B82F6", lineWidth: 1, title: "Fast" });
    slowLineRef.current = chart.addSeries(LineSeries, { color: "#F59E0B", lineWidth: 1, title: "Slow" });

    const handleResize = () => {
      if (containerRef.current) chart.resize(containerRef.current.clientWidth, 420);
    };
    window.addEventListener("resize", handleResize);

    renderAll();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicalCandles, symbol]);

  useEffect(() => {
    renderIndicators();
    renderTradeMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, config.type, config.smaFast, config.smaSlow]);

  function renderAll() {
    if (!candleSeriesRef.current) return;
    const formatted: CandlestickData[] = currentCandlesRef.current.map((c) => ({
      time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    candleSeriesRef.current.setData(formatted);
    renderIndicators();
    renderTradeMarkers();
  }

  function renderIndicators() {
    if (!fastLineRef.current || !slowLineRef.current) return;
    if (configRef.current.type !== "SMA") {
      fastLineRef.current.setData([]);
      slowLineRef.current.setData([]);
      return;
    }
    const candles = currentCandlesRef.current;
    const closes = candles.map((c) => c.close);
    const fast = sma(closes, configRef.current.smaFast);
    const slow = sma(closes, configRef.current.smaSlow);
    const fastData: LineData[] = candles
      .map((c, i) => ({ time: c.time as Time, value: fast[i]! }))
      .filter((d) => !Number.isNaN(d.value));
    const slowData: LineData[] = candles
      .map((c, i) => ({ time: c.time as Time, value: slow[i]! }))
      .filter((d) => !Number.isNaN(d.value));
    fastLineRef.current.setData(fastData);
    slowLineRef.current.setData(slowData);
  }

  function renderTradeMarkers() {
    if (!candleSeriesRef.current) return;
    const markers = trades.map((t) => {
      const isBuy = t.type === "BUY" || t.type === "CLOSE_SELL";
      return {
        time: t.time as Time,
        position: (isBuy ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
        color: isBuy ? "#10B981" : "#EF4444",
        shape: (isBuy ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
        text: t.type,
      };
    });
    if (!markersRef.current) {
      markersRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
    } else {
      markersRef.current.setMarkers(markers);
    }
  }

  // WebSocket + rAF drain loop
  useEffect(() => {
    if (!isLiveFeedActive) {
      wsRef.current?.close();
      wsRef.current = null;
      setWsStatus("disconnected");
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    setWsStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ticks`);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("connected");
    ws.onmessage = (event) => {
      try {
        tickQueueRef.current.push(JSON.parse(event.data) as Tick);
      } catch {
        /* malformed frame, drop it */
      }
    };
    ws.onerror = () => setWsStatus("disconnected");
    ws.onclose = () => setWsStatus("disconnected");

    // Batches flushed to React state at most once per rAF frame (~60Hz cap),
    // never once per tick — see architecture rule #1.
    let framesSinceMarketFlush = 0;

    const loop = () => {
      if (tickQueueRef.current.length > 0) {
        const batch = tickQueueRef.current;
        tickQueueRef.current = [];

        let lastRelevantTick: Tick | null = null;
        for (const tick of batch) {
          if (tick.symbol !== symbol) continue;
          lastRelevantTick = tick;
          updateLatestCandle(tick);

          const liveEvent = liveEngineRef.current.onTick(tick.price, Math.floor(tick.timestamp / 1000), configRef.current);
          if (liveEvent) onLiveTrade(liveEvent.trade, liveEvent.balance);

          marketStateBufferRef.current = {
            symbol: tick.symbol,
            price: tick.price,
            change24h: tick.change24h,
            volume24h: tick.volume24h,
            high24h: tick.high24h,
            low24h: tick.low24h,
          };
        }

        if (lastRelevantTick && lastPriceDomRef.current) {
          // Imperative DOM write — bypasses React entirely for the hottest value.
          lastPriceDomRef.current.textContent = `$${lastRelevantTick.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        }
      }

      // Flush the buffered market snapshot to React state at ~4Hz — enough
      // for the ticker bar to feel live without re-rendering the tree at 60Hz.
      framesSinceMarketFlush++;
      if (framesSinceMarketFlush >= 15 && marketStateBufferRef.current.symbol) {
        framesSinceMarketFlush = 0;
        onMarketUpdate(marketStateBufferRef.current as MarketState);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      ws.close();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveFeedActive, symbol]);

  function updateLatestCandle(tick: Tick) {
    if (!candleSeriesRef.current) return;
    const candles = currentCandlesRef.current;
    if (candles.length === 0) return;

    const last = candles[candles.length - 1]!;
    const tickTime = Math.floor(tick.timestamp / 1000);
    const bucketStart = Math.floor(tickTime / 60) * 60;

    if (last.time === bucketStart) {
      last.close = tick.price;
      last.high = Math.max(last.high, tick.price);
      last.low = Math.min(last.low, tick.price);
      last.volume += tick.volume;
      candleSeriesRef.current.update({ time: last.time as Time, open: last.open, high: last.high, low: last.low, close: last.close });
    } else if (bucketStart > last.time) {
      const newCandle: Candle = { time: bucketStart, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.volume };
      candles.push(newCandle);
      if (candles.length > 1500) candles.shift();
      setActiveCount(candles.length);
      candleSeriesRef.current.update({ time: newCandle.time as Time, open: newCandle.open, high: newCandle.high, low: newCandle.low, close: newCandle.close });
      renderIndicators();

      const liveEvent = liveEngineRef.current.onCandleClose(candles, configRef.current);
      if (liveEvent) onLiveTrade(liveEvent.trade, liveEvent.balance);
    }
  }

  return (
    <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-5" id="market-chart-component">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest">{symbol} Real-Time Chart</h3>
            <Badge>60 FPS Canvas</Badge>
          </div>
          <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-tighter">
            Imperative canvas + DOM updates for ticks — React state is only touched on trade events and ~4Hz market snapshots.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-[#050505] border border-white/10 font-mono">
            {wsStatus === "connected" ? (
              <><Wifi className="w-3.5 h-3.5 text-primary animate-pulse" /><span className="text-[10px] font-bold text-primary uppercase tracking-wider">Live Tick Stream</span></>
            ) : wsStatus === "connecting" ? (
              <><Activity className="w-3.5 h-3.5 text-amber-500 animate-spin" /><span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Connecting...</span></>
            ) : (
              <><WifiOff className="w-3.5 h-3.5 text-white/30" /><span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Offline Feed</span></>
            )}
          </div>
          <Button variant={isLiveFeedActive ? "danger" : "default"} onClick={() => setIsLiveFeedActive(!isLiveFeedActive)}>
            {isLiveFeedActive ? (<><Square className="w-3 h-3 fill-current" /> Stop Feed</>) : (<><Play className="w-3 h-3 fill-current" /> Start Live Feed</>)}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3.5">
        <div className="bg-[#111111] border border-white/10 p-3.5 rounded-sm">
          <span className="text-[9px] uppercase tracking-tighter text-white/40 font-mono block mb-1">Last Recorded Price</span>
          <span ref={lastPriceDomRef} className="text-lg font-bold font-mono text-primary">Waiting for feed...</span>
        </div>
        <div className="bg-[#111111] border border-white/10 p-3.5 rounded-sm">
          <span className="text-[9px] uppercase tracking-tighter text-white/40 font-mono block mb-1">Total Active Candles</span>
          <span ref={activeCandlesDomRef} className="text-lg font-bold font-mono text-white">{activeCount}</span>
        </div>
        <div className="bg-[#111111] border border-white/10 p-3.5 rounded-sm">
          <span className="text-[9px] uppercase tracking-tighter text-white/40 font-mono block mb-1">Strategy Overlay</span>
          <span className="text-xs font-bold font-mono text-blue-400 mt-1 block uppercase">
            {config.type === "SMA" ? `SMA (${config.smaFast}/${config.smaSlow})` : config.type === "RSI" ? `RSI (${config.rsiPeriod})` : "MACD"}
          </span>
        </div>
        <div className="bg-[#111111] border border-white/10 p-3.5 rounded-sm">
          <span className="text-[9px] uppercase tracking-tighter text-white/40 font-mono block mb-1">Active Order Marks</span>
          <span className="text-lg font-bold font-mono text-primary">{trades.length}</span>
        </div>
      </div>

      <div className={cn("relative rounded-sm overflow-hidden border border-white/10 bg-[#050505] min-h-[420px]")}>
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
