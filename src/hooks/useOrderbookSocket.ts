import { useEffect, useRef, useState, useCallback } from "react";

export type OrderStatus = "open" | "filled" | "cancelled";
export type OrderType   = "buy" | "sell";

export interface OrderBookUpdate {
  type:      "ORDER_CREATED" | "ORDER_CANCELLED" | "ORDER_FILLED";
  txHash:    string;
  tokenOne:  string;
  tokenTwo:  string;
  orderId:   string;
  timestamp: number;
  data:      Record<string, unknown>;
}

export interface OrderBookSnapshot {
  global:  boolean;
  orders:  unknown[];
}

const WS_URL = import.meta.env.VITE_CHART_WS_URL || "ws://localhost:4000/ws";

type WsStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseOrderBookSocketOptions {
  tokenOne?: string;
  tokenTwo?: string;
  enabled?:  boolean;
}

interface UseOrderBookSocketReturn {
  updates:  OrderBookUpdate[];
  snapshot: OrderBookSnapshot | null;
  status:   WsStatus;
}

export function useOrderBookSocket({
  tokenOne,
  tokenTwo,
  enabled = true,
}: UseOrderBookSocketOptions = {}): UseOrderBookSocketReturn {
  const [updates,  setUpdates]  = useState<OrderBookUpdate[]>([]);
  const [snapshot, setSnapshot] = useState<OrderBookSnapshot | null>(null);
  const [status,   setStatus]   = useState<WsStatus>("connecting");

  const wsRef          = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef     = useRef(true);

  const isGlobal = !tokenOne || !tokenTwo;

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus("connected");

      if (isGlobal) {
        ws.send(JSON.stringify({ type: "SUBSCRIBE_ALL_ORDERS", payload: {} }));
      } else {
        ws.send(JSON.stringify({
          type:    "SUBSCRIBE_ORDERBOOK",
          payload: { tokenOne, tokenTwo },
        }));
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data as string);
        switch (msg.type) {
          case "ORDERBOOK_SNAPSHOT":
            setSnapshot(msg.payload as OrderBookSnapshot);
            break;
          case "ORDER_CREATED":
          case "ORDER_FILLED":
          case "ORDER_CANCELLED":
            setUpdates((prev) => [msg as OrderBookUpdate, ...prev].slice(0, 200));
            break;
          case "PING":
            ws.send(JSON.stringify({ type: "PONG", payload: { ts: Date.now() } }));
            break;
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onerror  = () => setStatus("error");
    ws.onclose  = () => {
      if (!mountedRef.current) return;
      setStatus("disconnected");
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };
  }, [tokenOne, tokenTwo, isGlobal, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [connect, enabled]);

  return { updates, snapshot, status };
}
