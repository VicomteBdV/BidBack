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

type WindowWithInjectedEthereum = Window & {
  ethereum?: EIP1193Provider;
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

function providerErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return undefined;

  const candidate = error as { code?: unknown };

  if (typeof candidate.code === "number") return candidate.code;

  if (typeof candidate.code === "string") {
    const parsed = Number(candidate.code);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function providerErrorDetail(error: unknown) {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "";
  }

  const candidate = error as {
    shortMessage?: unknown;
    details?: unknown;
    message?: unknown;
  };

  if (typeof candidate.shortMessage === "string") return candidate.shortMessage;
  if (typeof candidate.details === "string") return candidate.details;
  if (typeof candidate.message === "string") return candidate.message;

  return error instanceof Error ? error.message : "";
}

export function chainIdToHex(chainId: number): `0x${string}` {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new WalletNetworkError("Target chain ID is invalid.");
  }

  return `0x${chainId.toString(16)}`;
}

export function getInjectedEthereumProvider(): EIP1193Provider {
  if (typeof window === "undefined") {
    throw new WalletNetworkError("Wallet provider is not available in this environment.");
  }

  const provider = (window as WindowWithInjectedEthereum).ethereum;

  if (!provider) {
    throw new WalletNetworkError("Wallet provider not found. Install or unlock an injected wallet.");
  }

  return provider;
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

  const detail = providerErrorDetail(error);

  return detail ? `Unable to switch wallet network. ${detail}` : "Unable to switch wallet network.";
}

export async function switchToWalletNetwork(
  provider: EIP1193Provider,
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

export async function switchToTargetChain(provider: EIP1193Provider) {
  return switchToWalletNetwork(provider, getTargetWalletNetworkConfig());
}
