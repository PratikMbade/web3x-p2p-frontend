import { useEffect, useRef, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  ColorType,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";
import { useCandleSocket, CandleInterval, OHLCVCandle } from "~/hooks/useCandleSocket";
import { useTheme } from "~/contexts/ThemeContext";
import { cn } from "~/lib/utils";
import { Wifi, WifiOff, Loader2, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";

interface TradingChartProps {
  tokenOne:        string;
  tokenTwo:        string;
  tokenOneSymbol?: string;
  tokenTwoSymbol?: string;
  className?:      string;
  style?:          React.CSSProperties;
}

const INTERVALS: { label: string; value: CandleInterval }[] = [
  { label: "1M",  value: "1m"  },
  { label: "5M",  value: "5m"  },
  { label: "15M", value: "15m" },
  { label: "1H",  value: "1h"  },
  { label: "4H",  value: "4h"  },
  { label: "1D",  value: "1d"  },
];

function getChartColors(isDark: boolean) {
  return {
    textColor:     isDark ? "rgba(255,255,255,0.32)" : "rgba(10,10,10,0.50)",
    gridColor:     isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)",
    borderColor:   isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)",
    crosshairColor:isDark ? "rgba(245,158,11,0.6)"  : "rgba(180,83,9,0.6)",
    crosshairBg:   isDark ? "#451a03"                : "#fef3c7",
  };
}

function toChartCandle(c: OHLCVCandle): CandlestickData {
  return { time: c.time as unknown as string, open: c.open, high: c.high, low: c.low, close: c.close };
}

function toVolBar(c: OHLCVCandle): HistogramData {
  return {
    time:  c.time as unknown as string,
    value: c.volume,
    color: c.close >= c.open ? "rgba(16,185,129,0.28)" : "rgba(244,63,94,0.28)",
  };
}

function fmt(n: number, decimals = 6): string {
  if (n === 0) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(decimals);
}

export default function TradingChart({
  tokenOne, tokenTwo,
  tokenOneSymbol, tokenTwoSymbol,
  className, style,
}: TradingChartProps) {
  const { theme } = useTheme();
  const [interval, setIntervalState] = useState<CandleInterval>("1h");
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef          = useRef<IChartApi | null>(null);
  const candleSeriesRef   = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef   = useRef<ISeriesApi<"Histogram"> | null>(null);
  const initializedRef    = useRef(false);

  const [hovered, setHovered] = useState<{
    open: number; high: number; low: number; close: number; volume: number;
  } | null>(null);

  const { candles, latestCandle, status } = useCandleSocket({
    tokenOne, tokenTwo, interval,
    enabled: !!(tokenOne && tokenTwo),
  });

  // ── Chart init ───────────────────────────────────────────────────

  useEffect(() => {
    if (!chartContainerRef.current || initializedRef.current) return;
    initializedRef.current = true;
    const isDark = theme === "dark";
    const colors = getChartColors(isDark);

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background:  { type: ColorType.Solid, color: "transparent" },
        textColor:   colors.textColor,
        fontFamily:  "'IBM Plex Mono', 'JetBrains Mono', monospace",
        fontSize:    11,
      },
      grid: {
        vertLines: { color: colors.gridColor, style: LineStyle.Dashed },
        horzLines: { color: colors.gridColor, style: LineStyle.Dashed },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: colors.crosshairColor, labelBackgroundColor: colors.crosshairBg, style: LineStyle.Solid },
        horzLine: { color: colors.crosshairColor, labelBackgroundColor: colors.crosshairBg },
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        textColor:   colors.textColor,
      },
      timeScale: {
        borderColor:    colors.borderColor,
        timeVisible:    true,
        secondsVisible: false,
        fixLeftEdge:    true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale:  { mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor:         "#10b981",
      downColor:       "#f43f5e",
      borderUpColor:   "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor:     "#10b981",
      wickDownColor:   "#f43f5e",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat:  { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setHovered(null); return; }
      const c = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      const v = param.seriesData.get(volumeSeries) as HistogramData | undefined;
      if (c) setHovered({ open: c.open, high: c.high, low: c.low, close: c.close, volume: (v?.value as number) || 0 });
    });

    chartRef.current        = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current        = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      initializedRef.current  = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Theme-reactive chart colors ──────────────────────────────────

  useEffect(() => {
    if (!chartRef.current) return;
    const isDark = theme === "dark";
    const colors = getChartColors(isDark);
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor:  colors.textColor,
        fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: colors.gridColor, style: LineStyle.Dashed },
        horzLines: { color: colors.gridColor, style: LineStyle.Dashed },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: colors.crosshairColor, labelBackgroundColor: colors.crosshairBg, style: LineStyle.Solid },
        horzLine: { color: colors.crosshairColor, labelBackgroundColor: colors.crosshairBg },
      },
      rightPriceScale: { borderColor: colors.borderColor, textColor: colors.textColor },
      timeScale:       { borderColor: colors.borderColor },
    });
  }, [theme]);

  // ── Data updates ─────────────────────────────────────────────────

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;
    candleSeriesRef.current.setData(candles.map(toChartCandle));
    volumeSeriesRef.current.setData(candles.map(toVolBar));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    if (!latestCandle || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    candleSeriesRef.current.update(toChartCandle(latestCandle));
    volumeSeriesRef.current.update(toVolBar(latestCandle));
  }, [latestCandle]);

  const display    = hovered ?? (candles.length > 0 ? candles[candles.length - 1] : null);
  const pairLabel  = tokenOneSymbol && tokenTwoSymbol
    ? `${tokenOneSymbol} / ${tokenTwoSymbol}`
    : `${tokenOne.slice(0, 6)}… / ${tokenTwo.slice(0, 6)}…`;
  const priceChange = display ? ((display.close - display.open) / display.open) * 100 : 0;
  const isUp = priceChange >= 0;

  return (
    <div className={cn("p2p-card flex flex-col", className)} style={style}>
      {/* Header */}
      <div className="p2p-card-header flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Pair + price */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-glow)" }}
            >
              <BarChart2 className="w-4 h-4" style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p
                className="text-sm font-bold leading-tight"
                style={{ color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {pairLabel}
              </p>
              {display && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-base font-bold leading-none"
                    style={{
                      color: isUp ? "var(--buy)" : "var(--sell)",
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    {fmt(display.close)}
                  </span>
                  <span
                    className="flex items-center gap-0.5 text-xs font-semibold"
                    style={{ color: isUp ? "var(--buy)" : "var(--sell)" }}
                  >
                    {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {isUp ? "+" : ""}{priceChange.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* OHLCV stats — large desktop only */}
          {display && (
            <div
              className="hidden xl:flex items-center gap-3 2xl:gap-4 text-[11px]"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {[
                { l: "O", v: fmt(display.open),     c: "var(--text-dim)"     },
                { l: "H", v: fmt(display.high),     c: "var(--buy)"          },
                { l: "L", v: fmt(display.low),      c: "var(--sell)"         },
                { l: "C", v: fmt(display.close),    c: "var(--text)"         },
                { l: "V", v: fmt(display.volume,2), c: "var(--accent-text)"  },
              ].map(({ l, v, c }) => (
                <div key={l} className="flex items-center gap-1">
                  <span style={{ color: "var(--text-muted)" }}>{l}</span>
                  <span style={{ color: c, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* WS status */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold tracking-wide border"
            style={{
              background: status === "connected"  ? "var(--buy-dim)"
                        : status === "connecting" ? "var(--accent-dim)"
                        :                          "var(--sell-dim)",
              borderColor: status === "connected"  ? "var(--buy-border)"
                         : status === "connecting" ? "var(--accent-glow)"
                         :                          "var(--sell-border)",
              color: status === "connected"  ? "var(--buy)"
                   : status === "connecting" ? "var(--accent)"
                   :                          "var(--sell)",
            }}
          >
            {status === "connected"  ? <Wifi    className="w-3 h-3" /> :
             status === "connecting" ? <Loader2 className="w-3 h-3 animate-spin" /> :
                                       <WifiOff className="w-3 h-3" />}
            <span className="hidden sm:inline">
              {status === "connected" ? "LIVE" : status === "connecting" ? "…" : "OFF"}
            </span>
          </div>

          {/* Interval selector */}
          <div
            className="flex items-center rounded-lg p-0.5 gap-0.5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            {INTERVALS.map((iv) => {
              const isActive = interval === iv.value;
              return (
                <button
                  key={iv.value}
                  onClick={() => setIntervalState(iv.value)}
                  className="px-2 sm:px-2.5 py-1.5 rounded-md text-[10px] font-bold tracking-wide transition-all"
                  style={{
                    background: isActive ? "var(--accent)" : "transparent",
                    color: isActive ? "#000" : "var(--text-muted)",
                  }}
                >
                  {iv.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart canvas */}
      <div className="relative flex-1 min-h-0">
        {candles.length === 0 && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10"
            style={{ background: "var(--bg-card)" }}
          >
            {status === "connected" || status === "connecting" ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent)" }} />
                <p
                  className="text-[11px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Loading chart…
                </p>
              </>
            ) : (
              <p
                className="text-[11px] font-semibold tracking-widest uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                No chart data for this pair
              </p>
            )}
          </div>
        )}
        <div
          ref={chartContainerRef}
          className="w-full h-full"
          style={{ minHeight: "240px" }}
        />
      </div>
    </div>
  );
}
