import { defineChain } from "viem";

export const anvilChainId = 31337;

const rpcUrl = process.env.NEXT_PUBLIC_ANVIL_RPC_URL ?? "http://127.0.0.1:8545";

export const anvil = defineChain({
  id: anvilChainId,
  name: "Anvil Local",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH"
  },
  rpcUrls: {
    default: {
      http: [rpcUrl]
    },
    public: {
      http: [rpcUrl]
    }
  }
});