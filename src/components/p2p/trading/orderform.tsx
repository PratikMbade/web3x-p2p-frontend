import { useState } from "react";
import { ethers } from "ethers";
import { Account } from "thirdweb/wallets";
import { cn } from "~/lib/utils";
import {
  Loader2, AlertCircle, TrendingUp, TrendingDown,
  Zap, CheckCircle2, Wallet, ArrowRight,
} from "lucide-react";
import { ensureAllowance } from "~/contract/erc20-approve";
import { p2pContractAddress, getSigner } from "~/contract/p2p/p2p-contract";

interface OrderFormProps {
  tokenOne:        string;
  tokenTwo:        string;
  tokenOneSymbol?: string;
  tokenTwoSymbol?: string;
  contract:        ethers.Contract | null;
  activeAccount:   Account | null;
  onSuccess?:      () => void;
}

type Side = "buy" | "sell";

export default function OrderForm({
  tokenOne,
  tokenTwo,
  tokenOneSymbol = "TOKEN A",
  tokenTwoSymbol = "TOKEN B",
  contract,
  activeAccount,
  onSuccess,
}: OrderFormProps) {
  const [side,          setSide]          = useState<Side>("buy");
  const [amount,        setAmount]        = useState("");
  const [pricePerToken, setPricePerToken] = useState("");
  const [loading,       setLoading]       = useState(false);
  const [approving,     setApproving]     = useState(false);
  const [error,         setError]         = useState("");
  const [txHash,        setTxHash]        = useState("");

  const total = amount && pricePerToken
    ? (parseFloat(amount) * parseFloat(pricePerToken)).toFixed(6)
    : null;

  function resetForm() {
    setError("");
    setTxHash("");
    setAmount("");
    setPricePerToken("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setTxHash("");

    if (!contract)      return setError("Contract not connected");
    if (!activeAccount) return setError("Wallet not connected");
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)
      return setError("Enter a valid amount");
    if (!pricePerToken || isNaN(parseFloat(pricePerToken)) || parseFloat(pricePerToken) <= 0)
      return setError("Enter a valid price");

    try {
      setLoading(true);
      const amtWei    = ethers.parseUnits(amount, 18);
      const priceWei  = ethers.parseUnits(pricePerToken, 18);
      const orderType = side === "buy" ? 1 : 2;

      const signer = await getSigner(activeAccount);
      setApproving(true);
      const tokenToApprove = side === "buy" ? tokenTwo : tokenOne;
      await ensureAllowance(signer, tokenToApprove, p2pContractAddress);
      setApproving(false);

      const tx = await contract.createOrder(tokenOne, tokenTwo, amtWei, priceWei, orderType);
      setTxHash(tx.hash);
      await tx.wait();

      setAmount("");
      setPricePerToken("");
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const clean = msg.includes("user rejected")  ? "Transaction rejected by user"
        : msg.includes("insufficient")             ? "Insufficient balance or allowance"
        : msg.includes("fb8f41b2")                 ? "Token approval needed — approve then retry"
        : msg.slice(0, 120);
      setError(clean);
    } finally {
      setApproving(false);
      setLoading(false);
    }
  }

  const isBuy = side === "buy";
  const sideColor  = isBuy ? "var(--buy)"       : "var(--sell)";
  const sideDim    = isBuy ? "var(--buy-dim)"   : "var(--sell-dim)";
  const sideBorder = isBuy ? "var(--buy-border)" : "var(--sell-border)";

  return (
    <div className="p2p-card h-full flex flex-col" style={{ minHeight: 0 }}>
      {/* Buy / Sell toggle */}
      <div className="grid grid-cols-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        {(["buy", "sell"] as Side[]).map((s) => {
          const active = side === s;
          const color  = s === "buy" ? "var(--buy)" : "var(--sell)";
          const dim    = s === "buy" ? "var(--buy-dim)" : "var(--sell-dim)";
          return (
            <button
              key={s}
              onClick={() => { setSide(s); resetForm(); }}
              className="flex items-center justify-center gap-2 py-4 transition-all"
              style={{
                background: active ? dim : "transparent",
                color: active ? color : "var(--text-muted)",
                borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
              }}
            >
              {s === "buy"  && <TrendingUp  className="w-4 h-4" />}
              {s === "sell" && <TrendingDown className="w-4 h-4" />}
              <span className="text-sm font-bold tracking-widest uppercase">{s}</span>
            </button>
          );
        })}
      </div>

      {/* ── ORDER FORM ──────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">

        {/* Scrollable inputs area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* Pair + order type badge */}
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-bold tracking-wider uppercase"
              style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {tokenOneSymbol} / {tokenTwoSymbol}
            </span>
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: sideDim, color: sideColor, border: `1px solid ${sideBorder}` }}
            >
              {isBuy ? "BUY ORDER" : "SELL ORDER"}
            </span>
          </div>

          {/* Amount input */}
          <div className="space-y-2">
            <label
              className="text-[11px] font-bold uppercase tracking-wider block"
              style={{ color: "var(--text-muted)" }}
            >
              Amount
              <span className="ml-1.5 font-normal" style={{ color: "var(--text-ghost)" }}>
                ({tokenOneSymbol})
              </span>
            </label>
            <div className="relative">
              <input
                className="p2p-input pr-16"
                placeholder="0.000000"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold select-none"
                style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {tokenOneSymbol}
              </span>
            </div>
          </div>

          {/* Price input */}
          <div className="space-y-2">
            <label
              className="text-[11px] font-bold uppercase tracking-wider block"
              style={{ color: "var(--text-muted)" }}
            >
              Price Per Token
              <span className="ml-1.5 font-normal" style={{ color: "var(--text-ghost)" }}>
                ({tokenTwoSymbol})
              </span>
            </label>
            <div className="relative">
              <input
                className="p2p-input pr-16"
                placeholder="0.000000"
                type="number"
                min="0"
                step="any"
                value={pricePerToken}
                onChange={(e) => setPricePerToken(e.target.value)}
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold select-none"
                style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {tokenTwoSymbol}
              </span>
            </div>
          </div>

          {/* Total summary */}
          <div
            className="rounded-xl px-4 py-3.5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)" }}
              >
                Estimated Total
              </span>
              {total && (
                <div className="flex items-center gap-1" style={{ color: "var(--text-ghost)" }}>
                  <span className="text-[10px]">{tokenOneSymbol}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                  <span className="text-[10px]">{tokenTwoSymbol}</span>
                </div>
              )}
            </div>
            <div className="flex items-end gap-2">
              <span
                className="text-2xl font-bold leading-none"
                style={{
                  color: total ? sideColor : "var(--text-ghost)",
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {total ?? "—"}
              </span>
              <span
                className="text-sm font-bold mb-0.5"
                style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {tokenTwoSymbol}
              </span>
            </div>
          </div>

          {/* Wallet not connected */}
          {!activeAccount && (
            <div
              className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-xs font-semibold"
              style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-glow)", color: "var(--accent-text)" }}
            >
              <Wallet className="w-4 h-4 shrink-0" />
              Connect your wallet to place orders
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2.5 px-3 py-3 rounded-xl text-xs font-medium anim-fade-up"
              style={{ background: "var(--sell-dim)", border: "1px solid var(--sell-border)", color: "var(--sell)" }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", lineHeight: "1.5" }}>{error}</span>
            </div>
          )}

          {/* Success tx */}
          {txHash && (
            <div
              className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-xs font-medium anim-fade-up"
              style={{ background: "var(--buy-dim)", border: "1px solid var(--buy-border)", color: "var(--buy)" }}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Submitted · {txHash.slice(0, 18)}…
              </span>
            </div>
          )}
        </div>

        {/* Fixed bottom: submit button */}
        <div className="shrink-0 px-4 pb-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            type="submit"
            disabled={loading || !contract || !activeAccount}
            className={cn("p2p-btn-primary", isBuy ? "p2p-btn-buy" : "p2p-btn-sell")}
          >
            {approving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Approving Token…</>
            ) : loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</>
            ) : (
              <><Zap className="w-4 h-4" /> Place {isBuy ? "Buy" : "Sell"} Order</>
            )}
          </button>
          <p
            className="text-[10px] text-center leading-relaxed mt-3"
            style={{ color: "var(--text-ghost)" }}
          >
            Orders execute on-chain via smart contract.
            <br />
            Approve tokens before filling.
          </p>
        </div>
      </form>
    </div>
  );
}
