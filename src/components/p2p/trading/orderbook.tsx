import { useEffect, useState, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { Account } from "thirdweb/wallets";
import { cn } from "~/lib/utils";
import {
  fetchOpenOrders, fetchClosedOrders, fetchOrderBook, fetchUserOrders,
  OrderData, ClosedOrderData, DepthLevel,
} from "~/lib/tradingApi";
import { useOrderBookSocket } from "~/hooks/useOrderbookSocket";
import {
  Loader2, X, Zap, ArrowDownLeft, ArrowUpRight,
  RefreshCw, CheckCircle2, Clock, AlertCircle, XCircle,
  BookOpen, Layers, User, Activity,
} from "lucide-react";
import { ensureAllowance } from "~/contract/erc20-approve";
import { p2pContractAddress, getSigner } from "~/contract/p2p/p2p-contract";

interface TxFeedback {
  orderId: string;
  hash:    string;
  status:  "pending" | "confirmed" | "failed";
  error?:  string;
}

interface OrderBookProps {
  tokenOne:        string;
  tokenTwo:        string;
  tokenOneSymbol?: string;
  tokenTwoSymbol?: string;
  contract:        ethers.Contract | null;
  activeAccount:   Account | null;
  className?:      string;
  style?:          React.CSSProperties;
}

type ActiveTab = "open" | "filled" | "cancelled" | "depth" | "mine";

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtWei(wei: string, decimals = 4): string {
  try {
    const n = parseFloat(ethers.formatUnits(wei, 18));
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(decimals);
  } catch { return wei; }
}

function shortHash(hash: string): string {
  if (!hash) return "";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function shortAddr(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ isBuy }: { isBuy: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold border shrink-0"
      style={{
        background: isBuy ? "var(--buy-dim)" : "var(--sell-dim)",
        color:      isBuy ? "var(--buy)"     : "var(--sell)",
        borderColor: isBuy ? "var(--buy-border)" : "var(--sell-border)",
      }}
    >
      {isBuy ? <ArrowDownLeft className="w-2 h-2" /> : <ArrowUpRight className="w-2 h-2" />}
      {isBuy ? "BUY" : "SELL"}
    </span>
  );
}

function EmptyState({ loading, label }: { loading?: boolean; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent)" }} />
      ) : (
        <>
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            <BookOpen className="w-4 h-4" style={{ color: "var(--text-ghost)" }} />
          </div>
          <p
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: "var(--text-ghost)" }}
          >
            {label}
          </p>
        </>
      )}
    </div>
  );
}

// ── Fill helpers ─────────────────────────────────────────────────────────────

const ERC20_ALLOW_ABI = ["function allowance(address,address) view returns (uint256)"];

async function approveFillTokens(signer: ethers.Signer, contract: ethers.Contract, order: OrderData) {
  await ensureAllowance(signer, order.tokenOne, p2pContractAddress);
  await ensureAllowance(signer, order.tokenTwo, p2pContractAddress);
  const hrsToken: string = await contract.HRSToken();
  if (hrsToken && hrsToken !== ethers.ZeroAddress) {
    await ensureAllowance(signer, hrsToken, p2pContractAddress);
  }
  return hrsToken;
}

async function logFillAllowances(
  signer: ethers.Signer, order: OrderData, hrsToken: string, amtWei: bigint, userAddr: string,
) {
  const provider = signer.provider!;
  const read = (t: string) =>
    new ethers.Contract(t, ERC20_ALLOW_ABI, provider)
      .allowance(userAddr, p2pContractAddress)
      .then((v: bigint) => v.toString());
  const [aOne, aTwo, aHRS] = await Promise.all([
    read(order.tokenOne), read(order.tokenTwo),
    hrsToken && hrsToken !== ethers.ZeroAddress ? read(hrsToken) : Promise.resolve("n/a"),
  ]);
  console.log("[fill] amtWei:", amtWei.toString(), "| orderId:", order.orderId);
  console.log("[fill] tokenOne:", order.tokenOne, "→", aOne);
  console.log("[fill] tokenTwo:", order.tokenTwo, "→", aTwo);
  console.log("[fill] hrsToken:", hrsToken, "→", aHRS);
}

function applyOptimisticFill(orders: OrderData[], orderId: string, amtWei: bigint): OrderData[] {
  return orders
    .map((o): OrderData => {
      if (o.id !== orderId) return o;
      const newRem = BigInt(o.remainingAmt) > amtWei ? BigInt(o.remainingAmt) - amtWei : BigInt(0);
      return { ...o, remainingAmt: newRem.toString(), status: newRem === BigInt(0) ? "filled" : "open" };
    })
    .filter((o) => o.id !== orderId || o.status === "open");
}

function fillErrorMessage(err: unknown): string {
  const anyErr  = err as Record<string, unknown>;
  const decoded = anyErr?.revert as { name?: string; args?: unknown[] } | undefined;
  const reason  = (anyErr?.reason as string) ?? (decoded?.name ?? "");
  const args    = Array.isArray(decoded?.args)
    ? decoded!.args.map((a) => (typeof a === "bigint" ? a.toString() : a))
    : undefined;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("user rejected")) return "Transaction rejected";
  if (reason.includes("ERC20InsufficientAllowance")) {
    const raw1 = Array.isArray(args) ? args[1] : undefined;
    const cur  = (typeof raw1 === "string" || typeof raw1 === "number") ? BigInt(raw1) : BigInt(0);
    if (cur < ethers.MaxUint256) return "Order creator's approval is insufficient — the creator must re-approve.";
    const spender = Array.isArray(args) && typeof args[0] === "string" ? args[0] : "";
    return `Your allowance is too low — spender: ${spender.slice(0, 10)}…`;
  }
  if (reason.includes("ERC20InsufficientBalance")) return "Insufficient token balance";
  if (msg.includes("insufficient allowance"))      return "Insufficient allowance — approve first";
  if (msg.includes("Order is not available"))      return "Order no longer available";
  return reason || msg.slice(0, 120);
}

// ── Column header helper ─────────────────────────────────────────────────────

function ColHeader({ label }: { label: string }) {
  return (
    <span
      className="text-[9px] font-bold tracking-widest uppercase"
      style={{ color: "var(--text-ghost)" }}
    >
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrderBook({
  tokenOne, tokenTwo,
  tokenOneSymbol = "A", tokenTwoSymbol = "B",
  contract, activeAccount, className, style,
}: OrderBookProps) {
  const [activeTab,  setActiveTab]  = useState<ActiveTab>("open");

  const [orders,     setOrders]     = useState<OrderData[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filling,    setFilling]    = useState<string | null>(null);
  const [approving,  setApproving]  = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [fillAmts,   setFillAmts]   = useState<Record<string, string>>({});
  const [txFeedback, setTxFeedback] = useState<TxFeedback | null>(null);

  const [closedOrders,  setClosedOrders]  = useState<ClosedOrderData[]>([]);
  const [closedLoading, setClosedLoading] = useState(false);
  const [newClosedTx,   setNewClosedTx]   = useState<Set<string>>(new Set());
  const [unreadFills,   setUnreadFills]   = useState(0);

  const [bids,         setBids]         = useState<DepthLevel[]>([]);
  const [asks,         setAsks]         = useState<DepthLevel[]>([]);
  const [bestBid,      setBestBid]      = useState<string | null>(null);
  const [bestAsk,      setBestAsk]      = useState<string | null>(null);
  const [depthLoading, setDepthLoading] = useState(false);

  const [myOrders,        setMyOrders]        = useState<OrderData[]>([]);
  const [myCounts,        setMyCounts]        = useState({ open: 0, filled: 0, cancelled: 0 });
  const [myOrdersLoading, setMyOrdersLoading] = useState(false);

  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const { updates, snapshot, status: wsStatus } = useOrderBookSocket({ enabled: true });
  const wsLive = wsStatus === "connected";

  // ── Load functions ──────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOpenOrders(tokenOne, tokenTwo);
      setOrders(data);
    } catch { } finally { setLoading(false); }
  }, [tokenOne, tokenTwo]);

  const loadClosedOrders = useCallback(async (s?: "filled" | "cancelled") => {
    setClosedLoading(true);
    try {
      const data = await fetchClosedOrders(tokenOne, tokenTwo, s, 100);
      setClosedOrders(data);
    } catch { } finally { setClosedLoading(false); }
  }, [tokenOne, tokenTwo]);

  const loadDepth = useCallback(async () => {
    setDepthLoading(true);
    try {
      const data = await fetchOrderBook(tokenOne, tokenTwo, 20);
      if (data) { setBids(data.bids); setAsks(data.asks); setBestBid(data.bestBid); setBestAsk(data.bestAsk); }
    } catch { } finally { setDepthLoading(false); }
  }, [tokenOne, tokenTwo]);

  const loadMyOrders = useCallback(async () => {
    if (!activeAccount?.address) return;
    setMyOrdersLoading(true);
    try {
      const data = await fetchUserOrders(activeAccount.address);
      if (data) { setMyOrders(data.orders); setMyCounts(data.counts); }
    } catch { } finally { setMyOrdersLoading(false); }
  }, [activeAccount?.address]);

  // ── Initial + tab-switch loads ──────────────────────────────────────────────

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    if (activeTab === "filled")    { loadClosedOrders("filled"); setUnreadFills(0); }
    if (activeTab === "cancelled") loadClosedOrders("cancelled");
    if (activeTab === "depth")     loadDepth();
    if (activeTab === "mine")      loadMyOrders();
  }, [activeTab, loadClosedOrders, loadDepth, loadMyOrders]);

  // ── WebSocket-driven real-time updates ──────────────────────────────────────

  useEffect(() => {
    if (updates.length === 0) return;
    const latest = updates[0];

    loadOrders();

    if (latest.type === "ORDER_FILLED") {
      if (activeTab === "filled") {
        setTimeout(() => {
          loadClosedOrders("filled");
          setNewClosedTx((prev) => new Set([...prev, latest.txHash]));
          const t = setTimeout(() => {
            setNewClosedTx((prev) => { const n = new Set(prev); n.delete(latest.txHash); return n; });
          }, 5000);
          flashTimers.current.set(latest.txHash, t);
        }, 1500);
      } else {
        setUnreadFills((prev) => prev + 1);
      }
    }

    if (latest.type === "ORDER_CANCELLED" && activeTab === "cancelled") {
      setTimeout(() => loadClosedOrders("cancelled"), 1500);
    }

    if (activeTab === "depth") loadDepth();
    if (activeTab === "mine")  loadMyOrders();
  }, [updates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!snapshot) return;
    loadOrders();
    if (activeTab === "depth") loadDepth();
  }, [snapshot, loadOrders, loadDepth, activeTab]);

  useEffect(() => {
    if (!txFeedback || txFeedback.status === "pending") return;
    const t = setTimeout(() => setTxFeedback(null), 8000);
    return () => clearTimeout(t);
  }, [txFeedback]);

  // Cleanup flash timers on unmount
  useEffect(() => () => {
    flashTimers.current.forEach(clearTimeout);
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleFill(order: OrderData) {
    if (!contract || !activeAccount) return;
    const amt = fillAmts[order.id];
    if (!amt || isNaN(parseFloat(amt)) || parseFloat(amt) <= 0) return;

    setFilling(order.id);
    setTxFeedback(null);
    try {
      const amtWei   = ethers.parseUnits(amt, 18);
      setApproving(order.id);
      const signer   = await getSigner(activeAccount);
      const hrsToken = await approveFillTokens(signer, contract, order);
      setApproving(null);
      await logFillAllowances(signer, order, hrsToken, amtWei, activeAccount.address);
      setOrders((prev) => applyOptimisticFill(prev, order.id, amtWei));
      await contract.fillorder.staticCall(order.tokenOne, order.tokenTwo, amtWei, order.orderId, { from: activeAccount.address });
      const tx = await contract.fillorder(order.tokenOne, order.tokenTwo, amtWei, order.orderId);
      setTxFeedback({ orderId: order.id, hash: tx.hash, status: "pending" });
      await tx.wait();
      setTxFeedback({ orderId: order.id, hash: tx.hash, status: "confirmed" });
      setFillAmts((prev) => { const n = { ...prev }; delete n[order.id]; return n; });
      setTimeout(() => { loadOrders(); loadClosedOrders("filled"); }, 3000);
    } catch (err: unknown) {
      setTxFeedback({ orderId: order.id, hash: "", status: "failed", error: fillErrorMessage(err) });
      await loadOrders();
    } finally {
      setApproving(null);
      setFilling(null);
    }
  }

  async function handleCancel(order: OrderData) {
    if (!contract || !activeAccount) return;
    setCancelling(order.id);
    setTxFeedback(null);
    try {
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      const tx = await contract.cancelOrder(order.tokenOne, order.tokenTwo, order.orderId);
      setTxFeedback({ orderId: order.id, hash: tx.hash, status: "pending" });
      await tx.wait();
      setTxFeedback({ orderId: order.id, hash: tx.hash, status: "confirmed" });
      setTimeout(() => { loadOrders(); loadClosedOrders("cancelled"); }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxFeedback({ orderId: order.id, hash: "", status: "failed", error: msg.includes("user rejected") ? "Rejected" : msg.slice(0, 80) });
      await loadOrders();
    } finally {
      setCancelling(null);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const isMyOrder = (order: OrderData) =>
    activeAccount?.address?.toLowerCase() === order.creator?.toLowerCase();

  function currentLoading() {
    if (activeTab === "open")      return loading;
    if (activeTab === "filled" || activeTab === "cancelled") return closedLoading;
    if (activeTab === "depth")     return depthLoading;
    if (activeTab === "mine")      return myOrdersLoading;
    return false;
  }

  function handleRefresh() {
    if (activeTab === "open")           loadOrders();
    else if (activeTab === "filled")    { loadClosedOrders("filled"); setUnreadFills(0); }
    else if (activeTab === "cancelled") loadClosedOrders("cancelled");
    else if (activeTab === "depth")     loadDepth();
    else if (activeTab === "mine")      loadMyOrders();
  }

  const maxBidAmt = bids.reduce((m, b) => Math.max(m, parseFloat(b.totalAmt) || 0), 0);
  const maxAskAmt = asks.reduce((m, a) => Math.max(m, parseFloat(a.totalAmt) || 0), 0);

  // ── Tab config ──────────────────────────────────────────────────────────────

  const tabs: { id: ActiveTab; label: string; icon: React.ElementType; badge?: number; count?: number }[] = [
    { id: "open",      label: "Open",      icon: BookOpen, count: orders.length },
    { id: "filled",    label: "Filled",    icon: CheckCircle2, badge: unreadFills || undefined },
    { id: "cancelled", label: "Cancelled", icon: XCircle },
    { id: "depth",     label: "Depth",     icon: Layers },
    { id: "mine",      label: "Mine",      icon: User, count: myCounts.open },
  ];

  const tabColors: Record<ActiveTab, { color: string; bg: string; border: string }> = {
    open:      { color: "var(--accent)",  bg: "var(--accent-dim)",  border: "var(--accent-glow)" },
    filled:    { color: "var(--buy)",     bg: "var(--buy-dim)",     border: "var(--buy-border)" },
    cancelled: { color: "var(--sell)",    bg: "var(--sell-dim)",    border: "var(--sell-border)" },
    depth:     { color: "var(--sky)",     bg: "var(--sky-dim)",     border: "var(--sky)" },
    mine:      { color: "var(--violet)",  bg: "var(--violet-dim)",  border: "var(--violet)" },
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={cn("p2p-card flex flex-col", className)} style={style}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="p2p-card-header">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-glow)" }}
          >
            <Activity className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <p className="text-xs font-bold tracking-wide" style={{ color: "var(--text)" }}>Order Book</p>
            <p
              className="text-[10px]"
              style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {tokenOneSymbol}/{tokenTwoSymbol}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* WS status */}
          <div className="flex items-center gap-1.5">
            {wsStatus === "connected"    && <span className="live-dot" />}
            {wsStatus === "connecting"   && <span className="connecting-dot" />}
            {wsStatus === "disconnected" && <span className="offline-dot" />}
            {wsStatus === "error"        && <span className="offline-dot" style={{ background: "var(--sell)" }} />}
            <span
              className="text-[9px] font-bold tracking-wider uppercase hidden sm:block"
              style={{ color: wsLive ? "var(--buy)" : "var(--text-ghost)" }}
            >
              {wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "…" : "Offline"}
            </span>
          </div>

          <button
            onClick={handleRefresh}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ color: "var(--text-muted)" }}
            title="Refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", currentLoading() && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-2 py-2 overflow-x-auto shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const tc = tabColors[tab.id];
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="p2p-tab"
              style={isActive ? {
                background: tc.bg,
                color: tc.color,
                borderColor: tc.border,
              } : {}}
            >
              <TabIcon className="w-3 h-3" />
              {tab.label}
              {(tab.count !== undefined && tab.count > 0) && (
                <span
                  className="text-[8px] font-bold px-1 py-0.5 rounded-full"
                  style={{
                    background: isActive ? tc.color : "var(--bg-elevated)",
                    color: isActive ? (tab.id === "open" ? "#000" : "#fff") : "var(--text-muted)",
                  }}
                >
                  {tab.count}
                </span>
              )}
              {(tab.badge !== undefined && tab.badge > 0) && (
                <span
                  className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full text-[7px] font-bold flex items-center justify-center leading-none"
                  style={{ background: "var(--buy)", color: "#fff" }}
                >
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── TX Feedback banner ───────────────────────────────────────────────── */}
      {txFeedback && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium shrink-0 anim-fade-up"
          style={{
            background: txFeedback.status === "pending" ? "var(--accent-dim)" : txFeedback.status === "confirmed" ? "var(--buy-dim)" : "var(--sell-dim)",
            borderBottom: `1px solid ${txFeedback.status === "pending" ? "var(--accent-glow)" : txFeedback.status === "confirmed" ? "var(--buy-border)" : "var(--sell-border)"}`,
            color: txFeedback.status === "pending" ? "var(--accent)" : txFeedback.status === "confirmed" ? "var(--buy)" : "var(--sell)",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {txFeedback.status === "pending"   && <Clock        className="w-3.5 h-3.5 shrink-0 anim-pulse-glow" />}
          {txFeedback.status === "confirmed" && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          {txFeedback.status === "failed"    && <AlertCircle  className="w-3.5 h-3.5 shrink-0" />}
          <span className="flex-1 truncate text-[10px]">
            {txFeedback.status === "pending"   && `Pending · ${shortHash(txFeedback.hash)}`}
            {txFeedback.status === "confirmed" && `Confirmed · ${shortHash(txFeedback.hash)}`}
            {txFeedback.status === "failed"    && (txFeedback.error || "Transaction failed")}
          </span>
          <button
            onClick={() => setTxFeedback(null)}
            className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          OPEN ORDERS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "open" && (
        <>
          {/* Column headers — desktop */}
          <div
            className="hidden sm:grid px-4 py-2 shrink-0"
            style={{
              gridTemplateColumns: "56px 1fr 1fr 1fr 80px 44px",
              gap: "8px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-elevated)",
            }}
          >
            {["TYPE", "PRICE", "AMOUNT", "REMAIN", "FILL QTY", ""].map((h, i) => (
              <ColHeader key={i} label={h} />
            ))}
          </div>

          <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--border)" }}>
            {loading && orders.length === 0 ? (
              <EmptyState loading />
            ) : orders.length === 0 ? (
              <EmptyState label="No open orders" />
            ) : (
              orders.map((order) => {
                const isBuy     = order.orderType === "buy";
                const isOwn     = isMyOrder(order);
                const isPending = txFeedback?.orderId === order.id && txFeedback.status === "pending";
                const remainPct = order.amount !== "0"
                  ? Math.max(0, Math.round((parseFloat(order.remainingAmt) / parseFloat(order.amount)) * 100))
                  : 0;

                return (
                  <div
                    key={order.id}
                    className="relative transition-all duration-200"
                    style={{
                      background: isPending ? "var(--accent-dim)" : isOwn ? "var(--bg-hover)" : "transparent",
                    }}
                    onMouseEnter={e => {
                      if (!isPending) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background =
                        isPending ? "var(--accent-dim)" : isOwn ? "var(--bg-hover)" : "transparent";
                    }}
                  >
                    {/* Left accent bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[2px] rounded-r"
                      style={{ background: isBuy ? "var(--buy)" : "var(--sell)", opacity: 0.5 }}
                    />

                    {/* Mobile row */}
                    <div className="sm:hidden px-3 pl-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <TypeBadge isBuy={isBuy} />
                          <span
                            className="text-sm font-bold font-mono truncate"
                            style={{ color: isBuy ? "var(--buy)" : "var(--sell)", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {fmtWei(order.pricePerToken)}
                          </span>
                          {isOwn && (
                            <span
                              className="text-[8px] font-bold px-1.5 py-0.5 rounded-md border shrink-0"
                              style={{
                                color: "var(--accent-text)",
                                background: "var(--accent-dim)",
                                borderColor: "var(--accent-glow)",
                              }}
                            >
                              MINE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isOwn && (
                            <input
                              className="p2p-input w-16 text-xs"
                              style={{ padding: "6px 8px" }}
                              placeholder="qty"
                              type="number"
                              min="0"
                              step="any"
                              value={fillAmts[order.id] || ""}
                              onChange={(e) => setFillAmts((p) => ({ ...p, [order.id]: e.target.value }))}
                            />
                          )}
                          {isOwn ? (
                            <ActionBtn
                              type="cancel"
                              busy={cancelling === order.id}
                              disabled={!!cancelling}
                              onClick={() => handleCancel(order)}
                            />
                          ) : (
                            <ActionBtn
                              type="fill"
                              busy={approving === order.id || filling === order.id}
                              disabled={!!filling || !!approving || !fillAmts[order.id]}
                              hasQty={!!fillAmts[order.id]}
                              onClick={() => handleFill(order)}
                            />
                          )}
                        </div>
                      </div>
                      <ProgressRow
                        remain={order.remainingAmt}
                        amount={order.amount}
                        pct={remainPct}
                        isBuy={isBuy}
                      />
                    </div>

                    {/* Desktop row */}
                    <div
                      className="hidden sm:grid px-4 pl-5 py-2.5 items-center"
                      style={{ gridTemplateColumns: "56px 1fr 1fr 1fr 80px 44px", gap: "8px" }}
                    >
                      <TypeBadge isBuy={isBuy} />

                      <span
                        className="text-[12px] font-bold truncate"
                        style={{ color: isBuy ? "var(--buy)" : "var(--sell)", fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {fmtWei(order.pricePerToken)}
                      </span>

                      <span
                        className="text-[11px] truncate"
                        style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {fmtWei(order.amount)}
                      </span>

                      <div className="space-y-1 min-w-0">
                        <span
                          className="text-[11px] block truncate"
                          style={{ color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {fmtWei(order.remainingAmt)}
                        </span>
                        <div
                          className="h-[3px] rounded-full overflow-hidden"
                          style={{ background: "var(--bg-elevated)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${remainPct}%`,
                              background: isBuy ? "var(--buy)" : "var(--sell)",
                              opacity: 0.55,
                            }}
                          />
                        </div>
                      </div>

                      <input
                        className="p2p-input text-[10px]"
                        style={{ padding: "6px 8px" }}
                        placeholder="qty"
                        type="number"
                        min="0"
                        step="any"
                        value={fillAmts[order.id] || ""}
                        onChange={(e) => setFillAmts((p) => ({ ...p, [order.id]: e.target.value }))}
                        disabled={isOwn}
                      />

                      {isOwn ? (
                        <ActionBtn
                          type="cancel"
                          busy={cancelling === order.id}
                          disabled={!!cancelling}
                          onClick={() => handleCancel(order)}
                        />
                      ) : (
                        <ActionBtn
                          type="fill"
                          busy={approving === order.id || filling === order.id}
                          disabled={!!filling || !!approving || !fillAmts[order.id]}
                          hasQty={!!fillAmts[order.id]}
                          onClick={() => handleFill(order)}
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Live ticker */}
          {updates.length > 0 && wsLive && (
            <div
              className="flex items-center gap-2 px-4 py-2 shrink-0"
              style={{ borderTop: "1px solid var(--border)", background: "var(--bg-elevated)" }}
            >
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              <span
                className="text-[10px] truncate"
                style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {updates[0].type === "ORDER_CREATED"   && `New ${(updates[0].data as Record<string, string>).orderType || ""} order #${updates[0].orderId}`}
                {updates[0].type === "ORDER_FILLED"    && `Order #${updates[0].orderId} filled`}
                {updates[0].type === "ORDER_CANCELLED" && `Order #${updates[0].orderId} cancelled`}
              </span>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          FILLED / CANCELLED TABS
      ══════════════════════════════════════════════════════════════════════ */}
      {(activeTab === "filled" || activeTab === "cancelled") && (
        <>
          {activeTab === "filled" && (
            <div
              className="flex items-center justify-between px-4 py-2 shrink-0"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}
            >
              <div className="flex items-center gap-1.5">
                {wsLive ? <span className="live-dot" style={{ width: 6, height: 6 }} /> : <span className="offline-dot" style={{ width: 6, height: 6 }} />}
                <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                  {wsLive ? "Real-time via WebSocket" : "Reconnecting…"}
                </span>
              </div>
              <span className="text-[10px]" style={{ color: "var(--text-ghost)" }}>
                {closedOrders.length} records
              </span>
            </div>
          )}

          <div
            className="hidden sm:grid px-4 py-2 shrink-0"
            style={{
              gridTemplateColumns: "40px 56px 1fr 1fr 1fr 76px",
              gap: "8px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-elevated)",
            }}
          >
            {["ST", "TYPE", "AMT", "PRICE", activeTab === "filled" ? "FILLED BY" : "CREATOR", "WHEN"].map((h, i) => (
              <ColHeader key={i} label={h} />
            ))}
          </div>

          <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--border)" }}>
            {closedLoading && closedOrders.length === 0 ? (
              <EmptyState loading />
            ) : closedOrders.length === 0 ? (
              <EmptyState label={`No ${activeTab} orders`} />
            ) : (
              closedOrders.map((order) => {
                const isBuy    = order.orderType === "buy";
                const isFilled = order.closedStatus === "filled";
                const byAddr   = isFilled ? order.filledByAddress : order.creatorAddress;
                const isNew    = newClosedTx.has(order.closedTxHash);

                return (
                  <div
                    key={order.id}
                    className={cn("relative transition-all duration-500", isNew && "anim-flash-buy")}
                    style={{ background: isNew ? "var(--buy-dim)" : "transparent" }}
                  >
                    {isNew && (
                      <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: "var(--buy)" }} />
                    )}

                    {/* Mobile row */}
                    <div className="sm:hidden px-4 py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isFilled
                            ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--buy)" }} />
                            : <XCircle      className="w-3.5 h-3.5" style={{ color: "var(--sell)" }} />}
                          <TypeBadge isBuy={isBuy} />
                          <span
                            className="text-[12px] font-bold"
                            style={{ color: isBuy ? "var(--buy)" : "var(--sell)", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {fmtWei(order.pricePerToken)}
                          </span>
                        </div>
                        <span className="text-[10px]" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {timeAgo(order.closedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {fmtWei(order.amount)}
                        </span>
                        {byAddr && (
                          <span className="text-[10px]" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {shortAddr(byAddr)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Desktop row */}
                    <div
                      className="hidden sm:grid px-4 py-2.5 items-center"
                      style={{ gridTemplateColumns: "40px 56px 1fr 1fr 1fr 76px", gap: "8px" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isNew ? "var(--buy-dim)" : "transparent"; }}
                    >
                      {isFilled
                        ? <CheckCircle2 className="w-4 h-4" style={{ color: "var(--buy)" }} />
                        : <XCircle      className="w-4 h-4" style={{ color: "var(--sell)" }} />}

                      <TypeBadge isBuy={isBuy} />

                      <span className="text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {fmtWei(order.amount)}
                      </span>

                      <span
                        className="text-[11px] font-bold"
                        style={{ color: isBuy ? "var(--buy)" : "var(--sell)", fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {fmtWei(order.pricePerToken)}
                      </span>

                      <span className="text-[10px] truncate" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {byAddr ? shortAddr(byAddr) : "—"}
                      </span>

                      <span className="text-[10px]" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {timeAgo(order.closedAt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          DEPTH TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "depth" && (
        <>
          {(bestBid || bestAsk) && (
            <div
              className="flex items-center justify-center gap-4 sm:gap-8 px-4 py-3 shrink-0 flex-wrap gap-y-1"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}
            >
              {[
                { label: "Best Bid", value: bestBid ? fmtWei(bestBid) : "—", color: "var(--buy)" },
                { label: "Best Ask", value: bestAsk ? fmtWei(bestAsk) : "—", color: "var(--sell)" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span className="text-sm font-bold" style={{ color, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {value}
                  </span>
                </div>
              ))}
              {bestBid && bestAsk && (() => {
                try {
                  const spread = BigInt(bestAsk) - BigInt(bestBid);
                  if (spread >= 0n) return (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Spread</span>
                      <span className="text-sm font-bold" style={{ color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {fmtWei(spread.toString())}
                      </span>
                    </div>
                  );
                } catch { return null; }
              })()}
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {depthLoading ? (
              <EmptyState loading />
            ) : bids.length === 0 && asks.length === 0 ? (
              <EmptyState label="No depth data" />
            ) : (
              <div className="grid grid-cols-2 h-full" style={{ borderTop: "none" }}>
                {/* Bids */}
                <div className="flex flex-col border-r" style={{ borderColor: "var(--border)" }}>
                  <div
                    className="grid grid-cols-3 px-3 py-2 shrink-0 sticky top-0 z-10"
                    style={{ background: "var(--buy-dim)", borderBottom: "1px solid var(--border)" }}
                  >
                    {["PRICE", "SIZE", "CT"].map((h) => (
                      <span key={h} className="text-[9px] font-bold tracking-wider uppercase" style={{ color: "var(--buy)", opacity: 0.6 }}>
                        {h}
                      </span>
                    ))}
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {bids.map((level, i) => {
                      const pct = maxBidAmt > 0 ? (parseFloat(level.totalAmt) / maxBidAmt) * 100 : 0;
                      return (
                        <div
                          key={i}
                          className="depth-row"
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--buy-dim)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                        >
                          <div
                            className="depth-bar right-0"
                            style={{ width: `${pct}%`, background: "rgba(16,185,129,0.07)", left: "auto" }}
                          />
                          <span className="relative text-[10px] font-bold" style={{ color: "var(--buy)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {fmtWei(level.pricePerToken)}
                          </span>
                          <span className="relative text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {fmtWei(level.totalAmt, 2)}
                          </span>
                          <span className="relative text-[10px]" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {level.orderCount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Asks */}
                <div className="flex flex-col">
                  <div
                    className="grid grid-cols-3 px-3 py-2 shrink-0 sticky top-0 z-10"
                    style={{ background: "var(--sell-dim)", borderBottom: "1px solid var(--border)" }}
                  >
                    {["PRICE", "SIZE", "CT"].map((h) => (
                      <span key={h} className="text-[9px] font-bold tracking-wider uppercase" style={{ color: "var(--sell)", opacity: 0.6 }}>
                        {h}
                      </span>
                    ))}
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {asks.map((level, i) => {
                      const pct = maxAskAmt > 0 ? (parseFloat(level.totalAmt) / maxAskAmt) * 100 : 0;
                      return (
                        <div
                          key={i}
                          className="depth-row"
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--sell-dim)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                        >
                          <div
                            className="depth-bar left-0"
                            style={{ width: `${pct}%`, background: "rgba(244,63,94,0.07)", right: "auto" }}
                          />
                          <span className="relative text-[10px] font-bold" style={{ color: "var(--sell)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {fmtWei(level.pricePerToken)}
                          </span>
                          <span className="relative text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {fmtWei(level.totalAmt, 2)}
                          </span>
                          <span className="relative text-[10px]" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {level.orderCount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MY ORDERS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "mine" && (
        <>
          <div
            className="flex items-center gap-4 sm:gap-6 px-4 py-2.5 shrink-0"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}
          >
            {[
              { label: "Open",      count: myCounts.open,      color: "var(--accent)" },
              { label: "Filled",    count: myCounts.filled,    color: "var(--buy)" },
              { label: "Cancelled", count: myCounts.cancelled, color: "var(--sell)" },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>{label}</span>
                <span className="text-sm font-bold" style={{ color, fontFamily: "'IBM Plex Mono', monospace" }}>{count}</span>
              </div>
            ))}
          </div>

          <div
            className="hidden sm:grid px-4 py-2 shrink-0"
            style={{
              gridTemplateColumns: "56px 1fr 1fr 90px 72px",
              gap: "8px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-elevated)",
            }}
          >
            {["TYPE", "PRICE", "REMAIN", "STATUS", "AGO"].map((h, i) => (
              <ColHeader key={i} label={h} />
            ))}
          </div>

          <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--border)" }}>
            {myOrdersLoading ? (
              <EmptyState loading />
            ) : !activeAccount?.address ? (
              <EmptyState label="Wallet not connected" />
            ) : myOrders.length === 0 ? (
              <EmptyState label="No orders yet" />
            ) : (
              myOrders.map((order) => {
                const isBuy  = order.orderType === "buy";
                const isOpen = order.status === "open";
                const statusColor =
                  order.status === "open"     ? "var(--accent)"
                  : order.status === "filled" ? "var(--buy)"
                  :                             "var(--sell)";

                return (
                  <div
                    key={order.id}
                    className="relative transition-all"
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[2px] rounded-r"
                      style={{ background: isBuy ? "var(--buy)" : "var(--sell)", opacity: 0.4 }}
                    />

                    {/* Mobile row */}
                    <div className="sm:hidden px-4 pl-5 py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <TypeBadge isBuy={isBuy} />
                          <span
                            className="text-[12px] font-bold"
                            style={{ color: isBuy ? "var(--buy)" : "var(--sell)", fontFamily: "'IBM Plex Mono', monospace" }}
                          >
                            {fmtWei(order.pricePerToken)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase" style={{ color: statusColor }}>
                            {order.status}
                          </span>
                          {isOpen && (
                            <ActionBtn
                              type="cancel"
                              busy={cancelling === order.id}
                              disabled={!!cancelling}
                              onClick={() => handleCancel(order)}
                              small
                            />
                          )}
                        </div>
                      </div>
                      <span className="text-[10px]" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        Rem: {fmtWei(order.remainingAmt)} · {timeAgo(order.blockTimestamp)}
                      </span>
                    </div>

                    {/* Desktop row */}
                    <div
                      className="hidden sm:grid px-4 pl-5 py-2.5 items-center"
                      style={{ gridTemplateColumns: "56px 1fr 1fr 90px 72px", gap: "8px" }}
                    >
                      <TypeBadge isBuy={isBuy} />

                      <span
                        className="text-[11px] font-bold truncate"
                        style={{ color: isBuy ? "var(--buy)" : "var(--sell)", fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {fmtWei(order.pricePerToken)}
                      </span>

                      <span className="text-[11px] truncate" style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {fmtWei(order.remainingAmt)}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase" style={{ color: statusColor }}>
                          {order.status}
                        </span>
                        {isOpen && (
                          <ActionBtn
                            type="cancel"
                            busy={cancelling === order.id}
                            disabled={!!cancelling}
                            onClick={() => handleCancel(order)}
                            small
                          />
                        )}
                      </div>

                      <span className="text-[10px]" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {timeAgo(order.blockTimestamp)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared action button ──────────────────────────────────────────────────────

function ActionBtn({
  type,
  busy,
  disabled,
  hasQty,
  onClick,
  small,
}: {
  type:      "fill" | "cancel";
  busy:      boolean;
  disabled:  boolean;
  hasQty?:   boolean;
  onClick:   () => void;
  small?:    boolean;
}) {
  const size = small ? "w-6 h-6" : "w-7 h-7";
  if (type === "cancel") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn("rounded-lg border flex items-center justify-center shrink-0 transition-all", size)}
        style={busy || disabled ? {
          background: "var(--bg-elevated)",
          borderColor: "var(--border)",
          color: "var(--text-ghost)",
          cursor: busy ? "wait" : "not-allowed",
        } : {
          background: "var(--sell-dim)",
          borderColor: "var(--sell-border)",
          color: "var(--sell)",
        }}
        title="Cancel order"
      >
        {busy ? <Loader2 className={cn("animate-spin", small ? "w-2.5 h-2.5" : "w-3 h-3")} /> : <X className={cn(small ? "w-2.5 h-2.5" : "w-3 h-3")} />}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={busy ? "Processing…" : !hasQty ? "Enter quantity first" : "Fill order"}
      className={cn("rounded-lg border flex items-center justify-center shrink-0 transition-all", size)}
      style={busy ? {
        background: "var(--bg-elevated)",
        borderColor: "var(--border)",
        color: "var(--text-ghost)",
        cursor: "wait",
      } : hasQty ? {
        background: "var(--accent-dim)",
        borderColor: "var(--accent-glow)",
        color: "var(--accent)",
      } : {
        background: "var(--bg-elevated)",
        borderColor: "var(--border)",
        color: "var(--text-ghost)",
        cursor: "not-allowed",
      }}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
    </button>
  );
}

// ── Progress row ─────────────────────────────────────────────────────────────

function ProgressRow({
  remain, amount, pct, isBuy,
}: {
  remain: string; amount: string; pct: number; isBuy: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] shrink-0" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
        {fmtWei(remain)} / {fmtWei(amount)}
      </span>
      <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: isBuy ? "var(--buy)" : "var(--sell)", opacity: 0.55 }}
        />
      </div>
      <span className="text-[9px] shrink-0" style={{ color: "var(--text-ghost)", fontFamily: "'IBM Plex Mono', monospace" }}>
        {pct}%
      </span>
    </div>
  );
}
