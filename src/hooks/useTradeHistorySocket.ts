import { useEffect, useRef, useState, useCallback } from "react";
import { fetchRecentTrades, TradeData } from "~/lib/tradingApi";
import { useOrderBookSocket } from "~/hooks/useOrderbookSocket";

const HISTORY_LIMIT = 60;

interface UseTradeHistoryOptions {
  tokenOne: string;
  tokenTwo: string;
  enabled?: boolean;
}

interface UseTradeHistoryReturn {
  trades:   TradeData[];
  newIds:   Set<string>;
  loading:  boolean;
  wsLive:   boolean;
}

export function useTradeHistory({
  tokenOne,
  tokenTwo,
  enabled = true,
}: UseTradeHistoryOptions): UseTradeHistoryReturn {
  const [trades,  setTrades]  = useState<TradeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIds,  setNewIds]  = useState<Set<string>>(new Set());

  const { updates, status } = useOrderBookSocket({ tokenOne, tokenTwo, enabled });
  const wsLive = status === "connected";

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTrades = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRecentTrades(tokenOne, tokenTwo, HISTORY_LIMIT);
      setTrades(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [tokenOne, tokenTwo]);

  useEffect(() => { loadTrades(); }, [loadTrades]);

  useEffect(() => {
    if (updates.length === 0) return;
    const fills = updates.filter(
      (u) =>
        u.type === "ORDER_FILLED" &&
        u.tokenOne.toLowerCase() === tokenOne.toLowerCase() &&
        u.tokenTwo.toLowerCase() === tokenTwo.toLowerCase(),
    );
    if (fills.length === 0) return;

    const hashes = new Set(fills.map((f) => f.txHash));
    setNewIds((prev) => new Set([...prev, ...hashes]));

    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      await loadTrades();
    }, 1200);

    const clearTimer = setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        hashes.forEach((h) => next.delete(h));
        return next;
      });
    }, 5000);

    return () => clearTimeout(clearTimer);
  }, [updates, tokenOne, tokenTwo, loadTrades]);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  return { trades, newIds, loading, wsLive };
}
