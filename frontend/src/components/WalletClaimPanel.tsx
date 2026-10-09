"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  encodeFunctionData,
  type Abi,
  type Address,
  type EIP1193Provider,
  type PublicClient
} from "viem";
import { useAccount, useConfig } from "wagmi";
import { assertAuctionReferenceBlock, displayedWalletAuctionIdentity, preflightWalletAuctionIdentity, walletAuctionIdentityKey, WalletAuctionIdentityError, type AuctionReferenceBlock } from "@/lib/walletAuctionIdentity";
import { createConnectedWalletClients } from "@/lib/walletProvider";
import { ModeBadge } from "@/components/ModeBadge";
import { TechnicalDisclosure } from "@/components/TechnicalDisclosure";
import { TransactionReview, type TransactionReviewItem } from "@/components/TransactionReview";
import { StateNotice } from "@/components/ui/StateNotice";
import { WalletTransactionStatus } from "@/components/WalletTransactionStatus";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import {
  getClaimNftActionState,
  getClaimRefundActionState,
  getClaimRewardActionState,
  getWithdrawProtocolFeesActionState,
  getWithdrawSellerActionState,
  sameAddress
} from "@/lib/auctionActionState";
import { targetChainId, targetChainLabel } from "@/lib/chains";
import { fetchDeployment, type Deployment } from "@/lib/deployment";
import { formatEth, isZeroAddress, shortenAddress } from "@/lib/format";
import type { SerializedAuction } from "@/lib/auctionTypes";
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
  type WalletTransactionIntent,
  type WalletTransactionSubmission,
  type WalletTransactionState
} from "@/lib/walletTransaction";

type ClaimAction =
  | "claim-nft"
  | "claim-refund"
  | "claim-reward"
  | "withdraw-seller"
  | "withdraw-fees";

type AuctionClaimAction = Extract<ClaimAction, `claim-${string}`>;
const claimActions: ClaimAction[] = ["claim-nft", "claim-refund", "claim-reward", "withdraw-seller", "withdraw-fees"];
function isAuctionClaim(action: ClaimAction): action is AuctionClaimAction { return action.startsWith("claim-"); }
type ActionContext = { key: string; revision: number };
type ActionSnapshot = ActionContext & { action: ClaimAction; walletKey: string; auctionId: string; pageKey: string };
type ClaimReadContext = { refund: ActionSnapshot; reward: ActionSnapshot; global: ActionSnapshot };

function dispatchDeploymentKey(value: Deployment | null, action: ClaimAction) {
  if (!value) return "unloaded";
  const addresses = isAuctionClaim(action) ? [value.contracts.auctionHouse] : [];
  if (action === "claim-refund" || !isAuctionClaim(action)) addresses.push(value.contracts.escrowVault);
  if (action === "claim-reward") addresses.push(value.contracts.distributionVault);
  return [value.chainId, ...addresses.map((address) => address.toLowerCase())].join(":");
}

function isAmount(value: unknown): value is bigint { return typeof value === "bigint" && value >= 0n && value < (1n << 256n); }
function isFlag(value: unknown): value is boolean { return typeof value === "boolean"; }

type WalletClaimData = {
  refundableAmount: bigint | null;
  refundClaimed: boolean | null;
  rewardEntitlement: bigint | null;
  rewardClaimed: boolean | null;
  sellerCredit: bigint | null;
  protocolFeeCredit: bigint | null;
  unavailable: boolean;
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

async function verifyWalletChain(provider: Pick<EIP1193Provider, "request">) {
  let walletChainId: unknown;

  try {
    walletChainId = await provider.request({ method: "eth_chainId" });
  } catch (error) {
    throw new Error(
      `Wallet-signed claims require your wallet to access the target RPC. ${walletErrorMessage(error, "")}`
    );
  }

  if (typeof walletChainId !== "string" || !/^0x[0-9a-f]+$/i.test(walletChainId) || BigInt(walletChainId) !== BigInt(targetChainId)) {
    throw new Error(`Wallet connected, but not on the target chain (${targetChainLabel}).`);
  }
  return targetChainId;
}

export function WalletClaimPanel({
  auction,
  expectedChainId,
  expectedAuctionHouse,
  onActionComplete
}: {
  auction: SerializedAuction;
  expectedChainId: number;
  expectedAuctionHouse: Address;
  onActionComplete: () => Promise<void>;
}) {
  const { address, chainId, isConnected, connector } = useAccount();
  const config = useConfig();

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [isDeploymentLoading, setIsDeploymentLoading] = useState(true);

  const [refundableAmount, setRefundableAmount] = useState<bigint | null>(null);
  const [refundClaimed, setRefundClaimed] = useState<boolean | null>(null);
  const [rewardEntitlement, setRewardEntitlement] = useState<bigint | null>(null);
  const [rewardClaimed, setRewardClaimed] = useState<boolean | null>(null);
  const [sellerCredit, setSellerCredit] = useState<bigint | null>(null);
  const [protocolFeeCredit, setProtocolFeeCredit] = useState<bigint | null>(null);

  const [isLoadingClaimData, setIsLoadingClaimData] = useState(false);
  const [pendingAction, setPendingAction] = useState<ClaimAction | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [completedClaims, setCompletedClaims] = useState<ClaimAction[]>([]);
  const [selectedAction, setSelectedAction] = useState<ClaimAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [claimDataMessage, setClaimDataMessage] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<WalletTransactionState | null>(null);
  const recovery = useRef<{ submission: WalletTransactionSubmission; context: ActionSnapshot;
    successMessage: string; nextAction: string; refreshingMessage: string; action: ClaimAction } | null>(null);
  const identity = useMemo(() => {
    try { return displayedWalletAuctionIdentity(expectedChainId, expectedAuctionHouse, auction); }
    catch { return null; }
  }, [expectedChainId, expectedAuctionHouse, auction.auctionId, auction.seller, auction.nft,
    auction.tokenId, auction.startPrice, auction.startTime, auction.initialEndTime]);
  const pageKey = identity ? walletAuctionIdentityKey(identity) : JSON.stringify([expectedChainId, expectedAuctionHouse,
    auction.auctionId, auction.seller, auction.nft, auction.tokenId, auction.startPrice, auction.startTime, auction.initialEndTime]);
  const walletKey = `${isConnected}:${address?.toLowerCase()}:${chainId}:${connector?.uid}`;
  const contextKeys = Object.fromEntries(claimActions.map((action) => [action,
    `${walletKey}:${isAuctionClaim(action) ? `${pageKey}:` : ""}${dispatchDeploymentKey(deployment, action)}`])) as Record<ClaimAction, string>;
  const activeContext = useRef({ walletKey, pageKey, connector, actions: Object.fromEntries(claimActions.map((action) =>
    [action, { key: contextKeys[action], revision: 0 }])) as Record<ClaimAction, ActionContext> });
  for (const action of claimActions) {
    const previous = activeContext.current.actions[action];
    if (previous.key !== contextKeys[action] || activeContext.current.connector !== connector) {
      activeContext.current.actions[action] = { key: contextKeys[action], revision: previous.revision + 1 };
    }
  }
  activeContext.current.walletKey = walletKey;
  activeContext.current.pageKey = pageKey;
  activeContext.current.connector = connector;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false;
    for (const action of claimActions) activeContext.current.actions[action].revision += 1;
  }; }, []);
  const claimLoadRevision = useRef(0);
  const statusContext = useRef<ActionSnapshot | null>(null);
  const historicalTransaction = Boolean(txStatus && statusContext.current && isAuctionClaim(statusContext.current.action) &&
    statusContext.current.key !== contextKeys[statusContext.current.action]);
  const globalTransaction = Boolean(txStatus && statusContext.current && !isAuctionClaim(statusContext.current.action));

  const wrongNetwork = isConnected && chainId !== targetChainId;
  const auctionIdBigInt = useMemo(() => (/^\d+$/.test(auction.auctionId) ? BigInt(auction.auctionId) : null), [
    auction.auctionId
  ]);

  const expectedNftClaimant = isZeroAddress(auction.highestBidder) ? auction.seller : auction.highestBidder;
  const expectedNftClaimantLabel = isZeroAddress(auction.highestBidder) ? "seller" : "winner";

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
    setRefundableAmount(null);
    setRefundClaimed(null);
    setRewardEntitlement(null);
    setRewardClaimed(null);
    setSelectedAction((current) => current && isAuctionClaim(current) ? null : current);
    setCompletedClaims([]);
  }, [contextKeys["claim-refund"], contextKeys["claim-reward"]]);

  useEffect(() => {
    setSellerCredit(null);
    setProtocolFeeCredit(null);
    setSelectedAction(null);
  }, [contextKeys["withdraw-seller"]]);

  useEffect(() => {
    if (recovery.current && recovery.current.context.key !== contextKeys[recovery.current.action]) {
      setTxStatus(walletConfirmationState({ outcome: "unknown", submission: recovery.current.submission }));
    }
    setMessage(null);
    setClaimDataMessage(null);
  }, [pageKey, walletKey, deployment]);

  function requireWalletContext() {
    if (!address) throw new Error("Wallet not connected.");
    if (wrongNetwork) throw new Error(`Wallet connected, but not on the target chain (${targetChainLabel}).`);
    if (!deployment) throw new Error("Deployment missing or stale.");
    if (!auctionIdBigInt) throw new Error("Invalid auction ID.");

    return {
      account: address,
      deployment,
      auctionId: auctionIdBigInt
    };
  }

  function snapshotAction(action: ClaimAction): ActionSnapshot {
    return { action, key: contextKeys[action], revision: activeContext.current.actions[action].revision,
      walletKey, pageKey, auctionId: auction.auctionId };
  }

  function currentSnapshot(snapshot: ActionSnapshot, checkRevision = true) {
    const current = activeContext.current.actions[snapshot.action];
    return mounted.current && current.key === snapshot.key && (!checkRevision || current.revision === snapshot.revision);
  }

  function assertCurrentSnapshot(snapshot: ActionSnapshot) {
    if (!currentSnapshot(snapshot)) throw new WalletAuctionIdentityError("context");
  }

  function snapshotClaimReads(): ClaimReadContext {
    return { refund: snapshotAction("claim-refund"), reward: snapshotAction("claim-reward"), global: snapshotAction("withdraw-seller") };
  }

  async function prepareAuctionClaim(action: AuctionClaimAction) {
    const context = requireWalletContext();
    const snapshot = snapshotAction(action);
    statusContext.current = snapshot;
    assertCurrentSnapshot(snapshot);
    const clients = await createConnectedWalletClients(config, connector, context.account);
    assertCurrentSnapshot(snapshot);
    const selectedChainId = await verifyWalletChain(clients.provider);
    assertCurrentSnapshot(snapshot);
    if (!identity) throw new WalletAuctionIdentityError("context");
    const checked = await preflightWalletAuctionIdentity(clients.publicClient, identity, {
      targetChainId, selectedChainId, deploymentChainId: context.deployment.chainId,
      auctionHouse: context.deployment.contracts.auctionHouse
    });
    assertCurrentSnapshot(snapshot);
    return { context, snapshot, ...clients, ...checked };
  }

  async function beforeSignature(snapshot: ActionSnapshot, context: ReturnType<typeof requireWalletContext>,
    provider: Pick<EIP1193Provider, "request">, publicClient: PublicClient, referenceBlock?: AuctionReferenceBlock) {
    if (referenceBlock) await assertAuctionReferenceBlock(publicClient, referenceBlock);
    let fresh: Deployment;
    try { fresh = await fetchDeployment(); } catch { throw new WalletAuctionIdentityError("unavailable"); }
    if (dispatchDeploymentKey(fresh, snapshot.action) !== dispatchDeploymentKey(context.deployment, snapshot.action)) {
      throw new WalletAuctionIdentityError("context");
    }
    await verifyWalletChain(provider);
    assertCurrentSnapshot(snapshot);
  }

  async function readClaimEligibility(publicClient: PublicClient, context: ReturnType<typeof requireWalletContext>,
    action: "claim-refund" | "claim-reward", referenceBlock: AuctionReferenceBlock) {
    let values: readonly unknown[];
    try {
      values = action === "claim-refund" ? await Promise.all([
        publicClient.readContract({ address: context.deployment.contracts.escrowVault, abi: escrowVaultAbi,
          functionName: "refundableAmount", args: [context.auctionId, context.account], blockNumber: referenceBlock.number }),
        publicClient.readContract({ address: context.deployment.contracts.escrowVault, abi: escrowVaultAbi,
          functionName: "refundClaimed", args: [context.auctionId, context.account], blockNumber: referenceBlock.number })
      ]) : await Promise.all([
        publicClient.readContract({ address: context.deployment.contracts.distributionVault, abi: distributionVaultAbi,
          functionName: "entitlementOf", args: [context.auctionId, context.account], blockNumber: referenceBlock.number }),
        publicClient.readContract({ address: context.deployment.contracts.distributionVault, abi: distributionVaultAbi,
          functionName: "claimed", args: [context.auctionId, context.account], blockNumber: referenceBlock.number })
      ]);
    } catch { throw new WalletAuctionIdentityError("unavailable"); }
    if (!isAmount(values[0]) || !isFlag(values[1])) throw new WalletAuctionIdentityError("unavailable");
    return { amount: values[0], wasClaimed: values[1] };
  }

  async function readWithdrawalCredit(publicClient: PublicClient, context: ReturnType<typeof requireWalletContext>,
    action: "withdraw-seller" | "withdraw-fees") {
    let credit: unknown;
    try {
      credit = await publicClient.readContract({ address: context.deployment.contracts.escrowVault, abi: escrowVaultAbi,
        functionName: action === "withdraw-seller" ? "sellerCredits" : "protocolFeeCredits", args: [context.account] });
    } catch { throw new WalletAuctionIdentityError("unavailable"); }
    if (!isAmount(credit)) throw new WalletAuctionIdentityError("unavailable");
    return credit;
  }

  function failAction(caught: unknown, submittedHash: `0x${string}` | null, fallback: string) {
    if (!submittedHash && caught instanceof WalletAuctionIdentityError) {
      setSelectedAction(null);
      setTxStatus(null);
      setMessage(caught.message);
    } else {
      setTxStatus(submittedHash ? unknownConfirmationState(submittedHash, caught) : failedTransactionState(caught, fallback));
    }
  }

  function applyClaimData(next: WalletClaimData, reads: ClaimReadContext) {
    if (currentSnapshot(reads.refund)) { setRefundableAmount(next.refundableAmount); setRefundClaimed(next.refundClaimed); }
    if (currentSnapshot(reads.reward)) { setRewardEntitlement(next.rewardEntitlement); setRewardClaimed(next.rewardClaimed); }
    if (currentSnapshot(reads.global)) { setSellerCredit(next.sellerCredit); setProtocolFeeCredit(next.protocolFeeCredit); }
    if (currentSnapshot(reads.refund) && currentSnapshot(reads.reward) && currentSnapshot(reads.global)) {
      setClaimDataMessage(next.unavailable ? "Some wallet claim data is unavailable. Refresh to retry failed reads." : null);
    }
  }

  async function readWalletClaimData(): Promise<WalletClaimData> {
    const context = requireWalletContext();
    const { provider, publicClient } = await createConnectedWalletClients(config, connector, context.account);

    await verifyWalletChain(provider);

    const [
      nextRefundableAmount,
      nextRefundClaimed,
      nextRewardEntitlement,
      nextRewardClaimed,
      nextSellerCredit,
      nextProtocolFeeCredit
    ] = await Promise.allSettled([
      publicClient.readContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "refundableAmount",
        args: [context.auctionId, context.account]
      }),
      publicClient.readContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "refundClaimed",
        args: [context.auctionId, context.account]
      }),
      publicClient.readContract({
        address: context.deployment.contracts.distributionVault,
        abi: distributionVaultAbi,
        functionName: "entitlementOf",
        args: [context.auctionId, context.account]
      }),
      publicClient.readContract({
        address: context.deployment.contracts.distributionVault,
        abi: distributionVaultAbi,
        functionName: "claimed",
        args: [context.auctionId, context.account]
      }),
      publicClient.readContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "sellerCredits",
        args: [context.account]
      }),
      publicClient.readContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "protocolFeeCredits",
        args: [context.account]
      })
    ]);

    const values = {
      refundableAmount: nextRefundableAmount.status === "fulfilled" && isAmount(nextRefundableAmount.value) ? nextRefundableAmount.value : null,
      refundClaimed: nextRefundClaimed.status === "fulfilled" && isFlag(nextRefundClaimed.value) ? nextRefundClaimed.value : null,
      rewardEntitlement: nextRewardEntitlement.status === "fulfilled" && isAmount(nextRewardEntitlement.value) ? nextRewardEntitlement.value : null,
      rewardClaimed: nextRewardClaimed.status === "fulfilled" && isFlag(nextRewardClaimed.value) ? nextRewardClaimed.value : null,
      sellerCredit: nextSellerCredit.status === "fulfilled" && isAmount(nextSellerCredit.value) ? nextSellerCredit.value : null,
      protocolFeeCredit: nextProtocolFeeCredit.status === "fulfilled" && isAmount(nextProtocolFeeCredit.value) ? nextProtocolFeeCredit.value : null
    };
    return { ...values, unavailable: Object.values(values).some((value) => value === null) };
  }

  function clearClaimData(reads: ClaimReadContext) {
    applyClaimData({ refundableAmount: null, refundClaimed: null, rewardEntitlement: null, rewardClaimed: null,
      sellerCredit: null, protocolFeeCredit: null, unavailable: true }, reads);
  }

  async function loadWalletClaimData() {
    const reads = snapshotClaimReads();
    const loadRevision = ++claimLoadRevision.current;
    try {
      setIsLoadingClaimData(true);
      setClaimDataMessage(null);

      const next = await readWalletClaimData();
      if (loadRevision !== claimLoadRevision.current || !mounted.current) return;
      applyClaimData(next, reads);
    } catch (caught) {
      if (loadRevision !== claimLoadRevision.current || !mounted.current) return;
      clearClaimData(reads);
      if (currentSnapshot(reads.refund) && currentSnapshot(reads.global)) {
        setClaimDataMessage(`Wallet claim data is unavailable. ${walletErrorMessage(caught, "Unable to load wallet claim data.")}`);
      }
    } finally {
      if (loadRevision === claimLoadRevision.current && mounted.current) setIsLoadingClaimData(false);
    }
  }

  useEffect(() => {
    if (!deployment || !address || wrongNetwork) return;

    loadWalletClaimData().catch((caught) => {
      setClaimDataMessage(walletErrorMessage(caught, "Unable to load wallet claim data."));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletKey, pageKey, deployment, wrongNetwork]);

  async function confirmSubmittedTransaction(
    publicClient: PublicClient,
    hash: `0x${string}`,
    refreshingMessage: string,
    intent: WalletTransactionIntent,
    proof: { abi: Abi; eventName: string; address: Address; expected: Readonly<Record<string, string | bigint>>; positiveAmount?: boolean },
    successMessage: string,
    nextAction: string,
    action: ClaimAction,
    snapshot: ActionSnapshot
  ) {
    const submission = walletTransactionSubmission(hash, intent,
      (receipt) => matchingWalletActionEvents(receipt, proof).length === 1 ? {} : null);
    const stored = { submission, context: snapshot, successMessage, nextAction, refreshingMessage, action };
    recovery.current = stored;
    if (!currentSnapshot(snapshot, false)) setTxStatus(walletConfirmationState({ outcome: "unknown", submission }));
    await finishConfirmation(await confirmWalletTransaction(publicClient, submission), stored);
  }

  async function finishConfirmation(result: WalletConfirmationResult, stored: NonNullable<typeof recovery.current>, historicalVerification = false) {
    if (!currentSnapshot(stored.context, false)) {
      if (!historicalVerification) {
        setTxStatus(walletConfirmationState({ outcome: "unknown", submission: result.submission }));
        return;
      }
      if (!mounted.current || activeContext.current.walletKey !== stored.context.walletKey) return;
      if (result.outcome === "confirmed") {
        const hash = result.submission.effectiveHash;
        setTxStatus({ ...confirmedTransactionState(hash,
          isAuctionClaim(stored.action) ? `Previously reviewed auction #${stored.context.auctionId}: ${stored.successMessage}` : stored.successMessage,
          isAuctionClaim(stored.action) ? "This result belongs to the previously reviewed lot. Review the current auction separately."
            : "This withdrawal belongs to the submitting wallet's global credit, independently of the displayed auction."),
          technicalDetail: hash !== result.submission.originalHash ? `Originally submitted as ${result.submission.originalHash}.` : undefined });
        recovery.current = null;
      } else {
        if (result.outcome !== "unknown") recovery.current = null;
        setTxStatus(walletConfirmationState(result));
      }
      return;
    }
    if (result.outcome !== "confirmed") {
      if (result.outcome !== "unknown") recovery.current = null;
      setTxStatus(walletConfirmationState(result));
      return;
    }
    setTxStatus(refreshingTransactionState(stored.submission.effectiveHash, stored.refreshingMessage));
    await afterSuccessfulAction(stored);
  }

  async function verifyTransaction() {
    const stored = recovery.current;
    if (!stored || stored.context.walletKey !== walletKey || pendingAction || isVerifying) return;
    try {
      setIsVerifying(true);
      const { publicClient } = await createConnectedWalletClients(config, connector, stored.submission.intent.account);
      await finishConfirmation(await confirmWalletTransaction(publicClient, stored.submission, { recheck: true }), stored, true);
    } catch { setTxStatus(walletConfirmationState({ outcome: "unknown", submission: stored.submission })); }
    finally { setIsVerifying(false); }
  }

  async function afterSuccessfulAction(stored: NonNullable<typeof recovery.current>) {
    let refreshIncomplete = false;
    if (!currentSnapshot(stored.context, false)) return;

    try {
      if (activeContext.current.pageKey === stored.context.pageKey) await onActionComplete();
    } catch {
      refreshIncomplete = true;
    }

    const reads = snapshotClaimReads();
    try {
      const next = await readWalletClaimData();
      if (!currentSnapshot(stored.context, false)) return;
      applyClaimData(next, reads);
      refreshIncomplete ||= next.unavailable;
    } catch {
      if (!currentSnapshot(stored.context, false)) return;
      clearClaimData(reads);
      refreshIncomplete = true;
    }

    if (!currentSnapshot(stored.context, false)) return;
    recovery.current = null;
    if (stored.action.startsWith("claim-")) setCompletedClaims((current) => [...current, stored.action]);
    setSelectedAction(null);
    const hash = stored.submission.effectiveHash;
    const { successMessage, nextAction } = stored;
    const status =
      refreshIncomplete
        ? confirmedTransactionState(
            hash,
            `${successMessage} Displayed action data could not be fully refreshed.`,
            "Refresh the auction and wallet claim data before your next action.",
            true
          )
        : confirmedTransactionState(hash, successMessage, nextAction);
    setTxStatus({ ...status, technicalDetail: hash !== stored.submission.originalHash
      ? `Originally submitted as ${stored.submission.originalHash}.` : undefined });
  }

  async function refreshConfirmedData() {
    const submittedContext = statusContext.current;
    const reads = snapshotClaimReads();
    if (isLoadingClaimData || pendingAction || isVerifying) return;
    try {
      setIsLoadingClaimData(true);
      await onActionComplete();
      const next = await readWalletClaimData();
      if (!submittedContext || !currentSnapshot(submittedContext, false)) return;
      applyClaimData(next, reads);
      if (!next.unavailable) setTxStatus((current) => current?.phase === "confirmed" ? { ...current,
        message: current.message.replace(" Displayed action data could not be fully refreshed.", ""),
        nextAction: "Review the refreshed auction and wallet claim data.", refreshIncomplete: false } : current);
    } catch { /* Keep the verified transaction and the refresh warning. */ }
    finally { setIsLoadingClaimData(false); }
  }

  async function refreshAuctionContext() {
    if (isLoadingClaimData || pendingAction || isVerifying) return;
    const submittedPage = pageKey;
    const submittedWallet = walletKey;
    try {
      setIsLoadingClaimData(true);
      setSelectedAction(null);
      const loaded = await fetchDeployment();
      if (!mounted.current || activeContext.current.pageKey !== submittedPage || activeContext.current.walletKey !== submittedWallet) return;
      setDeployment(loaded);
      setDeploymentError(null);
      await onActionComplete();
      setMessage(null);
    } catch { setMessage("Auction details could not be refreshed. No signature was requested. Try again."); }
    finally { if (mounted.current) setIsLoadingClaimData(false); }
  }

  async function claimNft() {
    let submittedHash: `0x${string}` | null = null;

    try {
      setPendingAction("claim-nft");
      setMessage(null);
      setTxStatus(null);

      const { context, snapshot, provider, publicClient, walletClient, liveAuction, referenceBlock } = await prepareAuctionClaim("claim-nft");
      const claimant = isZeroAddress(liveAuction.highestBidder) ? liveAuction.seller : liveAuction.highestBidder;
      const liveState = getClaimNftActionState({
        isConnected: true, wrongNetwork: false, targetChainLabel,
        deploymentLoaded: true, auctionIdValid: true,
        account: context.account, claimant,
        claimantRoleLabel: isZeroAddress(liveAuction.highestBidder) ? "seller" : "winner",
        nftClaimed: liveAuction.nftClaimed, finalized: liveAuction.state === 2
      });
      if (liveState.disabledReason) {
        setMessage(liveState.disabledReason);
        setSelectedAction(null);
        try { await onActionComplete(); } catch { /* Keep the preflight explanation available. */ }
        return;
      }
      await beforeSignature(snapshot, context, provider, publicClient, referenceBlock);
      setTxStatus(awaitingSignatureState("Confirm NFT claim in your wallet."));

      const request = {
        address: context.deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "claimNft" as const,
        args: [context.auctionId] as const
      };
      const intent = Object.freeze({ chainId: targetChainId, account: context.account, to: request.address,
        data: encodeFunctionData(request), value: 0n });
      const proof = { abi: auctionHouseAbi, eventName: "NFTClaimed", address: request.address,
        expected: Object.freeze({ auctionId: context.auctionId, claimant: context.account }), positiveAmount: false };
      assertCurrentSnapshot(snapshot);
      const hash = await walletClient.writeContract(request);
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "NFT claim transaction submitted. Waiting for confirmation."));
      await confirmSubmittedTransaction(publicClient, hash, "NFT claim confirmed on-chain. Refreshing claimant state.", intent, proof,
        "NFT claimed.", "Review any other available claim or withdrawal.", "claim-nft", snapshot);
    } catch (caught) {
      failAction(caught, submittedHash, "NFT claim failed before submission.");
    } finally {
      setPendingAction(null);
    }
  }

  async function claimRefund() {
    let submittedHash: `0x${string}` | null = null;

    try {
      setPendingAction("claim-refund");
      setMessage(null);
      setTxStatus(null);

      if (!auction.finalized) throw new Error("Auction is not finalized.");
      const { context, snapshot, provider, publicClient, walletClient, liveAuction, referenceBlock } = await prepareAuctionClaim("claim-refund");
      if (liveAuction.state !== 2) throw new Error("Auction is not finalized.");
      setRefundableAmount(null);
      setRefundClaimed(null);
      const { amount, wasClaimed } = await readClaimEligibility(publicClient, context, "claim-refund", referenceBlock);
      assertCurrentSnapshot(snapshot);

      setRefundableAmount(amount);
      setRefundClaimed(wasClaimed);

      if (wasClaimed) throw new Error("Refund already claimed.");
      if (amount === 0n) throw new Error("No refund available.");

      await beforeSignature(snapshot, context, provider, publicClient, referenceBlock);
      setTxStatus(awaitingSignatureState("Confirm refund claim in your wallet."));

      const request = {
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "claimRefund" as const,
        args: [context.auctionId] as const
      };
      const intent = Object.freeze({ chainId: targetChainId, account: context.account, to: request.address,
        data: encodeFunctionData(request), value: 0n });
      const proof = { abi: escrowVaultAbi, eventName: "RefundClaimed", address: request.address,
        expected: Object.freeze({ auctionId: context.auctionId, bidder: context.account }), positiveAmount: true };
      assertCurrentSnapshot(snapshot);
      const hash = await walletClient.writeContract(request);
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "Refund claim transaction submitted. Waiting for confirmation."));
      await confirmSubmittedTransaction(publicClient, hash, "Refund confirmed on-chain. Refreshing refundable balance.", intent, proof,
        "Refund claimed.", "Review any separate redistribution or withdrawal still available.", "claim-refund", snapshot);
    } catch (caught) {
      failAction(caught, submittedHash, "Refund claim failed before submission.");
    } finally {
      setPendingAction(null);
    }
  }

  async function claimReward() {
    let submittedHash: `0x${string}` | null = null;

    try {
      setPendingAction("claim-reward");
      setMessage(null);
      setTxStatus(null);

      if (!auction.finalized) throw new Error("Auction is not finalized.");
      const { context, snapshot, provider, publicClient, walletClient, liveAuction, referenceBlock } = await prepareAuctionClaim("claim-reward");
      if (liveAuction.state !== 2) throw new Error("Auction is not finalized.");
      setRewardEntitlement(null);
      setRewardClaimed(null);
      const { amount: entitlement, wasClaimed } = await readClaimEligibility(publicClient, context, "claim-reward", referenceBlock);
      assertCurrentSnapshot(snapshot);

      setRewardEntitlement(entitlement);
      setRewardClaimed(wasClaimed);

      if (wasClaimed) throw new Error("Reward already claimed.");
      if (entitlement === 0n) throw new Error("No reward available.");

      await beforeSignature(snapshot, context, provider, publicClient, referenceBlock);
      setTxStatus(awaitingSignatureState("Confirm redistribution claim in your wallet."));

      const request = {
        address: context.deployment.contracts.distributionVault,
        abi: distributionVaultAbi,
        functionName: "claim" as const,
        args: [context.auctionId] as const
      };
      const intent = Object.freeze({ chainId: targetChainId, account: context.account, to: request.address,
        data: encodeFunctionData(request), value: 0n });
      const proof = { abi: distributionVaultAbi, eventName: "DistributionClaimed", address: request.address,
        expected: Object.freeze({ auctionId: context.auctionId, claimant: context.account }), positiveAmount: true };
      assertCurrentSnapshot(snapshot);
      const hash = await walletClient.writeContract(request);
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "Redistribution claim submitted. Waiting for confirmation."));
      await confirmSubmittedTransaction(publicClient, hash, "Redistribution confirmed on-chain. Refreshing entitlement state.", intent, proof,
        "Redistribution claimed.", "Review any separate refund or withdrawal still available.", "claim-reward", snapshot);
    } catch (caught) {
      failAction(caught, submittedHash, "Redistribution claim failed before submission.");
    } finally {
      setPendingAction(null);
    }
  }

  async function withdrawSellerProceeds() {
    let submittedHash: `0x${string}` | null = null;

    try {
      setPendingAction("withdraw-seller");
      setMessage(null);
      setTxStatus(null);

      const context = requireWalletContext();
      const snapshot = snapshotAction("withdraw-seller");
      statusContext.current = snapshot;
      assertCurrentSnapshot(snapshot);

      if (!auction.finalized) throw new Error("Auction is not finalized.");
      if (!sameAddress(context.account, auction.seller)) throw new Error("Connect the seller wallet.");

      const { provider, publicClient, walletClient } = await createConnectedWalletClients(config, connector, context.account);
      setSellerCredit(null);
      assertCurrentSnapshot(snapshot);
      await verifyWalletChain(provider);
      assertCurrentSnapshot(snapshot);

      const credit = await readWithdrawalCredit(publicClient, context, "withdraw-seller");
      assertCurrentSnapshot(snapshot);

      setSellerCredit(credit);

      if (credit === 0n) throw new Error("No seller proceeds.");

      await beforeSignature(snapshot, context, provider, publicClient);
      setTxStatus(awaitingSignatureState("Confirm seller proceeds withdrawal in your wallet."));

      const request = {
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "withdrawSellerProceeds" as const
      };
      const intent = Object.freeze({ chainId: targetChainId, account: context.account, to: request.address,
        data: encodeFunctionData(request), value: 0n });
      const proof = { abi: escrowVaultAbi, eventName: "SellerProceedsWithdrawn", address: request.address,
        expected: Object.freeze({ seller: context.account }), positiveAmount: true };
      assertCurrentSnapshot(snapshot);
      const hash = await walletClient.writeContract(request);
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "Seller proceeds withdrawal submitted. Waiting for confirmation."));
      await confirmSubmittedTransaction(publicClient, hash, "Proceeds withdrawal confirmed on-chain. Refreshing wallet-level credit.", intent, proof,
        "Proceeds withdrawn.", "Review any other available claim or withdrawal.", "withdraw-seller", snapshot);
    } catch (caught) {
      failAction(caught, submittedHash, "Proceeds withdrawal failed before submission.");
    } finally {
      setPendingAction(null);
    }
  }

  async function withdrawProtocolFees() {
    let submittedHash: `0x${string}` | null = null;

    try {
      setPendingAction("withdraw-fees");
      setMessage(null);
      setTxStatus(null);

      const context = requireWalletContext();
      const snapshot = snapshotAction("withdraw-fees");
      statusContext.current = snapshot;
      assertCurrentSnapshot(snapshot);

      if (!auction.finalized) throw new Error("Auction is not finalized.");
      if (auction.auctionFeeRecipient && !sameAddress(context.account, auction.auctionFeeRecipient)) {
        throw new Error("Connect the auction fee recipient wallet.");
      }

      const { provider, publicClient, walletClient } = await createConnectedWalletClients(config, connector, context.account);
      setProtocolFeeCredit(null);
      assertCurrentSnapshot(snapshot);
      await verifyWalletChain(provider);
      assertCurrentSnapshot(snapshot);

      const credit = await readWithdrawalCredit(publicClient, context, "withdraw-fees");
      assertCurrentSnapshot(snapshot);

      setProtocolFeeCredit(credit);

      if (credit === 0n) throw new Error("No protocol fees.");

      await beforeSignature(snapshot, context, provider, publicClient);
      setTxStatus(awaitingSignatureState("Confirm protocol fee withdrawal in your wallet."));

      const request = {
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "withdrawProtocolFees" as const
      };
      const intent = Object.freeze({ chainId: targetChainId, account: context.account, to: request.address,
        data: encodeFunctionData(request), value: 0n });
      const proof = { abi: escrowVaultAbi, eventName: "ProtocolFeesWithdrawn", address: request.address,
        expected: Object.freeze({ recipient: context.account }), positiveAmount: true };
      assertCurrentSnapshot(snapshot);
      const hash = await walletClient.writeContract(request);
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "Protocol fee withdrawal submitted. Waiting for confirmation."));
      await confirmSubmittedTransaction(publicClient, hash, "Protocol fee withdrawal confirmed on-chain. Refreshing wallet-level credit.", intent, proof,
        "Protocol fees withdrawn.", "Review any other available claim or withdrawal.", "withdraw-fees", snapshot);
    } catch (caught) {
      failAction(caught, submittedHash, "Protocol fee withdrawal failed before submission.");
    } finally {
      setPendingAction(null);
    }
  }

  const commonActionContext = {
    isConnected,
    wrongNetwork,
    targetChainLabel,
    deploymentLoaded: Boolean(deployment),
    deploymentError,
    auctionIdValid: Boolean(auctionIdBigInt),
    loading: isLoadingClaimData,
    pending: pendingAction !== null || isVerifying || txStatus?.phase === "confirmation-unknown"
  };

  const claimNftDisabledReason = getClaimNftActionState({
    ...commonActionContext,
    account: address,
    claimant: expectedNftClaimant,
    claimantRoleLabel: expectedNftClaimantLabel,
    nftClaimed: auction.nftClaimed || completedClaims.includes("claim-nft"),
    finalized: auction.finalized
  }).disabledReason;

  const claimRefundDisabledReason = getClaimRefundActionState({
    ...commonActionContext,
    refundableAmount,
    refundClaimed: completedClaims.includes("claim-refund") ? true : refundClaimed,
    finalized: auction.finalized
  }).disabledReason;

  const rawClaimRewardDisabledReason = getClaimRewardActionState({
    ...commonActionContext,
    rewardEntitlement,
    rewardClaimed: completedClaims.includes("claim-reward") ? true : rewardClaimed,
    finalized: auction.finalized
  }).disabledReason;
  const claimRewardDisabledReason = rawClaimRewardDisabledReason === "No reward available."
    ? "No redistribution is currently claimable."
    : rawClaimRewardDisabledReason === "Reward already claimed."
      ? "Redistribution already claimed."
      : rawClaimRewardDisabledReason;
  const availableRefundableAmount = completedClaims.includes("claim-refund") ? 0n : refundClaimed === null ? null : refundClaimed ? 0n : refundableAmount;
  const availableRewardEntitlement = completedClaims.includes("claim-reward") ? 0n : rewardClaimed === null ? null : rewardClaimed ? 0n : rewardEntitlement;

  const withdrawSellerDisabledReason = getWithdrawSellerActionState({
    ...commonActionContext,
    account: address,
    seller: auction.seller,
    sellerCredit,
    finalized: auction.finalized
  }).disabledReason;

  const withdrawFeesDisabledReason = getWithdrawProtocolFeesActionState({
    ...commonActionContext,
    account: address,
    feeRecipient: auction.auctionFeeRecipient,
    protocolFeeCredit,
    finalized: auction.finalized
  }).disabledReason;

  const statusMessage = !isConnected
    ? "Wallet not connected."
    : wrongNetwork
      ? `Wallet connected, but not on the target chain (${targetChainLabel}).`
      : !auction.finalized
        ? "Auction is not finalized."
        : null;

  const actionStates: Array<{ action: ClaimAction; disabledReason: string | null }> = [
    { action: "claim-nft", disabledReason: claimNftDisabledReason },
    { action: "claim-refund", disabledReason: claimRefundDisabledReason },
    { action: "claim-reward", disabledReason: claimRewardDisabledReason },
    { action: "withdraw-seller", disabledReason: withdrawSellerDisabledReason },
    { action: "withdraw-fees", disabledReason: withdrawFeesDisabledReason }
  ];
  const primaryAction = actionStates.find((item) => !item.disabledReason)?.action ?? null;
  // A later balance read must not erase the reason a signature was refused.
  const panelMessage = message ?? claimDataMessage;

  function selectedReview() {
    if (!selectedAction) return null;

    let title: string;
    let description: string;
    let items: TransactionReviewItem[];
    let note: string | undefined;
    let disabledReason: string | null;
    let onConfirm: () => void;

    if (selectedAction === "claim-nft") {
      title = "Review claim NFT";
      description = "Transfer the auctioned NFT from custody to the authorized claimant wallet.";
      items = [
        { label: "Auction", value: `#${auction.auctionId}` },
        { label: "NFT", value: `${shortenAddress(auction.nft)} #${auction.tokenId}` },
        { label: "Destination", value: shortenAddress(expectedNftClaimant), mono: true },
        { label: "Effect", value: "Releases the NFT after confirmation" },
        { label: "Network gas", value: "Separate; shown by your wallet" }
      ];
      disabledReason = claimNftDisabledReason;
      onConfirm = claimNft;
    } else if (selectedAction === "claim-refund") {
      title = "Review claim refund";
      description = "Recover the refundable cap currently available to the connected wallet for this auction.";
      items = [
        { label: "Auction", value: `#${auction.auctionId}` },
        { label: "Refund available", value: availableRefundableAmount === null ? "Unavailable" : formatEth(availableRefundableAmount) },
        { label: "Destination", value: address ? shortenAddress(address) : "Not connected", mono: true },
        { label: "Effect", value: "Sends the refundable cap to this wallet" },
        { label: "Network gas", value: "Separate; shown by your wallet" }
      ];
      note = "A refund returns refundable cap. It is separate from conditional redistribution.";
      disabledReason = claimRefundDisabledReason;
      onConfirm = claimRefund;
    } else if (selectedAction === "claim-reward") {
      title = "Review claim redistribution";
      description = "Claim the positive conditional redistribution entitlement currently recorded for this wallet.";
      items = [
        { label: "Auction", value: `#${auction.auctionId}` },
        { label: "Redistribution available", value: availableRewardEntitlement === null ? "Unavailable" : formatEth(availableRewardEntitlement) },
        { label: "Destination", value: address ? shortenAddress(address) : "Not connected", mono: true },
        { label: "Effect", value: "Sends the recorded entitlement to this wallet" },
        { label: "Network gas", value: "Separate; shown by your wallet" }
      ];
      note = "Redistribution is conditional, can be zero, and is separate from any refundable cap.";
      disabledReason = claimRewardDisabledReason;
      onConfirm = claimReward;
    } else if (selectedAction === "withdraw-seller") {
      title = "Review withdraw proceeds";
      description = "Withdraw the seller wallet's current aggregate credit from EscrowVault.";
      items = [
        { label: "Credit scope", value: "Wallet-level / global credit" },
        { label: "Amount", value: sellerCredit === null ? "Unavailable" : formatEth(sellerCredit) },
        { label: "Destination", value: address ? shortenAddress(address) : "Not connected", mono: true },
        { label: "Auction page", value: `#${auction.auctionId} is a navigation context, not exact credit attribution` },
        { label: "Network gas", value: "Separate; shown by your wallet" }
      ];
      note = "This credit may aggregate proceeds from more than one auction and is not attributed solely to this lot.";
      disabledReason = withdrawSellerDisabledReason;
      onConfirm = withdrawSellerProceeds;
    } else {
      title = "Review withdraw protocol fees";
      description = "Withdraw the fee-recipient wallet's current aggregate credit from EscrowVault.";
      items = [
        { label: "Credit scope", value: "Wallet-level / global credit" },
        { label: "Amount", value: protocolFeeCredit === null ? "Unavailable" : formatEth(protocolFeeCredit) },
        { label: "Destination", value: address ? shortenAddress(address) : "Not connected", mono: true },
        { label: "Auction page", value: `#${auction.auctionId} is a navigation context, not exact credit attribution` },
        { label: "Network gas", value: "Separate; shown by your wallet" }
      ];
      note = "This credit may aggregate protocol fees from more than one auction and is not attributed solely to this lot.";
      disabledReason = withdrawFeesDisabledReason;
      onConfirm = withdrawProtocolFees;
    }

    return (
      <TransactionReview
        title={title}
        description={description}
        items={items}
        confirmations="Currently expected: 1 wallet confirmation"
        note={note}
        primaryLabel="Continue in wallet"
        busy={pendingAction === selectedAction}
        disabled={Boolean(disabledReason) || txStatus?.phase === "confirmation-unknown"}
        onBack={() => setSelectedAction(null)}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <section aria-busy={isDeploymentLoading || isLoadingClaimData || pendingAction !== null || isVerifying} className="min-w-0 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-white">Claims and withdrawals</h3>
        <ModeBadge variant="wallet-signed" />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/80">
        Pull-based post-finalization actions signed in your wallet. No server private key is used and no /api/dev route is
        called.
      </p>

      {isDeploymentLoading ? (
        <StateNotice tone="loading" title="Loading deployment data" className="mt-4">
          Preparing wallet-signed claim and withdrawal reads.
        </StateNotice>
      ) : null}

      {deploymentError ? (
        <StateNotice tone="error" title="Claim deployment data is unavailable" className="mt-4">
          {deploymentError}
        </StateNotice>
      ) : null}

      {statusMessage ? (
        <StateNotice tone="warning" title="Wallet actions unavailable" className="mt-4">
          {statusMessage}
        </StateNotice>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="Wallet" value={address ? shortenAddress(address) : "Not connected"} mono />
        <InfoItem label="NFT claimant" value={shortenAddress(expectedNftClaimant)} mono />
        <InfoItem label="NFT claimant role" value={expectedNftClaimantLabel} />
        <InfoItem label="Seller wallet" value={shortenAddress(auction.seller)} mono />
        <InfoItem label="Fee recipient" value={auction.auctionFeeRecipient ? shortenAddress(auction.auctionFeeRecipient) : "Not loaded"} mono />
        <InfoItem label="Refund available" value={availableRefundableAmount === null ? "Unavailable" : formatEth(availableRefundableAmount)} />
        <InfoItem label="Redistribution available" value={availableRewardEntitlement === null ? "Unavailable" : formatEth(availableRewardEntitlement)} />
        <InfoItem label="Global seller proceeds credit" value={sellerCredit === null ? "Unavailable" : formatEth(sellerCredit)} />
        <InfoItem label="Global protocol fee credit" value={protocolFeeCredit === null ? "Unavailable" : formatEth(protocolFeeCredit)} />
        <InfoItem label="NFT claimed" value={auction.nftClaimed || completedClaims.includes("claim-nft") ? "Yes" : "No"} />
        <InfoItem label="Auction finalized" value={auction.finalized ? "Yes" : "No"} />
      </div>

      <TechnicalDisclosure
        summary="Claim network, contract, and recorded amount details"
        description="Technical values retained for diagnosing wallet-signed claims and historical on-chain records."
        className="mt-4"
      >
        <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="Target chain" value={`${targetChainLabel} (${targetChainId})`} />
          <InfoItem label="Wallet chain" value={chainId ? String(chainId) : "Not connected"} />
          <InfoItem label="AuctionHouse" value={deployment ? shortenAddress(deployment.contracts.auctionHouse) : "Not loaded"} mono />
          <InfoItem label="EscrowVault" value={deployment ? shortenAddress(deployment.contracts.escrowVault) : "Not loaded"} mono />
          <InfoItem label="DistributionVault" value={deployment ? shortenAddress(deployment.contracts.distributionVault) : "Not loaded"} mono />
          <InfoItem label="Recorded refundable amount" value={refundableAmount === null ? "Unavailable" : formatEth(refundableAmount)} />
          <InfoItem label="Refund claimed" value={refundClaimed === null ? "Unavailable" : refundClaimed ? "Yes" : "No"} />
          <InfoItem label="Recorded redistribution entitlement" value={rewardEntitlement === null ? "Unavailable" : formatEth(rewardEntitlement)} />
          <InfoItem label="Redistribution claimed" value={rewardClaimed === null ? "Unavailable" : rewardClaimed ? "Yes" : "No"} />
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          Wallet-signed claims require your wallet to access the target RPC for {targetChainLabel}. In Codespaces with local
          Anvil, a browser wallet may not reach the forwarded RPC reliably; use local-dev actions there or expose Anvil through a
          reliable localhost/testnet RPC.
        </p>
      </TechnicalDisclosure>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={!isConnected || wrongNetwork || !deployment || isLoadingClaimData || pendingAction !== null}
          onClick={() => loadWalletClaimData().catch((caught) => setClaimDataMessage(walletErrorMessage(caught, "Unable to load wallet claim data.")))}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isLoadingClaimData ? "Loading..." : "Refresh wallet claim data"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ActionButton
          label="Claim NFT"
          description="Release the NFT to the authorized claimant wallet."
          pending={pendingAction === "claim-nft"}
          disabledReason={claimNftDisabledReason}
          primary={primaryAction === "claim-nft"}
          onClick={() => setSelectedAction("claim-nft")}
        />

        <ActionButton
          label="Claim refund"
          description="Recover refundable cap. This is separate from redistribution."
          amount={availableRefundableAmount === null ? undefined : formatEth(availableRefundableAmount)}
          pending={pendingAction === "claim-refund"}
          disabledReason={claimRefundDisabledReason}
          primary={primaryAction === "claim-refund"}
          onClick={() => setSelectedAction("claim-refund")}
        />

        <ActionButton
          label="Claim redistribution"
          description="Claim a positive conditional entitlement when one is currently recorded."
          amount={availableRewardEntitlement === null ? undefined : formatEth(availableRewardEntitlement)}
          pending={pendingAction === "claim-reward"}
          disabledReason={claimRewardDisabledReason}
          primary={primaryAction === "claim-reward"}
          onClick={() => setSelectedAction("claim-reward")}
        />

        <ActionButton
          label="Withdraw proceeds"
          description="Withdraw the seller wallet's global credit."
          amount={sellerCredit === null ? undefined : formatEth(sellerCredit)}
          pending={pendingAction === "withdraw-seller"}
          disabledReason={withdrawSellerDisabledReason}
          primary={primaryAction === "withdraw-seller"}
          onClick={() => setSelectedAction("withdraw-seller")}
        />

        <ActionButton
          label="Withdraw protocol fees"
          description="Withdraw the fee-recipient wallet's global credit."
          amount={protocolFeeCredit === null ? undefined : formatEth(protocolFeeCredit)}
          pending={pendingAction === "withdraw-fees"}
          disabledReason={withdrawFeesDisabledReason}
          primary={primaryAction === "withdraw-fees"}
          onClick={() => setSelectedAction("withdraw-fees")}
        />
      </div>

      {selectedAction ? <div className="mt-4">{selectedReview()}</div> : null}

      <div className="mt-4">
        {historicalTransaction ? <p role="status" className="mb-3 text-sm text-amber-200">
          Transaction for the previously reviewed auction #{statusContext.current?.auctionId}. Its result is separate from the displayed lot.
        </p> : null}
        {globalTransaction ? <p role="status" className="mb-3 text-sm text-slate-300">
          This withdrawal uses the submitting wallet's global credit and is not attributed to the displayed auction.
        </p> : null}
        <WalletTransactionStatus title={historicalTransaction ? "Previously submitted auction claim" : globalTransaction ? "Wallet-level withdrawal" : "Wallet claim / withdrawal"} status={txStatus} />
        {txStatus?.refreshIncomplete && !historicalTransaction ? <button type="button" onClick={refreshConfirmedData}
          disabled={isLoadingClaimData || pendingAction !== null || isVerifying || wrongNetwork || !isConnected}
          className="mt-3 min-h-11 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 disabled:opacity-50">
          {isLoadingClaimData ? "Refreshing..." : "Refresh auction and wallet claim data"}
        </button> : null}
        {txStatus?.phase === "confirmation-unknown" ? <div className="mt-3">
          <button type="button" onClick={verifyTransaction}
            disabled={isVerifying || pendingAction !== null || recovery.current?.context.walletKey !== walletKey}
            className="min-h-11 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 disabled:opacity-50">
            {isVerifying ? "Verifying..." : "Verify transaction"}
          </button>
          <p className="mt-2 text-xs text-slate-300">Verification only reads on-chain evidence. Return to the submitting wallet and network if they changed. Results for a previously reviewed lot remain separate.</p>
        </div> : null}
      </div>

      {panelMessage ? <div role="status" aria-live="polite" className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">
        {panelMessage}
        <button type="button" onClick={refreshAuctionContext} disabled={isLoadingClaimData || pendingAction !== null || isVerifying}
          className="mt-3 block min-h-11 rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 disabled:opacity-50">
          {isLoadingClaimData ? "Refreshing..." : "Refresh auction details"}
        </button>
      </div> : null}
    </section>
  );
}

function ActionButton({
  label,
  description,
  amount,
  pending,
  disabledReason,
  primary = false,
  onClick
}: {
  label: string;
  description: string;
  amount?: string;
  pending: boolean;
  disabledReason: string | null;
  primary?: boolean;
  onClick: () => void;
}) {
  const reasonId = `wallet-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-disabled-reason`;

  return (
    <div className={`transaction-action-card ${primary ? "transaction-action-primary" : ""} ${disabledReason ? "transaction-action-disabled" : ""}`}>
      <div>
        <h4 className="font-semibold text-white">{label}</h4>
        <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
        {amount ? <p className="mt-2 font-mono text-sm text-slate-200">{amount}</p> : null}
      </div>
      <button
        type="button"
        disabled={Boolean(disabledReason)}
        aria-describedby={disabledReason ? reasonId : undefined}
        onClick={onClick}
        className={`${primary ? "transaction-primary-action" : "transaction-secondary-action"} mt-3 w-full`}
      >
        {pending ? "Working..." : `Review ${label.toLowerCase()}`}
      </button>
      {disabledReason ? <p id={reasonId} className="mt-1 text-xs text-emerald-100/70">{disabledReason}</p> : null}
    </div>
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
