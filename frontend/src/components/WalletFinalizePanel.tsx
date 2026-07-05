"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type Address,
  type EIP1193Provider
} from "viem";
import { useAccount } from "wagmi";
import { ModeBadge } from "@/components/ModeBadge";
import { WalletTransactionStatus } from "@/components/WalletTransactionStatus";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { getFinalizeActionState } from "@/lib/auctionActionState";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { targetChain, targetChainId, targetChainLabel } from "@/lib/chains";
import { fetchDeployment, type Deployment } from "@/lib/deployment";
import { formatTimestamp, shortenAddress } from "@/lib/format";
import {
  awaitingSignatureState,
  confirmedTransactionState,
  failedTransactionState,
  pendingTransactionState,
  type WalletTransactionState
} from "@/lib/walletTransaction";

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
      chain: targetChain,
      transport: custom(provider)
    }),
    walletClient: createWalletClient({
      account,
      chain: targetChain,
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
      `Wallet-signed finalization requires MetaMask access to the target RPC. ${walletErrorMessage(error, "")}`
    );
  }

  if (typeof walletChainId !== "string" || Number.parseInt(walletChainId, 16) !== targetChainId) {
    throw new Error(`Wallet connected, but not on the target chain (${targetChainLabel}).`);
  }
}

export function WalletFinalizePanel({
  auction,
  onFinalizeComplete
}: {
  auction: SerializedAuction;
  onFinalizeComplete: () => Promise<void>;
}) {
  const { address, chainId, isConnected } = useAccount();

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [isDeploymentLoading, setIsDeploymentLoading] = useState(true);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [message, setMessage] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<WalletTransactionState | null>(null);

  const wrongNetwork = isConnected && chainId !== targetChainId;
  const auctionIdBigInt = useMemo(() => (/^\d+$/.test(auction.auctionId) ? BigInt(auction.auctionId) : null), [
    auction.auctionId
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 10_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDeployment() {
      try {
        setIsDeploymentLoading(true);
        const loaded = await fetchDeployment();

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
    setTxStatus(null);
  }, [address, chainId, auction.auctionId]);

  const finalizeState = getFinalizeActionState({
    isConnected,
    wrongNetwork,
    targetChainLabel,
    deploymentLoaded: Boolean(deployment),
    deploymentError,
    auctionIdValid: Boolean(auctionIdBigInt),
    loading: isDeploymentLoading,
    pending: isFinalizing,
    finalized: auction.finalized,
    endTime: auction.endTime,
    nowSeconds
  });

  async function finalizeAuction() {
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
      setIsFinalizing(true);
      setMessage(null);
      setTxStatus(null);

      const liveState = getFinalizeActionState({
        isConnected,
        wrongNetwork,
        targetChainLabel,
        deploymentLoaded: true,
        deploymentError: null,
        auctionIdValid: true,
        finalized: auction.finalized,
        endTime: auction.endTime,
        nowSeconds: Math.floor(Date.now() / 1000)
      });

      if (liveState.disabledReason) {
        throw new Error(liveState.disabledReason);
      }

      const { provider, publicClient, walletClient } = createBrowserClients(address);
      await verifyWalletChain(provider);
      setTxStatus(awaitingSignatureState("Confirm auction finalization in your wallet."));

      const hash = await walletClient.writeContract({
        address: deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "finalizeAuction",
        args: [auctionIdBigInt]
      });

      setTxStatus(pendingTransactionState(hash, "Finalization transaction submitted. Waiting for confirmation."));
      await publicClient.waitForTransactionReceipt({ hash });
      await onFinalizeComplete();
      setMessage("Auction finalized with wallet signature. Auction data refreshed.");
      setTxStatus(confirmedTransactionState(hash, "Auction finalized. Economic state and claim data refreshed."));
    } catch (caught) {
      const failed = failedTransactionState(caught, "Transaction reverted.");
      setTxStatus(failed);
      setMessage(failed.message);
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <section className="rounded-lg border border-sky-400/30 bg-sky-400/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-white">Wallet-signed finalization</h3>
        <ModeBadge variant="wallet-signed" />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100/80">
        MetaMask signs AuctionHouse.finalizeAuction directly after the auction end time. No server private key is used
        and no /api/dev route is called.
      </p>

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

      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
        <InfoItem label="Target chain" value={`${targetChainLabel} (${targetChainId})`} />
        <InfoItem label="Wallet" value={address ? shortenAddress(address) : "Not connected"} mono />
        <InfoItem label="Wallet chain" value={chainId ? String(chainId) : "Not connected"} />
        <InfoItem label="Auction end time" value={formatTimestamp(auction.endTime)} />
        <InfoItem label="Finalized" value={auction.finalized ? "Yes" : "No"} />
        <InfoItem label="AuctionHouse" value={deployment ? shortenAddress(deployment.contracts.auctionHouse) : "Not loaded"} mono />
      </div>

      {finalizeState.disabledReason ? (
        <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {finalizeState.disabledReason}
        </div>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          disabled={Boolean(finalizeState.disabledReason)}
          onClick={finalizeAuction}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFinalizing ? "Finalizing..." : "Finalize auction"}
        </button>
      </div>

      <div className="mt-4">
        <WalletTransactionStatus title="Auction finalization" status={txStatus} />
      </div>

      {message ? <div className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</div> : null}
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
