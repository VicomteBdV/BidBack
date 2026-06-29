import { defineChain } from "viem";

export const anvilChainId = 31337;

function parseChainId(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const targetChainId = parseChainId(process.env.NEXT_PUBLIC_CHAIN_ID, anvilChainId);

export const targetChainName =
  cleanEnv(process.env.NEXT_PUBLIC_CHAIN_NAME) ?? (targetChainId === anvilChainId ? "Anvil Local" : `Chain ${targetChainId}`);

export const anvilRpcUrl = cleanEnv(process.env.NEXT_PUBLIC_ANVIL_RPC_URL) ?? "http://127.0.0.1:8545";

export const targetWalletRpcUrl =
  cleanEnv(process.env.NEXT_PUBLIC_WALLET_RPC_URL) ??
  (targetChainId === anvilChainId ? anvilRpcUrl : undefined) ??
  anvilRpcUrl;

export const targetBlockExplorerUrl = cleanEnv(process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL) ?? "";

export const targetChainLabel =
  targetChainId === anvilChainId ? "Anvil 31337" : `${targetChainName} ${targetChainId}`;

export const isLocalAnvilTarget = targetChainId === anvilChainId;

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
      http: [anvilRpcUrl]
    },
    public: {
      http: [anvilRpcUrl]
    }
  }
});

export const targetChain = defineChain({
  id: targetChainId,
  name: targetChainName,
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH"
  },
  rpcUrls: {
    default: {
      http: [targetWalletRpcUrl]
    },
    public: {
      http: [targetWalletRpcUrl]
    }
  },
  ...(targetBlockExplorerUrl
    ? {
        blockExplorers: {
          default: {
            name: "Block Explorer",
            url: targetBlockExplorerUrl
          }
        }
      }
    : {})
});