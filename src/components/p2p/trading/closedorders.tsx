import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { cn } from "~/lib/utils";
import { fetchClosedOrders, ClosedOrderData } from "~/lib/tradingApi";
import { CheckCircle2, XCircle, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface ClosedOrdersProps {
  tokenOne?:      string;
  tokenTwo?:      string;
  walletAddress?: string;
  className?:     string;
  style?:         React.CSSProperties;
}

function fmtWei(wei: string, d = 4): string {
  try {
    const n = parseFloat(ethers.formatUnits(wei, 18));
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(d);
  } catch { return wei; }
}

function shortAddr(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function ClosedOrders({
  tokenOne,
  tokenTwo,
  walletAddress,
  className,
  style,
}: ClosedOrdersProps) {
  const [orders,  setOrders]  = useState<ClosedOrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<"all" | "filled" | "cancelled">("all");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchClosedOrders(
        tokenOne,
        tokenTwo,
        filter === "all" ? undefined : filter,
        100
      );
      const filtered = walletAddress
        ? data.filter((o) => o.creatorAddress.toLowerCase() === walletAddress.toLowerCase())
        : data;
      setOrders(filtered);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [tokenOne, tokenTwo, filter, walletAddress]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  return (
    <div
      className={cn(
        "bg-[#0d0e11] border border-white/[0.07] rounded-xl overflow-hidden flex flex-col",
        className
      )}
      style={style}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] shrink-0">
        <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Order History</p>

        <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded p-0.5">
          {(["all", "filled", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1 text-[9px] font-bold tracking-wider uppercase rounded transition-all",
                filter === f
                  ? f === "filled"    ? "bg-emerald-500 text-black"
                  : f === "cancelled" ? "bg-rose-500 text-white"
                  :                    "bg-amber-500 text-black"
                  : "text-white/25 hover:text-white/50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[50px_60px_1fr_1fr_1fr_100px] gap-2 px-4 py-2 bg-white/[0.02] border-b border-white/[0.04]">
        {["STATUS", "TYPE", "AMOUNT", "PRICE", "FILLED BY", "CLOSED AT"].map((h) => (
          <div key={h} className="text-[8px] tracking-widest text-white/20 uppercase font-bold">{h}</div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.03]">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[10px] text-white/15 tracking-widest uppercase">
            No {filter === "all" ? "closed" : filter} orders
          </div>
        ) : (
          orders.map((order) => {
            const isBuy    = order.orderType === "buy";
            const isFilled = order.closedStatus === "filled";

            return (
              <div
                key={order.id}
                className="grid grid-cols-[50px_60px_1fr_1fr_1fr_100px] gap-2 px-4 py-2.5 items-center hover:bg-white/[0.02] transition-colors"
              >
                <div className={cn(
                  "flex items-center gap-1 text-[9px] font-bold",
                  isFilled ? "text-emerald-400" : "text-rose-400"
                )}>
                  {isFilled ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {isFilled ? "FILLED" : "CANCL"}
                </div>

                <div className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold w-fit",
                  isBuy
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                )}>
                  {isBuy ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                  {isBuy ? "BUY" : "SELL"}
                </div>

                <span className="text-[11px] font-mono text-white/60">{fmtWei(order.amount)}</span>
                <span className="text-[11px] font-mono text-amber-400/70">{fmtWei(order.pricePerToken)}</span>
                <span className="text-[10px] font-mono text-white/30">
                  {isFilled && order.filledByAddress ? shortAddr(order.filledByAddress) : "—"}
                </span>
                <span className="text-[9px] font-mono text-white/20">{fmtDate(order.closedAt)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
