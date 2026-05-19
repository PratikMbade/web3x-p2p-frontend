import { useEffect, useRef, useState, useCallback } from "react";

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface OHLCVCandle {
  time:       number;
  open:       number;
  high:       number;
  low:        number;
  close:      number;
  volume:     number;
  tradeCount: number;
}

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseCandleSocketOptions {
  tokenOne: string;
  tokenTwo: string;
  interval: CandleInterval;
  enabled?: boolean;
}

interface UseCandleSocketReturn {
  candles:      OHLCVCandle[];
  latestCandle: OHLCVCandle | null;
  status:       WsStatus;
  error:        string | null;
}

const WS_URL = import.meta.env.VITE_CHART_WS_URL || "ws://localhost:4000/ws";

export function useCandleSocket({
  tokenOne,
  tokenTwo,
  interval,
  enabled = true,
}: UseCandleSocketOptions): UseCandleSocketReturn {
  const [candles,      setCandles]      = useState<OHLCVCandle[]>([]);
  const [latestCandle, setLatestCandle] = useState<OHLCVCandle | null>(null);
  const [status,       setStatus]       = useState<WsStatus>("connecting");
  const [error,        setError]        = useState<string | null>(null);

  const wsRef          = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef     = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus("connected");
      setError(null);
      ws.send(JSON.stringify({
        type:    "SUBSCRIBE_CANDLES",
        payload: { tokenOne, tokenTwo, interval },
      }));
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "CANDLE_HISTORY":
            setCandles(msg.payload.candles || []);
            break;
          case "CANDLE_UPDATE": {
            const { candle, isNew } = msg.payload;
            setLatestCandle(candle);
            setCandles((prev) => {
              if (isNew) return [...prev, candle];
              const updated = [...prev];
              if (updated.length > 0) updated[updated.length - 1] = candle;
              return updated;
            });
            break;
          }
          case "PING":
            ws.send(JSON.stringify({ type: "PONG", payload: { ts: Date.now() } }));
            break;
          case "ERROR":
            setError(msg.payload?.message || "WebSocket error");
            break;
        }
      } catch (e) {
        console.error("[useCandleSocket] parse error", e);
      }
    };

    ws.onerror  = () => { setStatus("error"); setError("Connection error"); };
    ws.onclose  = () => {
      if (!mountedRef.current) return;
      setStatus("disconnected");
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };
  }, [tokenOne, tokenTwo, interval, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [connect, enabled]);

  return { candles, latestCandle, status, error };
}
