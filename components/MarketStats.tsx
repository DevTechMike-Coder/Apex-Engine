"use client";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { MarketState, Symbol as MarketSymbol } from "@/types";
import { cn, formatPercent } from "@/lib/utils";

export default function MarketStats({
  marketStates,
  selectedSymbol,
  onSelect,
}: {
  marketStates: Record<string, MarketState>;
  selectedSymbol: MarketSymbol;
  onSelect: (s: MarketSymbol) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" id="market-stats-bar">
      {Object.values(marketStates).map((m) => {
        const isUp = m.change24h >= 0;
        const isActive = m.symbol === selectedSymbol;
        return (
          <button
            key={m.symbol}
            onClick={() => onSelect(m.symbol as MarketSymbol)}
            className={cn(
              "text-left bg-[#0a0a0a] border rounded-lg p-4 transition-colors",
              isActive ? "border-primary/40" : "border-white/10 hover:border-white/20"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono uppercase tracking-widest text-white">{m.symbol}</span>
              <span className={cn("flex items-center gap-1 text-[10px] font-mono font-bold", isUp ? "text-primary" : "text-danger")}>
                {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {formatPercent(m.change24h)}
              </span>
            </div>
            <div className="mt-1.5 text-lg font-bold font-mono text-white">
              ${m.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-white/40 uppercase tracking-tighter">
              <span>H: ${m.high24h.toLocaleString()}</span>
              <span>L: ${m.low24h.toLocaleString()}</span>
              <span>Vol: {(m.volume24h / 1000).toFixed(1)}K</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
