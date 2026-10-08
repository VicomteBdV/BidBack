"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  encodeFunctionData,
  type Address,
  type EIP1193Provider
} from "viem";
import { useAccount, useConfig } from "wagmi";
import { createConnectedWalletClients } from "@/lib/walletProvider";
import { ModeBadge } from "@/components/ModeBadge";
import { TechnicalDisclosure } from "@/components/TechnicalDisclosure";
import { TransactionReview } from "@/components/TransactionReview";
import { StateNotice } from "@/components/ui/StateNotice";
import { WalletTransactionStatus } from "@/components/WalletTransactionStatus";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { getFinalizeActionState } from "@/lib/auctionActionState";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { targetChainId, targetChainLabel } from "@/lib/chains";
import { fetchDeployment, type Deployment } from "@/lib/deployment";
import { formatTimestamp, shortenAddress } from "@/lib/format";
import {
  awaitingSignatureState,
  confirmedTransactionState,
  failedTransactionState,
  pendingTransactionState,
  confirmWalletTransaction,
  matchingWalletActionEvents,
  refreshingTransactionState,
  unknownConfirmationState,
  walletConfirmationState,
  walletTransactionSubmission,
  type WalletConfirmationResult,
  type WalletTransactionSubmission,
  type WalletTransactionState
} from "@/lib/walletTransaction";

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

async function verifyWalletChain(provider: Pick<EIP1193Provider, "request">) {
  let walletChainId: unknown;

  try {
    walletChainId = await provider.request({ method: "eth_chainId" });
  } catch (error) {
    throw new Error(
      `Wallet-signed finalization requires your wallet to access the target RPC. ${walletErrorMessage(error, "")}`
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
  const { address, chainId, isConnected, connector } = useAccount();
  const config = useConfig();

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [isDeploymentLoading, setIsDeploymentLoading] = useState(true);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<WalletTransactionState | null>(null);
  const recovery = useRef<{ submission: WalletTransactionSubmission; contextKey: string } | null>(null);
  const contextKey = `${address}:${chainId}:${connector?.uid}:${auction.auctionId}`;
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;

  const wrongNetwork = isConnected && chainId !== targetChainId;
  const auctionChainTimestamp = parseChainTimestamp(auction.chainTimestamp);
  const auctionIdBigInt = useMemo(() => (/^\d+$/.test(auction.auctionId) ? BigInt(auction.auctionId) : null), [
    auction.auctionId
  ]);

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
    if (!recovery.current) setTxStatus(null);
    else setTxStatus(unknownConfirmationState(recovery.current.submission.effectiveHash));
    setIsReviewing(false);
  }, [address, chainId, connector?.uid, auction.auctionId]);

  const finalizeState = getFinalizeActionState({
    isConnected,
    wrongNetwork,
    targetChainLabel,
    deploymentLoaded: Boolean(deployment),
    deploymentError,
    auctionIdValid: Boolean(auctionIdBigInt),
    loading: isDeploymentLoading,
    pending: isFinalizing || txStatus?.phase === "confirmation-unknown" || txStatus?.phase === "confirmed",
    finalized: auction.finalized,
    auctionState: auction.state,
    endTime: auction.endTime,
    nowSeconds: auctionChainTimestamp
  });

  async function finishConfirmation(result: WalletConfirmationResult, submittedContext: string) {
    if (activeContext.current !== submittedContext) return;
    if (result.outcome !== "confirmed") {
      if (result.outcome !== "unknown") recovery.current = null;
      setTxStatus(walletConfirmationState(result)); return;
    }
    const hash = result.submission.effectiveHash;
    setTxStatus(refreshingTransactionState(hash, "Finalization confirmed on-chain. Refreshing lifecycle and claim data."));
    let refreshIncomplete = false;
    try { await onFinalizeComplete(); } catch { refreshIncomplete = true; }
    if (activeContext.current !== submittedContext) return;
    recovery.current = null;
    setIsReviewing(false);
    setTxStatus({ ...confirmedTransactionState(hash,
      refreshIncomplete ? "Auction finalized, but displayed lifecycle and claim data could not be fully refreshed." : "Auction finalized.",
      refreshIncomplete ? "Refresh the auction before starting a claim or withdrawal."
        : "Eligible wallets can now use the separate pull-based claim and withdrawal actions.", refreshIncomplete),
      technicalDetail: hash !== result.submission.originalHash ? `Originally submitted as ${result.submission.originalHash}.` : undefined });
  }

  async function verifyTransaction() {
    const stored = recovery.current;
    if (!stored || stored.contextKey !== contextKey || isFinalizing) return;
    try {
      setIsFinalizing(true);
      const { publicClient } = await createConnectedWalletClients(config, connector, stored.submission.intent.account);
      await finishConfirmation(await confirmWalletTransaction(publicClient, stored.submission, { recheck: true }), stored.contextKey);
    } catch { setTxStatus(unknownConfirmationState(stored.submission.effectiveHash)); }
    finally { setIsFinalizing(false); }
  }

  async function refreshConfirmedData() {
    if (isRefreshingData) return;
    const submittedContext = contextKey;
    try {
      setIsRefreshingData(true);
      await onFinalizeComplete();
      if (activeContext.current === submittedContext) setTxStatus((current) => current?.phase === "confirmed"
        ? { ...current, refreshIncomplete: false, message: "Auction finalized.", nextAction: "Review the refreshed lifecycle and claim data." }
        : current);
    } catch { /* Retain the verified result and refresh warning. */ }
    finally { setIsRefreshingData(false); }
  }

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

    let submittedHash: `0x${string}` | null = null;

    try {
      setIsFinalizing(true);
      setMessage(null);
      setTxStatus(null);

      const { provider, publicClient, walletClient } = await createConnectedWalletClients(config, connector, address);
      await verifyWalletChain(provider);
      const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
      const liveAuction = await publicClient.readContract({
        address: deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "getAuction",
        args: [auctionIdBigInt],
        blockNumber: latestBlock.number
      });
      const liveAuctionState = liveAuction.state;
      if (liveAuctionState !== 0 && liveAuctionState !== 1 && liveAuctionState !== 2) {
        throw new Error("Auction state is unavailable.");
      }

      const liveState = getFinalizeActionState({
        isConnected,
        wrongNetwork,
        targetChainLabel,
        deploymentLoaded: true,
        deploymentError: null,
        auctionIdValid: true,
        finalized: liveAuction.state === 2,
        auctionState: liveAuctionState,
        endTime: liveAuction.endTime,
        nowSeconds: latestBlock.timestamp
      });

      if (liveState.disabledReason) {
        setMessage(liveState.disabledReason);
        setIsReviewing(false);
        try { await onFinalizeComplete(); } catch { /* Preserve the on-chain explanation if refresh fails. */ }
        return;
      }

      setTxStatus(awaitingSignatureState("Confirm auction finalization in your wallet."));

      const request = {
        address: deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "finalizeAuction" as const,
        args: [auctionIdBigInt] as const
      };
      const intent = Object.freeze({ chainId: targetChainId, account: address, to: request.address,
        data: encodeFunctionData(request), value: 0n });
      const proof = { abi: auctionHouseAbi, eventName: "AuctionFinalized", address: request.address,
        expected: Object.freeze({ auctionId: auctionIdBigInt }) };
      const hash = await walletClient.writeContract(request);
      submittedHash = hash;
      const submission = walletTransactionSubmission(hash, intent,
        (receipt) => matchingWalletActionEvents(receipt, proof).length === 1 ? {} : null);
      recovery.current = { submission, contextKey };
      if (activeContext.current === contextKey) setTxStatus(pendingTransactionState(hash, "Finalization transaction submitted. Waiting for confirmation."));
      else setTxStatus(unknownConfirmationState(hash));
      await finishConfirmation(await confirmWalletTransaction(publicClient, submission), contextKey);
    } catch (caught) {
      const failed = submittedHash
        ? unknownConfirmationState(submittedHash, caught)
        : failedTransactionState(caught, "Finalization failed before submission.");
      setTxStatus(failed);
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <section aria-busy={isDeploymentLoading || isFinalizing || isRefreshingData} className="min-w-0 rounded-lg border border-sky-400/30 bg-sky-400/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-white">Finalize auction</h3>
        <ModeBadge variant="wallet-signed" />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100/80">
        Complete the expired auction on-chain so eligible wallets can use the separate pull-based actions that follow.
      </p>

      {isDeploymentLoading ? (
        <StateNotice tone="loading" title="Loading deployment data" className="mt-4">
          Preparing the wallet-signed finalization check.
        </StateNotice>
      ) : null}

      {deploymentError ? (
        <StateNotice tone="error" title="Finalization deployment data is unavailable" className="mt-4">
          {deploymentError}
        </StateNotice>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
        <InfoItem label="Wallet" value={address ? shortenAddress(address) : "Not connected"} mono />
        <InfoItem label="Auction end time" value={formatTimestamp(auction.endTime)} />
        <InfoItem label="Finalized" value={auction.finalized ? "Yes" : "No"} />
      </div>

      <TechnicalDisclosure
        summary="Finalization network and contract details"
        description="Technical connection details for diagnosing permissionless finalization."
        className="mt-4"
      >
        <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-3">
          <InfoItem label="Target chain" value={`${targetChainLabel} (${targetChainId})`} />
          <InfoItem label="Wallet chain" value={chainId ? String(chainId) : "Not connected"} />
          <InfoItem label="AuctionHouse" value={deployment ? shortenAddress(deployment.contracts.auctionHouse) : "Not loaded"} mono />
        </div>
      </TechnicalDisclosure>

      {finalizeState.disabledReason ? (
        <StateNotice id="wallet-finalize-disabled-reason" tone="warning" title="Finalization unavailable" className="mt-4">
          {finalizeState.disabledReason}
        </StateNotice>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          disabled={Boolean(finalizeState.disabledReason)}
          aria-describedby={finalizeState.disabledReason ? "wallet-finalize-disabled-reason" : undefined}
          onClick={() => setIsReviewing(true)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isFinalizing ? "Finalizing..." : "Review finalization"}
        </button>
      </div>

      {isReviewing ? (
        <div className="mt-4">
          <TransactionReview
            title="Finalize auction"
            description="The auction has expired and still requires an on-chain finalization transaction. Any wallet may perform this permissionless action."
            items={[
              { label: "Auction", value: `#${auction.auctionId}` },
              { label: "End time", value: formatTimestamp(auction.endTime) },
              { label: "Caller", value: address ? shortenAddress(address) : "Not connected", mono: true },
              { label: "Caller payment", value: "No automatic payment or compensation" },
              { label: "Effect", value: "Fixes the result and unlocks separate pull-based actions" },
              { label: "Network gas", value: "Separate; shown by your wallet" }
            ]}
            confirmations="Currently expected: 1 wallet confirmation"
            note="Finalization does not automatically send the NFT, refunds, redistribution, proceeds, or protocol fees. Eligible wallets claim each item separately."
            primaryLabel="Continue in wallet"
            busy={isFinalizing}
            disabled={Boolean(finalizeState.disabledReason) || txStatus?.phase === "confirmation-unknown"}
            onBack={() => setIsReviewing(false)}
            onConfirm={finalizeAuction}
          />
        </div>
      ) : null}

      <div className="mt-4">
        <WalletTransactionStatus title="Auction finalization" status={txStatus} />
        {txStatus?.phase === "confirmation-unknown" ? <div className="mt-3">
          <button type="button" onClick={verifyTransaction}
            disabled={isFinalizing || recovery.current?.contextKey !== contextKey}
            className="min-h-11 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 disabled:opacity-50">
            {isFinalizing ? "Verifying..." : "Verify transaction"}
          </button>
          <p className="mt-2 text-xs text-slate-300">Verification only reads on-chain evidence. Return to the submitting wallet, network and auction if they changed.</p>
        </div> : null}
        {txStatus?.refreshIncomplete ? <button type="button" onClick={refreshConfirmedData} disabled={isRefreshingData}
          className="mt-3 min-h-11 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 disabled:opacity-50">
          {isRefreshingData ? "Refreshing..." : "Refresh auction data"}
        </button> : null}
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
