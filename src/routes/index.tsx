import { useState, useEffect } from "react";
import {
  useActiveAccount, ConnectButton,
  useActiveWalletChain, useSwitchActiveWalletChain,
} from "thirdweb/react";
import { ethers } from "ethers";
import {
  ChevronDown, Sun, Moon, Zap, TrendingUp, TrendingDown,
  AlertTriangle, Loader2, X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { client, MainnetChain } from "~/lib/client";
import { p2pContractInstance } from "~/contract/p2p/p2p-contract";
import { fetchTradingPairs, TradingPair } from "~/lib/tradingApi";
import { useTheme } from "~/contexts/ThemeContext";
import OrderForm from "~/components/p2p/trading/orderform";
import RecentTrades from "~/components/p2p/trading/recenttrades";
import TradingChart from "~/components/p2p/trading/trading-chart";
import OrderBook from "~/components/p2p/trading/orderbook";
import StatsBar from "~/components/p2p/statsbar";

const TOKEN_META: Record<string, string> = {
  "0x961b6dd6f780c46561a8059a4dce3a43dd1cdae8": "HRS",
  "0xbe9a1d75c68cfa6e558e597caf538376708862c4": "USDT",
};

function symbol(addr: string): string {
  return TOKEN_META[addr.toLowerCase()] ?? addr.slice(0, 6) + "…";
}

const FALLBACK_PAIRS = [
  {
    label:     "HRS/USDT",
    tokenOne:  "0x961b6dd6F780C46561a8059a4Dce3a43Dd1cDAE8",
    tokenTwo:  "0xBe9a1d75c68cfA6E558E597CAf538376708862c4",
    symbolOne: "HRS",
    symbolTwo: "USDT",
  },
  {
    label:     "USDT/HRS",
    tokenOne:  "0xBe9a1d75c68cfA6E558E597CAf538376708862c4",
    tokenTwo:  "0x961b6dd6F780C46561a8059a4Dce3a43Dd1cDAE8",
    symbolOne: "USDT",
    symbolTwo: "HRS",
  },
];

interface PairOption {
  label:     string;
  tokenOne:  string;
  tokenTwo:  string;
  symbolOne: string;
  symbolTwo: string;
}

type Side = "buy" | "sell";

function toPairOptions(p: TradingPair): PairOption[] {
  const s1 = symbol(p.tokenOne);
  const s2 = symbol(p.tokenTwo);
  return [
    { label: `${s1}/${s2}`, tokenOne: p.tokenOne,  tokenTwo: p.tokenTwo,  symbolOne: s1, symbolTwo: s2 },
    { label: `${s2}/${s1}`, tokenOne: p.tokenTwo,  tokenTwo: p.tokenOne,  symbolOne: s2, symbolTwo: s1 },
  ];
}

export default function TradingPage() {
  const { theme, toggle } = useTheme();
  const activeAccount  = useActiveAccount();
  const activeChain    = useActiveWalletChain();
  const switchChain    = useSwitchActiveWalletChain();

  const [pairs,        setPairs]        = useState<PairOption[]>(FALLBACK_PAIRS);
  const [selectedPair, setSelectedPair] = useState<PairOption>(FALLBACK_PAIRS[0]);
  const [contract,     setContract]     = useState<ethers.Contract | null>(null);
  const [pairOpen,     setPairOpen]     = useState(false);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [switching,    setSwitching]    = useState(false);

  // Mobile-only: bottom-sheet trade form + pre-selected side
  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [sheetSide,      setSheetSide]      = useState<Side>("buy");

  const isWrongNetwork = !!(activeAccount && activeChain && activeChain.id !== 56);

  useEffect(() => {
    fetchTradingPairs().then((apiPairs) => {
      if (apiPairs.length === 0) return;
      const options = apiPairs.flatMap(toPairOptions);
      setPairs(options);
      setSelectedPair((prev) => {
        const stillValid = options.find(
          (o) => o.tokenOne.toLowerCase() === prev.tokenOne.toLowerCase() &&
                 o.tokenTwo.toLowerCase() === prev.tokenTwo.toLowerCase()
        );
        return stillValid ?? options[0];
      });
    });
  }, []);

  useEffect(() => {
    if (!activeAccount) return;
    (async () => {
      const inst = await p2pContractInstance(activeAccount);
      if (inst) setContract(inst);
    })();
  }, [activeAccount]);

  // Lock body scroll when bottom sheet is open
  useEffect(() => {
    if (tradeSheetOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [tradeSheetOpen]);

  async function handleSwitchNetwork() {
    setSwitching(true);
    try {
      await switchChain(MainnetChain);
    } catch (e) {
      console.error("Network switch failed:", e);
    } finally {
      setSwitching(false);
    }
  }

  function handleOrderSuccess() {
    setRefreshKey((k) => k + 1);
    setTradeSheetOpen(false);
  }

  function openTradeSheet(side: Side) {
    setSheetSide(side);
    setTradeSheetOpen(true);
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-base)", color: "var(--text)" }}
    >
      {/* ═════════════════════════════════════════════════════════════
          HEADER
      ═════════════════════════════════════════════════════════════ */}
      <header
        className="glass-header sticky top-0 z-50 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* ─── MOBILE HEADER (< sm) ──────────────────────────────── */}
        <div className="sm:hidden flex flex-col">
          {/* Row 1: logo + theme + wallet — clean and balanced */}
          <div className="flex items-center justify-between px-3 h-12 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent-glow)",
                  boxShadow: "0 0 16px var(--accent-glow)",
                }}
              >
                <Zap className="w-4 h-4" style={{ color: "var(--accent)" }} />
              </div>
              <p
                className="text-sm font-bold tracking-wide truncate"
                style={{ color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                P2P Exchange
              </p>
              {/* BNB chip — tiny on mobile */}
              {activeAccount && !isWrongNetwork && (
                <div
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md shrink-0"
                  style={{ background: "var(--buy-dim)", border: "1px solid var(--buy-border)" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--buy)" }} />
                  <span className="text-[9px] font-bold" style={{ color: "var(--buy)" }}>BNB</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={toggle}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>

              <ConnectButton
                client={client}
                chain={MainnetChain}
                connectButton={{
                  style: {
                    fontSize: "11px",
                    padding: "7px 12px",
                    background: "var(--accent-dim)",
                    border: "1px solid var(--accent-glow)",
                    borderRadius: "8px",
                    color: "var(--accent-text)",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontWeight: "700",
                    whiteSpace: "nowrap",
                    height: "32px",
                  },
                  label: "Connect",
                }}
                detailsButton={{
                  style: {
                    fontSize: "11px",
                    padding: "7px 10px",
                    background: "var(--bg-hover)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--text-dim)",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontWeight: "600",
                    height: "32px",
                  },
                }}
              />
            </div>
          </div>

          {/* Row 2: pair selector full-width — big tap target, can't miss it */}
          <div className="px-3 pb-2 relative">
            <button
              onClick={() => setPairOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: pairOpen ? "var(--bg-active)" : "var(--bg-hover)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span
                  className="text-[10px] font-medium uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Pair
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text)" }}
                >
                  {selectedPair.label}
                </span>
              </div>
              <ChevronDown
                className={cn("w-4 h-4 transition-transform duration-200", pairOpen && "rotate-180")}
                style={{ color: "var(--text-muted)" }}
              />
            </button>

            {pairOpen && (
              <div
                className="absolute top-full left-3 right-3 mt-1 rounded-xl shadow-2xl z-50 overflow-hidden anim-slide-down"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-strong)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                <div
                  className="px-3 py-2 border-b"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  <p className="text-[10px] font-bold tracking-wider uppercase">Choose Pair</p>
                </div>
                {pairs.map((pair) => {
                  const isSelected = selectedPair.label === pair.label;
                  return (
                    <button
                      key={pair.label}
                      onClick={() => { setSelectedPair(pair); setPairOpen(false); }}
                      className="w-full px-3 py-3 flex items-center gap-2.5 text-left"
                      style={{
                        background: isSelected ? "var(--accent-dim)" : "transparent",
                        color: isSelected ? "var(--accent)" : "var(--text-dim)",
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: isSelected ? "var(--accent)" : "var(--border-strong)" }}
                      />
                      <span
                        className="text-sm font-bold"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {pair.label}
                      </span>
                      {isSelected && (
                        <span
                          className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: "var(--accent)", color: "#000" }}
                        >
                          ACTIVE
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Wrong network banner — mobile */}
          {isWrongNetwork && (
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{
                background: "var(--warning-dim)",
                borderTop: "1px solid var(--warning-border)",
              }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--accent)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--accent-text)" }}>
                  Wrong network
                </span>
              </div>
              <button
                onClick={handleSwitchNetwork}
                disabled={switching}
                className="text-xs font-bold px-3 py-1 rounded-lg"
                style={{
                  background: "var(--accent)",
                  color: "#000",
                  opacity: switching ? 0.7 : 1,
                }}
              >
                {switching ? "…" : "Switch"}
              </button>
            </div>
          )}
        </div>

        {/* ─── DESKTOP HEADER (sm+) ──────────────────────────────── */}
        <div className="hidden sm:flex items-center justify-between px-3 sm:px-4 h-14 gap-2 sm:gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "var(--accent-dim)",
                border: "1px solid var(--accent-glow)",
                boxShadow: "0 0 20px var(--accent-glow)",
              }}
            >
              <Zap className="w-4 h-4" style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p
                className="text-sm font-bold tracking-wider leading-tight"
                style={{ color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                P2P Exchange
              </p>
              <p className="text-[10px] font-medium leading-tight" style={{ color: "var(--text-muted)" }}>
                Decentralized · BNB Chain
              </p>
            </div>
          </div>

          {/* Pair selector */}
          <div className="flex items-center gap-2">
            <div className="w-px h-5" style={{ background: "var(--border-strong)" }} />
            <div className="relative">
              <button
                onClick={() => setPairOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
                style={{
                  background: pairOpen ? "var(--bg-active)" : "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
                <span
                  className="text-sm font-bold"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text)" }}
                >
                  {selectedPair.label}
                </span>
                <ChevronDown
                  className={cn("w-3.5 h-3.5 transition-transform duration-200", pairOpen && "rotate-180")}
                  style={{ color: "var(--text-muted)" }}
                />
              </button>

              {pairOpen && (
                <div
                  className="absolute top-full left-0 mt-2 w-52 rounded-xl shadow-2xl z-50 overflow-hidden anim-slide-down"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-strong)",
                    boxShadow: "var(--shadow-lg)",
                  }}
                >
                  <div
                    className="px-3 py-2.5 border-b"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    <p className="text-[10px] font-bold tracking-wider uppercase">Trading Pairs</p>
                  </div>
                  {pairs.map((pair) => {
                    const isSelected = selectedPair.label === pair.label;
                    return (
                      <button
                        key={pair.label}
                        onClick={() => { setSelectedPair(pair); setPairOpen(false); }}
                        className="w-full px-3 py-3 flex items-center gap-2.5 text-left transition-all"
                        style={{
                          background: isSelected ? "var(--accent-dim)" : "transparent",
                          color: isSelected ? "var(--accent)" : "var(--text-dim)",
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-hover)";
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: isSelected ? "var(--accent)" : "var(--border-strong)" }}
                        />
                        <span
                          className="text-sm font-bold"
                          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {pair.label}
                        </span>
                        {isSelected && (
                          <span
                            className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: "var(--accent)", color: "#000" }}
                          >
                            ACTIVE
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 ml-auto">
            {isWrongNetwork && (
              <button
                onClick={handleSwitchNetwork}
                disabled={switching}
                className="bnb-switch-btn"
              >
                {switching
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                <span className="whitespace-nowrap text-xs">
                  {switching ? "Switching…" : "Switch to BNB"}
                </span>
              </button>
            )}

            {activeAccount && !isWrongNetwork && activeChain && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{ background: "var(--buy-dim)", border: "1px solid var(--buy-border)" }}
              >
                <div className="w-2 h-2 rounded-full" style={{ background: "var(--buy)" }} />
                <span className="text-[10px] font-bold tracking-wide" style={{ color: "var(--buy)" }}>BNB</span>
              </div>
            )}

            <button
              onClick={toggle}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0"
              style={{
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <ConnectButton
              client={client}
              chain={MainnetChain}
              connectButton={{
                style: {
                  fontSize: "12px",
                  padding: "8px 14px",
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent-glow)",
                  borderRadius: "10px",
                  color: "var(--accent-text)",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: "700",
                  letterSpacing: "0.05em",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                },
                label: "Connect",
              }}
              detailsButton={{
                style: {
                  fontSize: "12px",
                  padding: "8px 12px",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  color: "var(--text-dim)",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: "600",
                },
              }}
            />
          </div>
        </div>

        {/* Stats bar */}
        <div
          className="px-3 sm:px-4 py-2 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <StatsBar />
        </div>
      </header>

      {/* ═════════════════════════════════════════════════════════════
          MAIN CONTENT
      ═════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 flex flex-col">

        {/* MOBILE: single-page scroll, padded for sticky bottom bar */}
        <div className="md:hidden flex flex-col gap-3 p-3" style={{ paddingBottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}>
          <div style={{ height: "min(54vh, 420px)", minHeight: "300px" }}>
            <TradingChart
              key={`chart-${selectedPair.label}`}
              tokenOne={selectedPair.tokenOne}
              tokenTwo={selectedPair.tokenTwo}
              tokenOneSymbol={selectedPair.symbolOne}
              tokenTwoSymbol={selectedPair.symbolTwo}
              className="h-full"
            />
          </div>

          <div style={{ minHeight: "560px" }}>
            <OrderBook
              key={`book-${selectedPair.label}-${refreshKey}`}
              tokenOne={selectedPair.tokenOne}
              tokenTwo={selectedPair.tokenTwo}
              tokenOneSymbol={selectedPair.symbolOne}
              tokenTwoSymbol={selectedPair.symbolTwo}
              contract={contract}
              activeAccount={activeAccount ?? null}
              className="h-full"
            />
          </div>

          <div style={{ minHeight: "360px" }}>
            <RecentTrades
              key={`trades-${selectedPair.label}`}
              tokenOne={selectedPair.tokenOne}
              tokenTwo={selectedPair.tokenTwo}
              tokenOneSymbol={selectedPair.symbolOne}
              tokenTwoSymbol={selectedPair.symbolTwo}
              className="h-full"
            />
          </div>
        </div>

        {/* DESKTOP / TABLET */}
        <div
          className="hidden md:grid flex-1 min-h-0 p-3 gap-3"
          style={{
            gridTemplateColumns: "1fr 308px",
            gridTemplateRows: "minmax(440px, 52vh) minmax(340px, 1fr)",
            gridTemplateAreas: `"chart form" "panels form"`,
          }}
        >
          <TradingChart
            key={`chart-${selectedPair.label}`}
            tokenOne={selectedPair.tokenOne}
            tokenTwo={selectedPair.tokenTwo}
            tokenOneSymbol={selectedPair.symbolOne}
            tokenTwoSymbol={selectedPair.symbolTwo}
            className="min-h-0"
            style={{ gridArea: "chart" }}
          />

          <div
            style={{ gridArea: "form" }}
            className="h-full flex flex-col min-h-0"
          >
            <OrderForm
              key={`form-${selectedPair.label}`}
              tokenOne={selectedPair.tokenOne}
              tokenTwo={selectedPair.tokenTwo}
              tokenOneSymbol={selectedPair.symbolOne}
              tokenTwoSymbol={selectedPair.symbolTwo}
              contract={contract}
              activeAccount={activeAccount ?? null}
              onSuccess={handleOrderSuccess}
            />
          </div>

          <div
            style={{ gridArea: "panels" }}
            className="flex flex-col lg:flex-row gap-3 min-h-0"
          >
            <OrderBook
              key={`book-${selectedPair.label}-${refreshKey}`}
              tokenOne={selectedPair.tokenOne}
              tokenTwo={selectedPair.tokenTwo}
              tokenOneSymbol={selectedPair.symbolOne}
              tokenTwoSymbol={selectedPair.symbolTwo}
              contract={contract}
              activeAccount={activeAccount ?? null}
              className="flex-1 min-h-0"
            />
            <RecentTrades
              key={`trades-${selectedPair.label}`}
              tokenOne={selectedPair.tokenOne}
              tokenTwo={selectedPair.tokenTwo}
              tokenOneSymbol={selectedPair.symbolOne}
              tokenTwoSymbol={selectedPair.symbolTwo}
              className="min-h-[280px] lg:min-h-0 lg:w-[228px]"
            />
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════
          MOBILE STICKY BUY/SELL BAR
      ═════════════════════════════════════════════════════════════ */}
      <div
        className="md:hidden fixed left-0 right-0 z-40 flex gap-2 px-3 pt-2"
        style={{
          bottom: 0,
          paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
          background: "var(--bg-base)",
          borderTop: "1px solid var(--border-strong)",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.25)",
        }}
      >
        <button
          onClick={() => openTradeSheet("buy")}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold tracking-wider uppercase text-sm transition-all active:scale-[0.97]"
          style={{
            background: "var(--buy)",
            color: "#fff",
            boxShadow: "0 4px 12px var(--buy-border)",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <TrendingUp className="w-4 h-4" strokeWidth={2.5} />
          Buy
        </button>
        <button
          onClick={() => openTradeSheet("sell")}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold tracking-wider uppercase text-sm transition-all active:scale-[0.97]"
          style={{
            background: "var(--sell)",
            color: "#fff",
            boxShadow: "0 4px 12px var(--sell-border)",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <TrendingDown className="w-4 h-4" strokeWidth={2.5} />
          Sell
        </button>
      </div>

      {/* ═════════════════════════════════════════════════════════════
          MOBILE BOTTOM SHEET (Trade form)
      ═════════════════════════════════════════════════════════════ */}
      {tradeSheetOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
          <div
            className="absolute inset-0 anim-fade-up"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setTradeSheetOpen(false)}
          />

          <div
            className="relative anim-slide-up rounded-t-2xl flex flex-col overflow-hidden"
            style={{
              background: "var(--bg-base)",
              borderTop: "1px solid var(--border-strong)",
              maxHeight: "92vh",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <div
              className="relative flex items-center justify-center px-4 py-2.5 shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div
                className="w-10 h-1 rounded-full"
                style={{ background: "var(--border-strong)" }}
              />
              <button
                onClick={() => setTradeSheetOpen(false)}
                className="absolute right-3 w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: "var(--bg-hover)",
                  color: "var(--text-muted)",
                }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0">
              <OrderForm
                key={`form-mobile-${selectedPair.label}-${sheetSide}`}
                tokenOne={selectedPair.tokenOne}
                tokenTwo={selectedPair.tokenTwo}
                tokenOneSymbol={selectedPair.symbolOne}
                tokenTwoSymbol={selectedPair.symbolTwo}
                contract={contract}
                activeAccount={activeAccount ?? null}
                onSuccess={handleOrderSuccess}
                initialSide={sheetSide}
              />
            </div>
          </div>
        </div>
      )}

      {/* Click-away for pair dropdown */}
      {pairOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setPairOpen(false)} />
      )}
    </div>
  );
}