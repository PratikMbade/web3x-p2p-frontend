import { useState } from "react";
import { ethers } from "ethers";
import { Account } from "thirdweb/wallets";
import { X, ArrowDownLeft, ArrowUpRight, Loader2, AlertCircle, Zap } from "lucide-react";
import { cn } from "~/lib/utils";
import { ensureAllowance } from "~/contract/erc20-approve";
import { p2pContractAddress, getSigner } from "~/contract/p2p/p2p-contract";

interface CreateOrderModalProps {
  contract: ethers.Contract | null;
  activeAccount: Account;
  onClose: () => void;
  onSuccess: () => void;
}

const ORDER_TYPES = [
  { id: 0, label: "BUY",  desc: "Buy tokenToBuy using tokenToExchange", icon: ArrowDownLeft, isBuy: true },
  { id: 1, label: "SELL", desc: "Sell tokenToBuy for tokenToExchange",  icon: ArrowUpRight,  isBuy: false },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {label}
        </label>
        {hint && <span className="text-[10px]" style={{ color: "var(--text-ghost)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function CreateOrderModal({
  contract,
  activeAccount,
  onClose,
  onSuccess,
}: CreateOrderModalProps) {
  const [tokenToBuy,      setTokenToBuy]      = useState("");
  const [tokenToExchange, setTokenToExchange] = useState("");
  const [amount,          setAmount]          = useState("");
  const [pricePerToken,   setPricePerToken]   = useState("");
  const [orderType,       setOrderType]       = useState(0);
  const [loading,         setLoading]         = useState(false);
  const [approving,       setApproving]       = useState(false);
  const [error,           setError]           = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!contract) return setError("Contract not initialized");
    if (!ethers.isAddress(tokenToBuy)) return setError("Invalid tokenToBuy address");
    if (!ethers.isAddress(tokenToExchange)) return setError("Invalid tokenToExchange address");
    if (!amount || isNaN(Number(amount))) return setError("Invalid amount");
    if (!pricePerToken || isNaN(Number(pricePerToken))) return setError("Invalid price");

    try {
      setLoading(true);
      const amtWei   = ethers.parseUnits(amount, 18);
      const priceWei = ethers.parseUnits(pricePerToken, 18);

      const signer = await getSigner(activeAccount);
      setApproving(true);
      const tokenToApprove = orderType === 1 ? tokenToExchange : tokenToBuy;
      await ensureAllowance(signer, tokenToApprove, p2pContractAddress);
      setApproving(false);

      const tx = await contract.createOrder(tokenToBuy, tokenToExchange, amtWei, priceWei, orderType);
      await tx.wait();
      onSuccess();
    } catch (err: unknown) {
      const e = err as { reason?: string; message?: string };
      const msg = e?.reason || e?.message || "Transaction failed";
      setError(msg.includes("fb8f41b2") ? "Token approval needed — approve then retry" : msg);
    } finally {
      setApproving(false);
      setLoading(false);
    }
  }

  const isBuyType = orderType === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "rgba(0,0,0,0.65)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl anim-fade-up"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <h2 className="text-sm font-bold tracking-wide" style={{ color: "var(--text)" }}>
              Create Order
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              New P2P Trade Request
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ color: "var(--text-muted)", background: "var(--bg-hover)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Order type toggle */}
          <Field label="Order Type">
            <div className="grid grid-cols-2 gap-2">
              {ORDER_TYPES.map((t) => {
                const isActive = orderType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setOrderType(t.id)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left transition-all"
                    style={{
                      background: isActive ? (t.isBuy ? "var(--buy-dim)" : "var(--sell-dim)") : "var(--bg-hover)",
                      borderColor: isActive ? (t.isBuy ? "var(--buy-border)" : "var(--sell-border)") : "var(--border)",
                      color: isActive ? (t.isBuy ? "var(--buy)" : "var(--sell)") : "var(--text-muted)",
                    }}
                  >
                    <t.icon className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="text-xs font-bold tracking-wider">{t.label}</p>
                      <p className="text-[9px] opacity-60 mt-0.5 leading-snug">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="space-y-4">
            <Field label="Token To Buy" hint="ERC-20 address">
              <input
                className="p2p-input"
                placeholder="0x…"
                value={tokenToBuy}
                onChange={(e) => setTokenToBuy(e.target.value)}
              />
            </Field>
            <Field label="Token To Exchange" hint="ERC-20 address">
              <input
                className="p2p-input"
                placeholder="0x…"
                value={tokenToExchange}
                onChange={(e) => setTokenToExchange(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <input
                className="p2p-input"
                placeholder="0.00"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Price / Token">
              <input
                className="p2p-input"
                placeholder="0.00"
                type="number"
                min="0"
                step="any"
                value={pricePerToken}
                onChange={(e) => setPricePerToken(e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <div
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl anim-fade-up"
              style={{
                background: "var(--sell-dim)",
                border: "1px solid var(--sell-border)",
                color: "var(--sell)",
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn("p2p-btn-primary", isBuyType ? "p2p-btn-buy" : "p2p-btn-sell")}
          >
            {approving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Approving Token…</>
            ) : loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            ) : (
              <><Zap className="w-4 h-4" /> Place {isBuyType ? "Buy" : "Sell"} Order</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
