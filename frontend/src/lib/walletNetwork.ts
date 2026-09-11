import type { EIP1193Provider } from "viem";
import {
  targetBlockExplorerUrl,
  targetChainId,
  targetChainName,
  targetWalletRpcUrl
} from "./chains";

type NativeCurrency = {
  name: string;
  symbol: string;
  decimals: number;
};

export type WalletNetworkConfig = {
  chainId: number;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency?: NativeCurrency;
  blockExplorerUrls?: string[];
};

type AddEthereumChainParameter = {
  chainId: `0x${string}`;
  chainName: string;
  nativeCurrency: NativeCurrency;
  rpcUrls: string[];
  blockExplorerUrls?: string[];
};

const DEFAULT_NATIVE_CURRENCY: NativeCurrency = {
  name: "Ether",
  symbol: "ETH",
  decimals: 18
};

export class WalletNetworkError extends Error {
  code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "WalletNetworkError";
    this.code = code;
  }
}

function cleanValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function providerErrorCode(error: unknown): number | undefined {
  // wagmi/viem may wrap EIP-1193 codes in a cause. Bound traversal, including cycles.
  for (let depth = 0; depth < 8 && error && typeof error === "object"; depth++) {
    const candidate = error as { code?: unknown; cause?: unknown };
    const code = typeof candidate.code === "number" ? candidate.code
      : typeof candidate.code === "string" && candidate.code.trim() ? Number(candidate.code) : undefined;
    if (code !== undefined && Number.isFinite(code)) return code;
    error = candidate.cause;
  }
  return undefined;
}

export function chainIdToHex(chainId: number): `0x${string}` {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new WalletNetworkError("Target chain ID is invalid.");
  }

  return `0x${chainId.toString(16)}`;
}

export function getTargetWalletNetworkConfig(): WalletNetworkConfig {
  return {
    chainId: targetChainId,
    chainName: targetChainName,
    rpcUrls: [targetWalletRpcUrl],
    nativeCurrency: DEFAULT_NATIVE_CURRENCY,
    blockExplorerUrls: targetBlockExplorerUrl ? [targetBlockExplorerUrl] : undefined
  };
}

export function buildAddEthereumChainParams(
  config: WalletNetworkConfig = getTargetWalletNetworkConfig()
): AddEthereumChainParameter {
  const rpcUrls = config.rpcUrls.map((value) => cleanValue(value)).filter(Boolean) as string[];

  if (rpcUrls.length === 0) {
    throw new WalletNetworkError("Target wallet RPC URL is not configured.");
  }

  const blockExplorerUrls = config.blockExplorerUrls
    ?.map((value) => cleanValue(value))
    .filter(Boolean) as string[] | undefined;

  return {
    chainId: chainIdToHex(config.chainId),
    chainName: config.chainName,
    nativeCurrency: config.nativeCurrency ?? DEFAULT_NATIVE_CURRENCY,
    rpcUrls,
    ...(blockExplorerUrls && blockExplorerUrls.length > 0 ? { blockExplorerUrls } : {})
  };
}

export function walletNetworkErrorMessage(error: unknown) {
  if (error instanceof WalletNetworkError) return error.message;

  const code = providerErrorCode(error);

  if (code === 4001) {
    return "Network switch was rejected by the wallet.";
  }

  if (code === -32002) {
    return "A wallet request is already pending. Open your wallet to continue.";
  }

  return "Unable to switch wallet network. Open your connected wallet and try again.";
}

export async function switchToWalletNetwork(
  provider: Pick<EIP1193Provider, "request">,
  config: WalletNetworkConfig = getTargetWalletNetworkConfig()
) {
  const addChainParams = buildAddEthereumChainParams(config);

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: addChainParams.chainId }]
    });
    return;
  } catch (switchError) {
    const code = providerErrorCode(switchError);

    if (code !== 4902) {
      throw new WalletNetworkError(walletNetworkErrorMessage(switchError), code);
    }
  }

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [addChainParams]
    });
  } catch (addError) {
    throw new WalletNetworkError(walletNetworkErrorMessage(addError), providerErrorCode(addError));
  }
}

export async function switchToTargetChain(provider: Pick<EIP1193Provider, "request">) {
  return switchToWalletNetwork(provider, getTargetWalletNetworkConfig());
}
