import { useState, useEffect } from "react";
import {
  useActiveAccount, ConnectButton,
  useActiveWalletChain, useSwitchActiveWalletChain,
} from "thirdweb/react";
import { ethers } from "ethers";
import {
  ChevronDown, Sun, Moon, Zap, TrendingUp,
  AlertTriangle, Loader2, BarChart2, BookOpen, Activity, Clock,
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

function toPairOptions(p: TradingPair): PairOption[] {
  const s1 = symbol(p.tokenOne);
  const s2 = symbol(p.tokenTwo);
  return [
    { label: `${s1}/${s2}`, tokenOne: p.tokenOne,  tokenTwo: p.tokenTwo,  symbolOne: s1, symbolTwo: s2 },
    { label: `${s2}/${s1}`, tokenOne: p.tokenTwo,  tokenTwo: p.tokenOne,  symbolOne: s2, symbolTwo: s1 },
  ];
}

type MobileView = "chart" | "trade" | "book" | "history";

const MOBILE_NAV: { id: MobileView; label: string; icon: React.ElementType }[] = [
  { id: "chart",   label: "Chart",  icon: BarChart2  },
  { id: "trade",   label: "Trade",  icon: Zap        },
  { id: "book",    label: "Book",   icon: BookOpen   },
  { id: "history", label: "Trades", icon: Clock      },
];

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
  const [mobileView,   setMobileView]   = useState<MobileView>("chart");
  const [switching,    setSwitching]    = useState(false);

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
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-base)", color: "var(--text)" }}
    >
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header
        className="glass-header sticky top-0 z-50 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between px-3 sm:px-4 h-14 gap-2 sm:gap-3">
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
            <div className="hidden sm:block">
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
            <div className="w-px h-5 hidden sm:block" style={{ background: "var(--border-strong)" }} />
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

          {/* Right side: network switch + theme toggle + wallet */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
            {/* Wrong network warning */}
            {isWrongNetwork && (
              <button
                onClick={handleSwitchNetwork}
                disabled={switching}
                className="bnb-switch-btn"
              >
                {switching
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                <span className="hidden sm:inline whitespace-nowrap text-xs">
                  {switching ? "Switching…" : "Switch to BNB"}
                </span>
              </button>
            )}

            {/* BNB network badge (when on correct network) */}
            {activeAccount && !isWrongNetwork && activeChain && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                style={{
                  background: "var(--buy-dim)",
                  border: "1px solid var(--buy-border)",
                }}
              >
                <div className="w-2 h-2 rounded-full" style={{ background: "var(--buy)" }} />
                <span className="text-[10px] font-bold tracking-wide" style={{ color: "var(--buy)" }}>
                  BNB
                </span>
              </div>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0"
              style={{
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark"
                ? <Sun className="w-4 h-4" />
                : <Moon className="w-4 h-4" />}
            </button>

            {/* Wallet connect */}
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

        {/* Wrong network full-width banner */}
        {isWrongNetwork && (
          <div
            className="flex items-center justify-between px-3 sm:px-4 py-2 sm:hidden"
            style={{
              background: "var(--warning-dim)",
              borderTop: "1px solid var(--warning-border)",
            }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--accent)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--accent-text)" }}>
                Wrong network — BNB Smart Chain required
              </span>
            </div>
            <button
              onClick={handleSwitchNetwork}
              disabled={switching}
              className="text-xs font-bold px-2.5 py-1 rounded-lg transition-all"
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

        {/* Stats bar */}
        <div
          className="px-3 sm:px-4 py-2 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <StatsBar />
        </div>
      </header>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">

        {/* Mobile: single panel at a time (< md) */}
        <div className="md:hidden flex-1 min-h-0 p-3 pb-20">
          {mobileView === "chart" && (
            <TradingChart
              key={`chart-${selectedPair.label}`}
              tokenOne={selectedPair.tokenOne}
              tokenTwo={selectedPair.tokenTwo}
              tokenOneSymbol={selectedPair.symbolOne}
              tokenTwoSymbol={selectedPair.symbolTwo}
              className="h-full"
              style={{ minHeight: "360px" }}
            />
          )}
          {mobileView === "trade" && (
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
          )}
          {mobileView === "book" && (
            <OrderBook
              key={`book-${selectedPair.label}-${refreshKey}`}
              tokenOne={selectedPair.tokenOne}
              tokenTwo={selectedPair.tokenTwo}
              tokenOneSymbol={selectedPair.symbolOne}
              tokenTwoSymbol={selectedPair.symbolTwo}
              contract={contract}
              activeAccount={activeAccount ?? null}
              className="h-full"
              style={{ minHeight: "500px" }}
            />
          )}
          {mobileView === "history" && (
            <RecentTrades
              key={`trades-${selectedPair.label}`}
              tokenOne={selectedPair.tokenOne}
              tokenTwo={selectedPair.tokenTwo}
              tokenOneSymbol={selectedPair.symbolOne}
              tokenTwoSymbol={selectedPair.symbolTwo}
              className="h-full"
              style={{ minHeight: "400px" }}
            />
          )}
        </div>

        {/* Desktop/tablet: 3-area grid (md+) */}
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

      {/* ── MOBILE BOTTOM NAV ─────────────────────────────────────────── */}
      <nav className="mobile-nav md:hidden">
        {MOBILE_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setMobileView(id)}
            className={cn("mobile-nav-item", mobileView === id && "active")}
          >
            <Icon className="w-5 h-5" />
            <span
              className="text-[9px] font-bold uppercase tracking-wider"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              {label}
            </span>
          </button>
        ))}
      </nav>

      {/* Click-away for pair dropdown */}
      {pairOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setPairOpen(false)} />
      )}
    </div>
  );
}
