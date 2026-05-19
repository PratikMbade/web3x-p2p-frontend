import { ArrowDownLeft, ArrowUpRight, Loader2, Clock, Zap } from "lucide-react";
import { cn } from "~/lib/utils";
import { ethers } from "ethers";
import { useTradeHistory } from "~/hooks/useTradeHistorySocket";

interface RecentTradesProps {
  tokenOne:        string;
  tokenTwo:        string;
  tokenOneSymbol?: string;
  tokenTwoSymbol?: string;
  className?:      string;
  style?:          React.CSSProperties;
}

function fmtWei(wei: string, d = 4): string {
  try {
    const n = parseFloat(ethers.formatUnits(wei, 18));
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(d);
  } catch { return wei; }
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function RecentTrades({
  tokenOne,
  tokenTwo,
  tokenOneSymbol = "A",
  tokenTwoSymbol = "B",
  className,
  style,
}: RecentTradesProps) {
  const { trades, newIds, loading, wsLive } = useTradeHistory({
    tokenOne, tokenTwo, enabled: true,
  });

  return (
    <div
      className={cn("p2p-card flex flex-col", className)}
      style={style}
    >
      {/* Header */}
      <div className="p2p-card-header">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--buy-dim)", border: "1px solid var(--buy-border)" }}
          >
            <Zap className="w-3.5 h-3.5" style={{ color: "var(--buy)" }} />
          </div>
          <div>
            <p className="text-xs font-bold tracking-wide" style={{ color: "var(--text)" }}>Trades</p>
            <p
              className="text-[10px]"
              style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {tokenOneSymbol}/{tokenTwoSymbol}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* WS live status */}
          {wsLive
            ? <span className="live-dot" />
            : <span className="offline-dot" />}
          <span
            className="text-[10px]"
            style={{ color: "var(--text-ghost)" }}
          >
            {trades.length}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div
        className="grid px-3 py-2 shrink-0"
        style={{
          gridTemplateColumns: "28px 1fr 1fr 40px",
          gap: "6px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        {["", "PRICE", "AMT", "AGO"].map((h, i) => (
          <span
            key={i}
            className="text-[9px] font-bold tracking-widest uppercase"
            style={{ color: "var(--text-ghost)" }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Trades feed */}
      <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--border)" }}>
        {loading && trades.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent)" }} />
          </div>
        ) : trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <Clock className="w-4 h-4" style={{ color: "var(--text-ghost)" }} />
            </div>
            <p
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "var(--text-ghost)" }}
            >
              No trades yet
            </p>
          </div>
        ) : (
          trades.map((trade) => {
            const isBuy  = trade.orderType === "buy";
            const isNew  = newIds.has(trade.txHash);
            const filler = trade.fillerUser?.metaunityId
              ? `#${trade.fillerUser.metaunityId}`
              : shortAddr(trade.fillerAddress);

            return (
              <div
                key={trade.id}
                className={cn(
                  "grid items-center px-3 py-2.5 transition-all duration-500",
                  isNew && "anim-flash-buy",
                )}
                style={{
                  gridTemplateColumns: "28px 1fr 1fr 40px",
                  gap: "6px",
                  background: isNew ? "var(--buy-dim)" : "transparent",
                }}
                onMouseEnter={e => {
                  if (!isNew) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background = isNew ? "var(--buy-dim)" : "transparent";
                }}
              >
                {/* Type icon */}
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: isBuy ? "var(--buy-dim)" : "var(--sell-dim)",
                    border: `1px solid ${isBuy ? "var(--buy-border)" : "var(--sell-border)"}`,
                  }}
                >
                  {isBuy
                    ? <ArrowDownLeft className="w-3 h-3" style={{ color: "var(--buy)" }} />
                    : <ArrowUpRight  className="w-3 h-3" style={{ color: "var(--sell)" }} />}
                </div>

                {/* Price */}
                <div className="min-w-0">
                  <span
                    className="text-[11px] font-bold block truncate"
                    style={{ color: isBuy ? "var(--buy)" : "var(--sell)", fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {fmtWei(trade.pricePerToken)}
                  </span>
                  {filler && (
                    <span
                      className="text-[9px] truncate block"
                      style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      {filler}
                    </span>
                  )}
                </div>

                {/* Amount */}
                <span
                  className="text-[11px] truncate"
                  style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {fmtWei(trade.fillAmount, 2)}
                </span>

                {/* Time */}
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {timeAgo(trade.blockTimestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Live footer */}
      {wsLive && trades.length > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 shrink-0"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-elevated)" }}
        >
          <span className="live-dot" style={{ width: 5, height: 5 }} />
          <span
            className="text-[9px] font-medium"
            style={{ color: "var(--text-ghost)" }}
          >
            Real-time fills via WebSocket
          </span>
        </div>
      )}
    </div>
  );
}
