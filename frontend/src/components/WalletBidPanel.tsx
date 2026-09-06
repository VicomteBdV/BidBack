"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  type Address,
  type EIP1193Provider
} from "viem";
import { useAccount } from "wagmi";
import { ModeBadge } from "@/components/ModeBadge";
import { TechnicalDisclosure } from "@/components/TechnicalDisclosure";
import { TransactionReview } from "@/components/TransactionReview";
import { StateNotice } from "@/components/ui/StateNotice";
import { WalletTransactionStatus } from "@/components/WalletTransactionStatus";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import { getBidActionState, sameAddress } from "@/lib/auctionActionState";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { targetChain, targetChainId, targetChainLabel } from "@/lib/chains";
import { fetchDeployment, type Deployment } from "@/lib/deployment";
import { formatEth, shortenAddress } from "@/lib/format";
import {
  awaitingSignatureState,
  confirmedTransactionState,
  failedTransactionState,
  pendingTransactionState,
  receiptWasSuccessful,
  refreshingTransactionState,
  revertedTransactionState,
  unknownConfirmationState,
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

function parseChainTimestamp(value?: string) {
  if (!value || !/^\d+$/.test(value)) return undefined;

  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getInjectedEthereum(): EIP1193Provider {
  if (typeof window === "undefined") {
    throw new Error("Wallet provider not found. Open this page in a browser with a compatible wallet.");
  }

  const provider = (window as WindowWithInjectedEthereum).ethereum;

  if (!provider) {
    throw new Error("Wallet provider not found. Install or unlock a compatible browser wallet.");
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
      `Wallet-signed bidding requires your wallet to access the target RPC. ${walletErrorMessage(error, "")}`
    );
  }

  if (typeof walletChainId !== "string" || Number.parseInt(walletChainId, 16) !== targetChainId) {
    throw new Error(`Wallet connected, but not on the target chain (${targetChainLabel}).`);
  }
}

export function WalletBidPanel({
  auction,
  onBidComplete
}: {
  auction: SerializedAuction;
  onBidComplete: () => Promise<void>;
}) {
  const { address, chainId, isConnected } = useAccount();

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [isDeploymentLoading, setIsDeploymentLoading] = useState(true);

  const [minimumNextBid, setMinimumNextBid] = useState<bigint | null>(null);
  const [currentCap, setCurrentCap] = useState<bigint | null>(null);
  const [bidAmountEth, setBidAmountEth] = useState("");

  const [isLoadingBidData, setIsLoadingBidData] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const [isReviewingBid, setIsReviewingBid] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<WalletTransactionState | null>(null);

  const wrongNetwork = isConnected && chainId !== targetChainId;
  const auctionOpen = auction.state === 0;
  const auctionChainTimestamp = parseChainTimestamp(auction.chainTimestamp);

  const auctionIdBigInt = useMemo(() => {
    if (!/^\d+$/.test(auction.auctionId)) return null;
    return BigInt(auction.auctionId);
  }, [auction.auctionId]);

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
    setMinimumNextBid(null);
    setCurrentCap(null);
    setBidAmountEth("");
    setTxStatus(null);
    setIsReviewingBid(false);
  }, [address, chainId, auction.auctionId]);

  const isStepUp = currentCap !== null && currentCap > 0n;
  const bidActionState = getBidActionState({
    isConnected,
    wrongNetwork,
    targetChainLabel,
    deploymentLoaded: Boolean(deployment),
    deploymentError,
    auctionIdValid: Boolean(auctionIdBigInt),
    loading: isLoadingBidData,
    pending: isPlacingBid,
    auctionState: auction.state,
    endTime: auction.endTime,
    nowSeconds: auctionChainTimestamp,
    minimumNextBid,
    currentCap,
    bidAmountEth
  });

  async function readWalletBidData(rethrow = false) {
    if (!address) throw new Error("Wallet not connected.");
    if (!deployment) throw new Error("Deployment missing or stale.");
    if (!auctionIdBigInt) throw new Error("Invalid auction ID.");
    if (!auctionOpen) throw new Error("Auction is not OPEN.");
    if (wrongNetwork) throw new Error(`Wallet connected, but not on the target chain (${targetChainLabel}).`);

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

      const wasStepUp = currentCap !== null && currentCap > 0n;
      const isNextStepUp = walletCap > 0n;
      const defaultAmount = isNextStepUp
        ? minimumRequired > walletCap ? minimumRequired - walletCap : 0n
        : minimumRequired;

      setMinimumNextBid(minimumRequired);
      setCurrentCap(walletCap);
      setBidAmountEth((current) =>
        wasStepUp !== isNextStepUp || !current ? formatEther(defaultAmount) : current
      );
    } catch (caught) {
      setMinimumNextBid(null);
      setCurrentCap(null);
      if (rethrow) throw caught;
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
  }, [address, auction.auctionId, auctionOpen, deployment, wrongNetwork]);

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

    let submittedHash: `0x${string}` | null = null;

    try {
      setIsPlacingBid(true);
      setMessage(null);
      setTxStatus(null);

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

      const latestBlock = await publicClient.getBlock({ blockTag: "latest" });

      const liveActionState = getBidActionState({
        isConnected,
        wrongNetwork,
        targetChainLabel,
        deploymentLoaded: true,
        deploymentError: null,
        auctionIdValid: true,
        auctionState: auction.state,
        endTime: auction.endTime,
        nowSeconds: latestBlock.timestamp,
        minimumNextBid: minimumRequired,
        currentCap: walletCap,
        bidAmountEth
      });

      if (liveActionState.disabledReason || liveActionState.parsedBidCap === null) {
        throw new Error(liveActionState.disabledReason ?? "Bid amount must be a valid ETH amount.");
      }

      setTxStatus(awaitingSignatureState("Confirm wallet-signed bid in your wallet."));

      const hash = await walletClient.writeContract({
        address: deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "placeBid",
        args: [auctionIdBigInt, liveActionState.parsedBidCap],
        value: liveActionState.valueToSend
      });
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "Bid transaction submitted. Waiting for confirmation."));
      let receipt;

      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash });
      } catch (caught) {
        setTxStatus(unknownConfirmationState(hash, caught));
        return;
      }

      if (!receiptWasSuccessful(receipt)) {
        setTxStatus(revertedTransactionState(hash));
        return;
      }

      setTxStatus(refreshingTransactionState(hash, "Bid confirmed on-chain. Refreshing the auction and wallet cap."));
      let refreshIncomplete = false;

      try {
        await onBidComplete();
      } catch {
        refreshIncomplete = true;
      }

      try {
        await readWalletBidData(true);
      } catch {
        refreshIncomplete = true;
      }

      setIsReviewingBid(false);
      setTxStatus(
        refreshIncomplete
          ? confirmedTransactionState(
              hash,
              `Bid placed with ${formatEth(liveActionState.valueToSend)} sent, but displayed data could not be fully refreshed.`,
              "Refresh the auction and wallet bid data before your next action."
            )
          : confirmedTransactionState(
              hash,
              `Bid placed with ${formatEth(liveActionState.valueToSend)} sent.`,
              "Monitor the auction or review a later increase if you are outbid."
            )
      );
    } catch (caught) {
      const failed = submittedHash
        ? unknownConfirmationState(submittedHash, caught)
        : failedTransactionState(caught, "Bid transaction failed before submission.");
      setTxStatus(failed);
    } finally {
      setIsPlacingBid(false);
    }
  }

  const highestBidderStatus = address && sameAddress(address, auction.highestBidder)
    ? "Your wallet is currently the highest bidder"
    : auction.highestBid === "0"
      ? "No bid is currently recorded"
      : "Another wallet is currently the highest bidder";

  const statusMessage = !isConnected
    ? "Wallet not connected."
    : wrongNetwork
      ? `Wallet connected, but not on the target chain (${targetChainLabel}).`
      : !auctionOpen
        ? "Auction is not OPEN."
        : null;

  return (
    <section aria-busy={isDeploymentLoading || isLoadingBidData || isPlacingBid} className="min-w-0 rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-white">{isStepUp ? "Increase bid" : "Place bid"}</h3>
        <ModeBadge variant="wallet-signed" />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-100/80">
        {isStepUp
          ? "Enter the additional ETH to add to your current cap, review the new total, then confirm in your wallet."
          : "Set the total cap you intend to commit, review it, then confirm the transaction in your wallet."}
      </p>

      {isDeploymentLoading ? (
        <StateNotice tone="loading" title="Loading deployment data" className="mt-4">
          Preparing wallet-signed bid reads.
        </StateNotice>
      ) : null}

      {deploymentError ? (
        <StateNotice tone="error" title="Bid deployment data is unavailable" className="mt-4">
          {deploymentError}
        </StateNotice>
      ) : null}

      {statusMessage ? (
        <StateNotice tone="warning" title="Wallet bid unavailable" className="mt-4">
          {statusMessage}
        </StateNotice>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
        <InfoItem label="Wallet" value={address ? shortenAddress(address) : "Not connected"} mono />
        <InfoItem label="Minimum required total cap" value={minimumNextBid === null ? "Not loaded" : formatEth(minimumNextBid)} />
        <InfoItem label="Current wallet cap" value={currentCap === null ? "Not loaded" : formatEth(currentCap)} />
        <InfoItem label={isStepUp ? "Additional amount" : "Amount sent"} value={formatEth(bidActionState.valueToSend)} />
        <InfoItem label="New total cap" value={bidActionState.parsedBidCap === null ? "Not available" : formatEth(bidActionState.parsedBidCap)} />
      </div>

      <TechnicalDisclosure
        summary="Bid network and contract details"
        description="Technical connection details for diagnosing wallet-signed bidding."
        className="mt-4"
      >
        <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-3">
          <InfoItem label="Target chain" value={`${targetChainLabel} (${targetChainId})`} />
          <InfoItem label="Wallet chain" value={chainId ? String(chainId) : "Not connected"} />
          <InfoItem label="AuctionHouse" value={deployment ? shortenAddress(deployment.contracts.auctionHouse) : "Not loaded"} mono />
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          Wallet-signed bidding requires your wallet to access the target RPC for {targetChainLabel}. In Codespaces with local
          Anvil, a browser wallet may not reach the forwarded RPC reliably; use local-dev actions there or expose Anvil through a
          reliable localhost/testnet RPC.
        </p>
      </TechnicalDisclosure>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-2" htmlFor="wallet-bid-cap">
          <span className="text-sm font-medium text-slate-200">
            {isStepUp ? "Additional amount in ETH" : "Bid cap in ETH"}
          </span>
          <input
            id="wallet-bid-cap"
            value={bidAmountEth}
            disabled={isLoadingBidData || isPlacingBid}
            aria-describedby={bidActionState.disabledReason ? "wallet-bid-disabled-reason" : "wallet-bid-help"}
            onChange={(event) => {
              setBidAmountEth(event.target.value);
              setIsReviewingBid(false);
            }}
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={minimumNextBid === null
              ? "Load minimum bid"
              : formatEther(isStepUp && currentCap !== null && minimumNextBid > currentCap
                ? minimumNextBid - currentCap
                : minimumNextBid)}
            inputMode="decimal"
          />
        </label>
        <p id="wallet-bid-help" className="text-xs leading-5 text-cyan-100/70">
          {isStepUp
            ? "Enter only the amount to add. The new total cap is calculated from your current cap."
            : "Enter the total cap for your first bid. The same amount is sent with the transaction."}
        </p>

        {bidActionState.disabledReason ? (
          <StateNotice id="wallet-bid-disabled-reason" tone="warning" title="Bid action unavailable">
            {bidActionState.disabledReason}
          </StateNotice>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={!isConnected || wrongNetwork || !auctionOpen || !deployment || isLoadingBidData || isPlacingBid}
            onClick={() => readWalletBidData().catch((caught) => setMessage(walletErrorMessage(caught, "Unable to load wallet bid data.")))}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {isLoadingBidData ? "Loading..." : "Refresh wallet bid data"}
          </button>

          <button
            type="button"
            disabled={Boolean(bidActionState.disabledReason)}
            onClick={() => setIsReviewingBid(true)}
            aria-describedby={bidActionState.disabledReason ? "wallet-bid-disabled-reason" : undefined}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {isStepUp ? "Review increase" : "Review bid"}
          </button>
        </div>
      </div>

      {isReviewingBid ? (
        <div className="mt-4">
          <TransactionReview
            title={isStepUp ? "Review increase bid" : "Review place bid"}
            description={isStepUp
              ? "Review the added amount and new total cap before opening your wallet. The live preflight recalculates the total from fresh on-chain values."
              : "Review the total cap before opening your wallet. The live preflight remains authoritative when you continue."}
            items={[
              { label: "Auction", value: `#${auction.auctionId}` },
              { label: "NFT", value: auction.nftMetadata?.metadataName ?? `${shortenAddress(auction.nft)} #${auction.tokenId}` },
              { label: "Current highest bid", value: formatEth(auction.highestBid) },
              { label: "Minimum valid total cap", value: minimumNextBid === null ? "Not loaded" : formatEth(minimumNextBid) },
              { label: "Your current deposited cap", value: currentCap === null ? "Not loaded" : formatEth(currentCap) },
              { label: isStepUp ? "Amount added" : "Entered total cap", value: formatEth(bidActionState.valueToSend) },
              { label: "Your new total cap", value: bidActionState.parsedBidCap === null ? "Not available" : formatEth(bidActionState.parsedBidCap) },
              { label: "ETH sent in this transaction", value: formatEth(bidActionState.valueToSend) },
              { label: "Network gas", value: "Separate; shown by your wallet" },
              { label: "Highest bidder status", value: highestBidderStatus }
            ]}
            confirmations="Currently expected: 1 wallet confirmation"
            note="If you do not win, your full resulting cap remains refundable after finalization. Conditional redistribution is separate and may be zero."
            primaryLabel="Continue in wallet"
            busy={isPlacingBid}
            disabled={Boolean(bidActionState.disabledReason) || txStatus?.phase === "confirmation-unknown"}
            onBack={() => setIsReviewingBid(false)}
            onConfirm={placeWalletBid}
          />
        </div>
      ) : null}

      <div className="mt-4">
        <WalletTransactionStatus title="Wallet bid" status={txStatus} />
      </div>

      {message ? <div role="status" aria-live="polite" className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</div> : null}
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
