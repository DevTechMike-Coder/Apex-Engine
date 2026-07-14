"use client";
import { Play, Loader2, Cpu } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import type { StrategyType, Symbol as MarketSymbol } from "@/types";

function Field({ label, value, children }: { label: string; value: string | number; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[9px] font-mono uppercase tracking-widest text-white/40">{label}</label>
        <span className="text-[10px] font-mono font-bold text-white">{value}</span>
      </div>
      {children}
    </div>
  );
}

export default function BacktestControlPanel({
  onRunBacktest,
  isBacktesting,
}: {
  onRunBacktest: () => void;
  isBacktesting: boolean;
}) {
  const { symbol, setSymbol, config, setConfig } = useAppStore();

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-primary" />
          <CardTitle>Strategy Control Room</CardTitle>
        </div>
        <CardDescription>Configure indicators, risk, and run the worker-threaded backtest</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-[9px] font-mono uppercase tracking-widest text-white/40">Asset</label>
          <Select value={symbol} onValueChange={(v) => setSymbol(v as MarketSymbol)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BTC/USDT">BTC/USDT</SelectItem>
              <SelectItem value="ETH/USDT">ETH/USDT</SelectItem>
              <SelectItem value="SOL/USDT">SOL/USDT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[9px] font-mono uppercase tracking-widest text-white/40">Strategy</label>
          <Select value={config.type} onValueChange={(v) => setConfig((c) => ({ ...c, type: v as StrategyType }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SMA">SMA Crossover</SelectItem>
              <SelectItem value="RSI">RSI Oscillator</SelectItem>
              <SelectItem value="MACD">MACD Crossover</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config.type === "SMA" && (
          <div className="grid grid-cols-2 gap-4 pt-1 border-t border-white/5">
            <Field label="Fast Period" value={config.smaFast}>
              <Slider min={2} max={50} step={1} value={[config.smaFast]} onValueChange={(value) => setConfig((c) => ({ ...c, smaFast: value[0]! }))} />
            </Field>
            <Field label="Slow Period" value={config.smaSlow}>
              <Slider min={5} max={200} step={1} value={[config.smaSlow]} onValueChange={(value) => setConfig((c) => ({ ...c, smaSlow: value[0]! }))} />
            </Field>
          </div>
        )}

        {config.type === "RSI" && (
          <div className="grid grid-cols-1 gap-4 pt-1 border-t border-white/5">
            <Field label="RSI Period" value={config.rsiPeriod}>
              <Slider min={2} max={50} step={1} value={[config.rsiPeriod]} onValueChange={(value) => setConfig((c) => ({ ...c, rsiPeriod: value[0]! }))} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Oversold" value={config.rsiOversold}>
                <Slider min={5} max={45} step={1} value={[config.rsiOversold]} onValueChange={(value) => setConfig((c) => ({ ...c, rsiOversold: value[0]! }))} />
              </Field>
              <Field label="Overbought" value={config.rsiOverbought}>
                <Slider min={55} max={95} step={1} value={[config.rsiOverbought]} onValueChange={(value) => setConfig((c) => ({ ...c, rsiOverbought: value[0]! }))} />
              </Field>
            </div>
          </div>
        )}

        {config.type === "MACD" && (
          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-white/5">
            <Field label="Fast EMA" value={config.emaFast}>
              <Slider min={2} max={30} step={1} value={[config.emaFast]} onValueChange={(value) => setConfig((c) => ({ ...c, emaFast: value[0]! }))} />
            </Field>
            <Field label="Slow EMA" value={config.emaSlow}>
              <Slider min={10} max={60} step={1} value={[config.emaSlow]} onValueChange={(value) => setConfig((c) => ({ ...c, emaSlow: value[0]! }))} />
            </Field>
            <Field label="Signal" value={config.emaSignal}>
              <Slider min={2} max={20} step={1} value={[config.emaSignal]} onValueChange={(value) => setConfig((c) => ({ ...c, emaSignal: value[0]! }))} />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/5">
          <Field label="Stop Loss %" value={`${config.stopLoss}%`}>
            <Slider min={0.5} max={10} step={0.1} value={[config.stopLoss]} onValueChange={(value) => setConfig((c) => ({ ...c, stopLoss: value[0]! }))} />
          </Field>
          <Field label="Take Profit %" value={`${config.takeProfit}%`}>
            <Slider min={0.5} max={20} step={0.1} value={[config.takeProfit]} onValueChange={(value) => setConfig((c) => ({ ...c, takeProfit: value[0]! }))} />
          </Field>
        </div>

        <Field label="Leverage" value={`${config.leverage}x`}>
          <Slider min={1} max={50} step={1} value={[config.leverage]} onValueChange={(value) => setConfig((c) => ({ ...c, leverage: value[0]! }))} />
        </Field>

        <Field label="Initial Balance" value={`$${config.initialBalance.toLocaleString()}`}>
          <Slider min={1000} max={100000} step={1000} value={[config.initialBalance]} onValueChange={(value) => setConfig((c) => ({ ...c, initialBalance: value[0]! }))} />
        </Field>

        <Button className="w-full" size="default" onClick={onRunBacktest} disabled={isBacktesting}>
          {isBacktesting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running In Worker Thread...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" /> Run Backtest
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
