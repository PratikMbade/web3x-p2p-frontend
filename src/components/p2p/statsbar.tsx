import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Activity, Layers, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { fetchGlobalStats, GlobalStats } from "~/lib/tradingApi";
import { ethers } from "ethers";

function fmtWei(wei: string): string {
  try {
    const n = parseFloat(ethers.formatUnits(wei, 18));
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(2);
  } catch { return "—"; }
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
  sub,
  up,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: string;
  sub?: string;
  up?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div
        className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${accent}14`, border: `1px solid ${accent}28` }}
      >
        <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: accent }} />
      </div>
      <div>
        <p
          className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider leading-none mb-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </p>
        <div className="flex items-center gap-1">
          <span
            className="text-xs sm:text-sm font-bold leading-none"
            style={{ color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {value}
          </span>
          {sub && (
            <span
              className="hidden sm:flex items-center text-[10px] font-semibold"
              style={{ color: up === undefined ? "var(--text-muted)" : up ? "var(--buy)" : "var(--sell)" }}
            >
              {up !== undefined && (up
                ? <ArrowUpRight className="w-2.5 h-2.5" />
                : <ArrowDownRight className="w-2.5 h-2.5" />)}
              {sub}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const DIVIDER = (
  <div
    className="shrink-0 w-px h-7"
    style={{ background: "var(--border)" }}
  />
);

export default function StatsBar() {
  const [stats, setStats] = useState<GlobalStats | null>(null);

  useEffect(() => {
    fetchGlobalStats().then(setStats);
    const id = setInterval(() => fetchGlobalStats().then(setStats), 30_000);
    return () => clearInterval(id);
  }, []);

  const fillRate = stats
    ? Math.round((stats.orders.filled / Math.max(stats.orders.total, 1)) * 100)
    : null;

  return (
    <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Stat
        icon={BarChart3}
        label="Orders"
        value={stats ? stats.orders.total.toLocaleString() : "—"}
        accent="#6366f1"
      />

      {DIVIDER}

      <Stat
        icon={TrendingUp}
        label="Open / Filled"
        value={stats ? `${stats.orders.open} / ${stats.orders.filled}` : "—"}
        accent="#10b981"
        sub={fillRate !== null ? `${fillRate}% filled` : undefined}
      />

      {DIVIDER}

      <Stat
        icon={Activity}
        label="24h Trades"
        value={stats ? stats.trades.last24h.toLocaleString() : "—"}
        accent="#f59e0b"
      />

      {DIVIDER}

      <Stat
        icon={Layers}
        label="24h Volume"
        value={stats ? fmtWei(stats.volume.last24h) : "—"}
        accent="#38bdf8"
        sub={stats ? `${stats.activePairs} pairs` : undefined}
      />
    </div>
  );
}
