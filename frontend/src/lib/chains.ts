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

export function resolveWalletRpcUrl(chainId: number, walletRpc?: string, localRpc?: string) {
  const value = cleanEnv(walletRpc) ??
    (chainId === anvilChainId ? cleanEnv(localRpc) ?? "http://127.0.0.1:8545" : undefined);
  if (!value) throw new Error("NEXT_PUBLIC_WALLET_RPC_URL is required for a non-local target chain.");
  try {
    const url = new URL(value);
    if (!/^https?:\/\//i.test(value) || !/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
  } catch {
    throw new Error("NEXT_PUBLIC_WALLET_RPC_URL must be a valid HTTP(S) URL without embedded credentials.");
  }
  return value;
}

export const targetWalletRpcUrl = resolveWalletRpcUrl(
  targetChainId, process.env.NEXT_PUBLIC_WALLET_RPC_URL, anvilRpcUrl
);

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
