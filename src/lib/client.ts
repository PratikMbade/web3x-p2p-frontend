import { createThirdwebClient, defineChain } from "thirdweb";

const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID;

if (!clientId) {
  throw new Error("VITE_THIRDWEB_CLIENT_ID is not set in .env");
}

export const client = createThirdwebClient({ clientId });

export const MainnetChain = defineChain({
  id: 56,
  rpc: "https://bsc-dataseed.binance.org/",
  nativeCurrency: { name: "Binance Coin", symbol: "BNB", decimals: 18 },
});

export const TestnetChain = defineChain({
  id: 97,
  rpc: "https://data-seed-prebsc-1-s1.binance.org:8545/",
  nativeCurrency: { name: "Binance Coin", symbol: "BNB", decimals: 18 },
});
