"use client";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Loader2 } from "lucide-react";
import type { BacktestResult } from "@/types";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "up" | "down" }) {
  return (
    <div className="bg-[#111111] border border-white/10 p-3.5 rounded-sm">
      <span className="text-[9px] uppercase tracking-tighter text-white/40 font-mono block mb-1">{label}</span>
      <span
        className={cn(
          "text-lg font-bold font-mono",
          tone === "up" && "text-primary",
          tone === "down" && "text-danger",
          tone === "default" && "text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function PerformanceDashboard({
  result,
  isBacktesting,
}: {
  result: BacktestResult | null;
  isBacktesting: boolean;
}) {
  if (isBacktesting) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-white/40 font-mono text-xs uppercase tracking-widest">
        <Loader2 className="w-4 h-4 animate-spin" /> Simulating in Web Worker...
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center py-16 text-white/30 font-mono text-xs uppercase tracking-widest">
        No results yet — run a backtest to see performance.
      </div>
    );
  }

  const roiPositive = result.cumulativeRoi >= 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Cumulative ROI" value={formatPercent(result.cumulativeRoi)} tone={roiPositive ? "up" : "down"} />
        <Kpi label="Final Balance" value={formatCurrency(result.finalBalance)} />
        <Kpi label="Max Drawdown" value={`${result.maxDrawdown.toFixed(2)}%`} tone="down" />
        <Kpi label="Win Rate" value={`${result.winRate.toFixed(1)}%`} />
        <Kpi label="Profit Factor" value={Number.isFinite(result.profitFactor) ? result.profitFactor.toFixed(2) : "∞"} />
        <Kpi label="Total Trades" value={String(result.totalTrades)} />
        <Kpi label="Winning Trades" value={String(result.winningTrades)} tone="up" />
        <Kpi label="Losing Trades" value={String(result.losingTrades)} tone="down" />
      </div>

      {result.equityCurve.length > 1 && (
        <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-4">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-2">Equity Curve</h4>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={result.equityCurve}>
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" hide />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} width={60} />
              <Tooltip
                contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
                formatter={(v: number) => formatCurrency(v)}
              />
              <Area type="monotone" dataKey="equity" stroke="#10B981" strokeWidth={1.5} fill="url(#equityFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {result.drawdownCurve.length > 1 && (
        <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-4">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-2">Drawdown</h4>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={result.drawdownCurve}>
              <defs>
                <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" hide />
              <YAxis reversed domain={[0, "auto"]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} width={40} />
              <Tooltip
                contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
                formatter={(v: number) => `${v.toFixed(2)}%`}
              />
              <Area type="monotone" dataKey="drawdownPct" stroke="#EF4444" strokeWidth={1.5} fill="url(#ddFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-[#0a0a0a] border border-white/10 rounded-lg overflow-hidden">
        <h4 className="text-[10px] font-mono uppercase tracking-widest text-white/40 px-4 pt-3 pb-2">
          Trade Log ({result.trades.length})
        </h4>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[#0a0a0a] text-white/40 uppercase tracking-wider">
              <tr className="border-t border-white/10">
                <th className="text-left px-4 py-1.5">Type</th>
                <th className="text-left px-4 py-1.5">Price</th>
                <th className="text-left px-4 py-1.5">PnL</th>
                <th className="text-left px-4 py-1.5">Reason</th>
              </tr>
            </thead>
            <tbody>
              {result.trades.slice(0, 200).map((t) => (
                <tr key={t.id} className="border-t border-white/5">
                  <td className={cn("px-4 py-1.5 font-bold", t.type.includes("BUY") ? "text-primary" : "text-danger")}>
                    {t.type}
                  </td>
                  <td className="px-4 py-1.5 text-white/70">${t.price.toLocaleString()}</td>
                  <td className={cn("px-4 py-1.5", t.profit >= 0 ? "text-primary" : "text-danger")}>
                    {t.profit !== 0 ? formatCurrency(t.profit) : "—"}
                  </td>
                  <td className="px-4 py-1.5 text-white/40 truncate max-w-[240px]">{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
