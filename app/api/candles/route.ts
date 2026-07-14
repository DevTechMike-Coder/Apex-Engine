import { NextRequest, NextResponse } from "next/server";
import { getDownsampledCandles, type Interval } from "@/db/queries";

const VALID_INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "1d"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "BTC/USDT";
  const intervalParam = searchParams.get("interval") ?? "1m";
  // Hard cap regardless of what's requested — never send more than 1000
  // candles to the client (architecture rule #3), and never trust a raw
  // client-supplied number into a loop/query without bounding it first.
  const count = Math.max(1, Math.min(parseInt(searchParams.get("count") ?? "800", 10) || 800, 1000));

  if (!VALID_INTERVALS.includes(intervalParam as Interval)) {
    return NextResponse.json({ error: `interval must be one of ${VALID_INTERVALS.join(", ")}` }, { status: 400 });
  }
  const interval = intervalParam as Interval;

  try {
    const data = await getDownsampledCandles(symbol, interval, count);
    return NextResponse.json({ symbol, interval, count: data.length, data });
  } catch (err) {
    console.error("[api/candles] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load candle history from TimescaleDB. Has `npm run db:migrate` / `npm run db:backfill` been run?" },
      { status: 503 }
    );
  }
}
