"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  parseEther,
  type Address,
  type EIP1193Provider
} from "viem";
import { useAccount } from "wagmi";
import { ModeBadge } from "@/components/ModeBadge";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import { anvil } from "@/lib/chains";
import { fetchLocalDeployment, type LocalDeployment } from "@/lib/deployment";
import { formatEth, shortenAddress } from "@/lib/format";

type WindowWithInjectedEthereum = Window & {
  ethereum?: EIP1193Provider;
};

function walletErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const candidate = error as { shortMessage?: unknown; details?: unknown; message?: unknown };

    if (typeof candidate.shortMessage === "string") return candidate.shortMessage;
    if (typeof candidate.details === "string") return candidate.details;
    if (typeof candidate.message === "string") return candidate.message;
  }

  return error instanceof Error ? error.message : fallback;
}

function getInjectedEthereum(): EIP1193Provider {
  if (typeof window === "undefined") {
    throw new Error("Wallet provider not found. Open this page in a browser with MetaMask.");
  }

  const provider = (window as WindowWithInjectedEthereum).ethereum;

  if (!provider) {
    throw new Error("Wallet provider not found. Install or unlock MetaMask.");
  }

  return provider;
}

function createBrowserClients(account: Address) {
  const provider = getInjectedEthereum();

  return {
    provider,
    publicClient: createPublicClient({
      chain: anvil,
      transport: custom(provider)
    }),
    walletClient: createWalletClient({
      account,
      chain: anvil,
      transport: custom(provider)
    })
  };
}

async function verifyWalletChain(provider: EIP1193Provider) {
  let walletChainId: unknown;

  try {
    walletChainId = await provider.request({ method: "eth_chainId" });
  } catch (error) {
    throw new Error(
      `Wallet-signed bidding requires MetaMask access to the target RPC. ${walletErrorMessage(error, "")}`
    );
  }

  if (typeof walletChainId !== "string" || Number.parseInt(walletChainId, 16) !== anvil.id) {
    throw new Error("Wallet connected, but not on Anvil 31337.");
  }
}

function parseBidCapEth(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith("-")) {
    throw new Error("Bid cap must be a valid ETH amount.");
  }

  try {
    return parseEther(trimmed);
  } catch {
    throw new Error("Bid cap must be a valid ETH amount.");
  }
}

export function WalletBidPanel({
  auctionId,
  auctionState,
  onBidComplete
}: {
  auctionId: string;
  auctionState: number;
  onBidComplete: () => Promise<void>;
}) {
  const { address, chainId, isConnected } = useAccount();

  const [deployment, setDeployment] = useState<LocalDeployment | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [isDeploymentLoading, setIsDeploymentLoading] = useState(true);

  const [minimumNextBid, setMinimumNextBid] = useState<bigint | null>(null);
  const [currentCap, setCurrentCap] = useState<bigint | null>(null);
  const [bidCapEth, setBidCapEth] = useState("");

  const [isLoadingBidData, setIsLoadingBidData] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const wrongNetwork = isConnected && chainId !== anvil.id;
  const auctionOpen = auctionState === 0;

  const auctionIdBigInt = useMemo(() => {
    if (!/^\d+$/.test(auctionId)) return null;
    return BigInt(auctionId);
  }, [auctionId]);

  useEffect(() => {
    let active = true;

    async function loadDeployment() {
      try {
        setIsDeploymentLoading(true);
        const loaded = await fetchLocalDeployment();

        if (active) {
          setDeployment(loaded);
          setDeploymentError(null);
        }
      } catch (caught) {
        if (active) {
          setDeployment(null);
          setDeploymentError(caught instanceof Error ? caught.message : "Deployment missing or stale.");
        }
      } finally {
        if (active) {
          setIsDeploymentLoading(false);
        }
      }
    }

    loadDeployment();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setMinimumNextBid(null);
    setCurrentCap(null);
    setTxHash(null);
  }, [address, chainId, auctionId]);

  const parsedBidCap = useMemo(() => {
    try {
      return bidCapEth.trim() ? parseBidCapEth(bidCapEth) : null;
    } catch {
      return null;
    }
  }, [bidCapEth]);

  const valueToSend =
    parsedBidCap !== null && currentCap !== null && parsedBidCap > currentCap ? parsedBidCap - currentCap : 0n;

  const bidValidationError = useMemo(() => {
    if (!auctionOpen) return "Auction is not OPEN.";
    if (!isConnected) return "Wallet not connected.";
    if (wrongNetwork) return "Wallet connected, but not on Anvil 31337.";
    if (deploymentError) return deploymentError;
    if (!deployment) return "Deployment missing or stale.";
    if (!auctionIdBigInt) return "Invalid auction ID.";
    if (minimumNextBid === null || currentCap === null) return "Load wallet bid data before placing a bid.";

    let bidCap: bigint;

    try {
      bidCap = parseBidCapEth(bidCapEth);
    } catch (caught) {
      return caught instanceof Error ? caught.message : "Bid cap must be a valid ETH amount.";
    }

    if (bidCap < minimumNextBid) return "Bid cap must be at least minimumNextBid.";
    if (bidCap <= currentCap) return "Bid cap must be greater than your current cap.";

    return null;
  }, [
    auctionIdBigInt,
    auctionOpen,
    bidCapEth,
    currentCap,
    deployment,
    deploymentError,
    isConnected,
    minimumNextBid,
    wrongNetwork
  ]);

  async function readWalletBidData(successMessage?: string) {
    if (!address) throw new Error("Wallet not connected.");
    if (!deployment) throw new Error("Deployment missing or stale.");
    if (!auctionIdBigInt) throw new Error("Invalid auction ID.");
    if (!auctionOpen) throw new Error("Auction is not OPEN.");
    if (wrongNetwork) throw new Error("Wallet connected, but not on Anvil 31337.");

    try {
      setIsLoadingBidData(true);
      setMessage(null);

      const { provider, publicClient } = createBrowserClients(address);
      await verifyWalletChain(provider);

      const [minimumRequired, walletCap] = await Promise.all([
        publicClient.readContract({
          address: deployment.contracts.auctionHouse,
          abi: auctionHouseAbi,
          functionName: "minimumNextBid",
          args: [auctionIdBigInt]
        }),
        publicClient.readContract({
          address: deployment.contracts.escrowVault,
          abi: escrowVaultAbi,
          functionName: "capOf",
          args: [auctionIdBigInt, address]
        })
      ]);

      setMinimumNextBid(minimumRequired);
      setCurrentCap(walletCap);
      setBidCapEth((current) => current || formatEther(minimumRequired));
      setMessage(successMessage ?? "Wallet bid data loaded.");
    } catch (caught) {
      setMinimumNextBid(null);
      setCurrentCap(null);
      setMessage(walletErrorMessage(caught, "Unable to load wallet bid data."));
    } finally {
      setIsLoadingBidData(false);
    }
  }

  useEffect(() => {
    if (!deployment || !address || wrongNetwork || !auctionOpen) return;

    readWalletBidData().catch((caught) => {
      setMessage(walletErrorMessage(caught, "Unable to load wallet bid data."));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, auctionId, auctionOpen, deployment, wrongNetwork]);

  async function placeWalletBid() {
    if (!address) {
      setMessage("Wallet not connected.");
      return;
    }

    if (!deployment) {
      setMessage("Deployment missing or stale.");
      return;
    }

    if (!auctionIdBigInt) {
      setMessage("Invalid auction ID.");
      return;
    }

    try {
      setIsPlacingBid(true);
      setMessage(null);
      setTxHash(null);

      const newCap = parseBidCapEth(bidCapEth);
      const { provider, publicClient, walletClient } = createBrowserClients(address);

      await verifyWalletChain(provider);

      const [minimumRequired, walletCap] = await Promise.all([
        publicClient.readContract({
          address: deployment.contracts.auctionHouse,
          abi: auctionHouseAbi,
          functionName: "minimumNextBid",
          args: [auctionIdBigInt]
        }),
        publicClient.readContract({
          address: deployment.contracts.escrowVault,
          abi: escrowVaultAbi,
          functionName: "capOf",
          args: [auctionIdBigInt, address]
        })
      ]);

      setMinimumNextBid(minimumRequired);
      setCurrentCap(walletCap);

      if (newCap < minimumRequired) {
        throw new Error("Bid cap must be at least minimumNextBid.");
      }

      if (newCap <= walletCap) {
        throw new Error("Bid cap must be greater than your current cap.");
      }

      const value = newCap - walletCap;

      const hash = await walletClient.writeContract({
        address: deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "placeBid",
        args: [auctionIdBigInt, newCap],
        value
      });

      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });

      setMessage(`Wallet-signed bid placed. Value sent: ${formatEth(value)}.`);
      await onBidComplete();
      await readWalletBidData("Wallet bid data refreshed after successful bid.");
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Transaction reverted."));
    } finally {
      setIsPlacingBid(false);
    }
  }

  const statusMessage = !isConnected
    ? "Wallet not connected."
    : wrongNetwork
      ? "Wallet connected, but not on Anvil 31337."
      : !auctionOpen
        ? "Auction is not OPEN."
        : null;

  return (
    <section className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-white">Wallet-signed bid</h3>
        <ModeBadge variant="wallet-signed" />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-100/80">
        MetaMask signs AuctionHouse.placeBid directly. No server private key is used and no /api/dev route is called.
      </p>

      <div className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300">
        Wallet-signed bidding requires MetaMask access to the target RPC. If Codespaces forwarding is unavailable to
        MetaMask, keep using local-dev actions or expose Anvil through a reliable localhost/testnet RPC.
      </div>

      {isDeploymentLoading ? (
        <div className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">
          Loading deployment data...
        </div>
      ) : null}

      {deploymentError ? (
        <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {deploymentError}
        </div>
      ) : null}

      {statusMessage ? (
        <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {statusMessage}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
        <InfoItem label="Wallet" value={address ? shortenAddress(address) : "Not connected"} mono />
        <InfoItem label="Wallet chain" value={chainId ? String(chainId) : "Not connected"} />
        <InfoItem label="AuctionHouse" value={deployment ? shortenAddress(deployment.contracts.auctionHouse) : "Not loaded"} mono />
        <InfoItem label="Minimum required bid" value={minimumNextBid === null ? "Not loaded" : formatEth(minimumNextBid)} />
        <InfoItem label="Current wallet cap" value={currentCap === null ? "Not loaded" : formatEth(currentCap)} />
        <InfoItem label="Value that will be sent" value={formatEth(valueToSend)} />
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">Bid cap in ETH</span>
          <input
            value={bidCapEth}
            disabled={isLoadingBidData || isPlacingBid}
            onChange={(event) => setBidCapEth(event.target.value)}
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={minimumNextBid === null ? "Load minimum bid" : formatEther(minimumNextBid)}
            inputMode="decimal"
          />
        </label>

        {bidValidationError ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {bidValidationError}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={!isConnected || wrongNetwork || !auctionOpen || !deployment || isLoadingBidData || isPlacingBid}
            onClick={() => readWalletBidData().catch((caught) => setMessage(walletErrorMessage(caught, "Unable to load wallet bid data.")))}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingBidData ? "Loading..." : "Refresh wallet bid data"}
          </button>

          <button
            type="button"
            disabled={Boolean(bidValidationError) || isLoadingBidData || isPlacingBid}
            onClick={placeWalletBid}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPlacingBid ? "Placing bid..." : "Place wallet-signed bid"}
          </button>
        </div>
      </div>

      {message ? <div className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</div> : null}

      {txHash ? <div className="mt-3 break-all font-mono text-xs text-cyan-100/70">tx: {txHash}</div> : null}
    </section>
  );
}

function InfoItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}