const API_BASE = import.meta.env.VITE_CHART_API_URL || "http://localhost:4000";

export interface CandleData {
  time:       number;
  open:       number;
  high:       number;
  low:        number;
  close:      number;
  volume:     number;
  tradeCount: number;
}

export interface OrderData {
  id:             string;
  txHash:         string;
  orderId:        string;
  tokenOne:       string;
  tokenTwo:       string;
  creator:        string;
  orderType:      "buy" | "sell";
  amount:         string;
  pricePerToken:  string;
  remainingAmt:   string;
  status:         "open" | "filled" | "cancelled";
  blockTimestamp: string;
}

export interface TradeData {
  id:             string;
  txHash:         string;
  tokenOne:       string;
  tokenTwo:       string;
  fillerAddress:  string;
  creatorAddress: string;
  orderId:        string;
  orderType:      "buy" | "sell";
  fillAmount:     string;
  pricePerToken:  string;
  totalValue:     string;
  fullyFilled:    boolean;
  remainingAmt:   string;
  blockTimestamp: string;
  fillerUser?:    { id: string; wallet_address: string; metaunityId?: string };
  creatorUser?:   { id: string; wallet_address: string; metaunityId?: string };
}

export interface ClosedOrderData {
  id:             string;
  orderId:        string;
  tokenOne:       string;
  tokenTwo:       string;
  creatorAddress: string;
  orderType:      "buy" | "sell";
  amount:         string;
  pricePerToken:  string;
  closedStatus:   "filled" | "cancelled";
  closedAt:       string;
  closedTxHash:   string;
  filledByAddress?: string;
  totalFilled:    string;
  creatorUser?:   { id: string; wallet_address: string; metaunityId?: string };
}

export interface ActivityData {
  id:            string;
  walletAddress: string;
  activityType:  "create_order" | "fill_order" | "cancel_order";
  orderId:       string;
  tokenOne:      string;
  tokenTwo:      string;
  amount:        string;
  pricePerToken: string;
  totalCost?:    string;
  orderType?:    string;
  txHash:        string;
  blockTimestamp: string;
  user?:         { id: string; wallet_address: string; metaunityId?: string };
}

export interface TradeReport {
  walletAddress:       string;
  ordersCreated:       number;
  ordersFilled:        number;
  ordersCancelled:     number;
  totalTradesAsFiller: number;
  totalValueFilled:    string;
}

export interface DepthLevel {
  pricePerToken: string;
  totalAmt:      string;
  orderCount:    number;
}

export interface OrderBookData {
  tokenOne: string;
  tokenTwo: string;
  bids:     DepthLevel[];
  asks:     DepthLevel[];
  bestBid:  string | null;
  bestAsk:  string | null;
}

export interface UserOrdersResponse {
  walletAddress: string;
  counts: {
    open:      number;
    filled:    number;
    cancelled: number;
  };
  orders: OrderData[];
  count:  number;
}

export interface FillEvent {
  id:             string;
  txHash:         string;
  orderId:        string;
  fillerAddress:  string;
  fillAmount:     string;
  remainingAmt:   string;
  blockTimestamp: string;
}

export interface OrderWithFills {
  order: OrderData;
  fills: FillEvent[];
}

export interface GlobalStats {
  orders:      { total: number; open: number; filled: number; cancelled: number };
  trades:      { total: number; last24h: number };
  volume:      { last24h: string };
  activePairs: number;
  generatedAt: string;
}

export interface TradingPair {
  tokenOne:   string;
  tokenTwo:   string;
  openOrders: number;
  trades24h:  number;
}

export interface PairsResponse {
  pairs:       TradingPair[];
  count:       number;
  generatedAt: string;
}

export interface WalletSummary {
  walletAddress: string;
  orders: {
    total:      number;
    open:       number;
    filled:     number;
    cancelled:  number;
    buyOrders:  number;
    sellOrders: number;
  };
  fills: {
    total:            number;
    last24h:          number;
    totalValueFilled: string;
    value24h:         string;
  };
  recentActivity: {
    activityType:   string;
    orderId:        string;
    tokenOne:       string;
    tokenTwo:       string;
    txHash:         string;
    blockTimestamp: string;
  }[];
}

export async function fetchCandles(
  tokenOne: string, tokenTwo: string, interval: string, limit = 500
): Promise<CandleData[]> {
  const params = new URLSearchParams({ tokenOne, tokenTwo, interval, limit: limit.toString() });
  const res = await fetch(`${API_BASE}/api/trades/candles?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch candles: ${res.statusText}`);
  const data = await res.json();
  return data.candles ?? [];
}

export async function fetchOpenOrders(
  tokenOne?: string, tokenTwo?: string
): Promise<OrderData[]> {
  const params = new URLSearchParams({ status: "open" });
  if (tokenOne) params.set("tokenOne", tokenOne);
  if (tokenTwo) params.set("tokenTwo", tokenTwo);
  const res = await fetch(`${API_BASE}/api/orders?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.orders ?? [];
}

export async function fetchOrderHistory(
  tokenOne?: string, tokenTwo?: string, limit = 50
): Promise<OrderData[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (tokenOne) params.set("tokenOne", tokenOne);
  if (tokenTwo) params.set("tokenTwo", tokenTwo);
  const res = await fetch(`${API_BASE}/api/orders/history?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.orders ?? [];
}

export async function fetchUserOrders(
  walletAddress: string,
  status?: "open" | "filled" | "cancelled",
  orderType?: "buy" | "sell",
  limit = 50
): Promise<UserOrdersResponse | null> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (status)    params.set("status", status);
  if (orderType) params.set("orderType", orderType);
  const res = await fetch(`${API_BASE}/api/orders/user/${walletAddress}?${params}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchOrderById(
  orderId: string, tokenOne?: string, tokenTwo?: string
): Promise<OrderWithFills | null> {
  const params = new URLSearchParams();
  if (tokenOne) params.set("tokenOne", tokenOne);
  if (tokenTwo) params.set("tokenTwo", tokenTwo);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/orders/${orderId}${qs ? "?" + qs : ""}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchOrderBook(
  tokenOne: string, tokenTwo: string, depth = 20
): Promise<OrderBookData | null> {
  const params = new URLSearchParams({ tokenOne, tokenTwo, depth: depth.toString() });
  const res = await fetch(`${API_BASE}/api/orders/book?${params}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchRecentTrades(
  tokenOne?: string, tokenTwo?: string, limit = 50
): Promise<TradeData[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (tokenOne) params.set("tokenOne", tokenOne);
  if (tokenTwo) params.set("tokenTwo", tokenTwo);
  const res = await fetch(`${API_BASE}/api/trades/recent?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.trades ?? [];
}

export async function fetchClosedOrders(
  tokenOne?: string,
  tokenTwo?: string,
  closedStatus?: "filled" | "cancelled",
  limit = 50
): Promise<ClosedOrderData[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (tokenOne)     params.set("tokenOne", tokenOne);
  if (tokenTwo)     params.set("tokenTwo", tokenTwo);
  if (closedStatus) params.set("closedStatus", closedStatus);
  const res = await fetch(`${API_BASE}/api/trades/closed-orders?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.orders ?? [];
}

export async function fetchGlobalStats(): Promise<GlobalStats | null> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTradingPairs(): Promise<TradingPair[]> {
  const res = await fetch(`${API_BASE}/api/stats/pairs`);
  if (!res.ok) return [];
  const data: PairsResponse = await res.json();
  return data.pairs ?? [];
}

export async function fetchWalletSummary(address: string): Promise<WalletSummary | null> {
  const res = await fetch(`${API_BASE}/api/wallet/${address}/summary`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchWalletTrades(
  address: string, role?: "filler" | "creator" | "both", limit = 50
): Promise<TradeData[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (role) params.set("role", role);
  const res = await fetch(`${API_BASE}/api/wallet/${address}/trades?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.trades ?? [];
}
