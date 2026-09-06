"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type Address,
  type EIP1193Provider,
  type PublicClient
} from "viem";
import { useAccount } from "wagmi";
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
import { targetChain, targetChainId, targetChainLabel } from "@/lib/chains";
import { fetchDeployment, type Deployment } from "@/lib/deployment";
import { formatEth, isZeroAddress, shortenAddress } from "@/lib/format";
import type { SerializedAuction } from "@/lib/auctionTypes";
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

type ClaimAction =
  | "claim-nft"
  | "claim-refund"
  | "claim-reward"
  | "withdraw-seller"
  | "withdraw-fees";

type WalletClaimData = {
  refundableAmount: bigint;
  refundClaimed: boolean;
  rewardEntitlement: bigint;
  rewardClaimed: boolean;
  sellerCredit: bigint;
  protocolFeeCredit: bigint;
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
      `Wallet-signed claims require your wallet to access the target RPC. ${walletErrorMessage(error, "")}`
    );
  }

  if (typeof walletChainId !== "string" || Number.parseInt(walletChainId, 16) !== targetChainId) {
    throw new Error(`Wallet connected, but not on the target chain (${targetChainLabel}).`);
  }
}

export function WalletClaimPanel({
  auction,
  onActionComplete
}: {
  auction: SerializedAuction;
  onActionComplete: () => Promise<void>;
}) {
  const { address, chainId, isConnected } = useAccount();

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
  const [selectedAction, setSelectedAction] = useState<ClaimAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<WalletTransactionState | null>(null);

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
    setSellerCredit(null);
    setProtocolFeeCredit(null);
    setTxStatus(null);
    setSelectedAction(null);
  }, [address, chainId, auction.auctionId]);

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

  function applyClaimData(next: WalletClaimData) {
    setRefundableAmount(next.refundableAmount);
    setRefundClaimed(next.refundClaimed);
    setRewardEntitlement(next.rewardEntitlement);
    setRewardClaimed(next.rewardClaimed);
    setSellerCredit(next.sellerCredit);
    setProtocolFeeCredit(next.protocolFeeCredit);
  }

  async function readWalletClaimData(): Promise<WalletClaimData> {
    const context = requireWalletContext();
    const { provider, publicClient } = createBrowserClients(context.account);

    await verifyWalletChain(provider);

    const [
      nextRefundableAmount,
      nextRefundClaimed,
      nextRewardEntitlement,
      nextRewardClaimed,
      nextSellerCredit,
      nextProtocolFeeCredit
    ] = await Promise.all([
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

    return {
      refundableAmount: nextRefundableAmount,
      refundClaimed: nextRefundClaimed,
      rewardEntitlement: nextRewardEntitlement,
      rewardClaimed: nextRewardClaimed,
      sellerCredit: nextSellerCredit,
      protocolFeeCredit: nextProtocolFeeCredit
    };
  }

  async function loadWalletClaimData() {
    try {
      setIsLoadingClaimData(true);
      setMessage(null);

      const next = await readWalletClaimData();
      applyClaimData(next);
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Unable to load wallet claim data."));
    } finally {
      setIsLoadingClaimData(false);
    }
  }

  useEffect(() => {
    if (!deployment || !address || wrongNetwork) return;

    loadWalletClaimData().catch((caught) => {
      setMessage(walletErrorMessage(caught, "Unable to load wallet claim data."));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, auction.auctionId, deployment, wrongNetwork]);

  async function confirmSubmittedTransaction(
    publicClient: PublicClient,
    hash: `0x${string}`,
    refreshingMessage: string
  ) {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (!receiptWasSuccessful(receipt)) {
        setTxStatus(revertedTransactionState(hash));
        return false;
      }
    } catch (caught) {
      setTxStatus(unknownConfirmationState(hash, caught));
      return false;
    }

    setTxStatus(refreshingTransactionState(hash, refreshingMessage));
    return true;
  }

  async function afterSuccessfulAction(successMessage: string, nextAction: string, hash: `0x${string}`) {
    let refreshIncomplete = false;

    try {
      await onActionComplete();
    } catch {
      refreshIncomplete = true;
    }

    try {
      const next = await readWalletClaimData();
      applyClaimData(next);
    } catch {
      refreshIncomplete = true;
    }

    setSelectedAction(null);
    setTxStatus(
      refreshIncomplete
        ? confirmedTransactionState(
            hash,
            `${successMessage} Displayed action data could not be fully refreshed.`,
            "Refresh the auction and wallet claim data before your next action."
          )
        : confirmedTransactionState(hash, successMessage, nextAction)
    );
  }

  async function claimNft() {
    let submittedHash: `0x${string}` | null = null;

    try {
      setPendingAction("claim-nft");
      setMessage(null);
      setTxStatus(null);

      const context = requireWalletContext();

      if (!auction.finalized) throw new Error("Auction is not finalized.");
      if (auction.nftClaimed) throw new Error("NFT already claimed.");

      if (!sameAddress(context.account, expectedNftClaimant)) {
        throw new Error(`Connected wallet is not the NFT claimant. Expected ${expectedNftClaimantLabel}: ${expectedNftClaimant}.`);
      }

      const { provider, publicClient, walletClient } = createBrowserClients(context.account);
      await verifyWalletChain(provider);
      setTxStatus(awaitingSignatureState("Confirm NFT claim in your wallet."));

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "claimNft",
        args: [context.auctionId]
      });
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "NFT claim transaction submitted. Waiting for confirmation."));
      if (!await confirmSubmittedTransaction(publicClient, hash, "NFT claim confirmed on-chain. Refreshing claimant state.")) return;
      await afterSuccessfulAction("NFT claimed.", "Review any other available claim or withdrawal.", hash);
    } catch (caught) {
      const failed = submittedHash
        ? unknownConfirmationState(submittedHash, caught)
        : failedTransactionState(caught, "NFT claim failed before submission.");
      setTxStatus(failed);
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

      const context = requireWalletContext();

      if (!auction.finalized) throw new Error("Auction is not finalized.");

      const { provider, publicClient, walletClient } = createBrowserClients(context.account);
      await verifyWalletChain(provider);

      const [amount, wasClaimed] = await Promise.all([
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
        })
      ]);

      setRefundableAmount(amount);
      setRefundClaimed(wasClaimed);

      if (wasClaimed) throw new Error("Refund already claimed.");
      if (amount === 0n) throw new Error("No refund available.");

      setTxStatus(awaitingSignatureState("Confirm refund claim in your wallet."));

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "claimRefund",
        args: [context.auctionId]
      });
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "Refund claim transaction submitted. Waiting for confirmation."));
      if (!await confirmSubmittedTransaction(publicClient, hash, "Refund confirmed on-chain. Refreshing refundable balance.")) return;
      await afterSuccessfulAction("Refund claimed.", "Review any separate redistribution or withdrawal still available.", hash);
    } catch (caught) {
      const failed = submittedHash
        ? unknownConfirmationState(submittedHash, caught)
        : failedTransactionState(caught, "Refund claim failed before submission.");
      setTxStatus(failed);
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

      const context = requireWalletContext();

      if (!auction.finalized) throw new Error("Auction is not finalized.");

      const { provider, publicClient, walletClient } = createBrowserClients(context.account);
      await verifyWalletChain(provider);

      const [entitlement, wasClaimed] = await Promise.all([
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
        })
      ]);

      setRewardEntitlement(entitlement);
      setRewardClaimed(wasClaimed);

      if (wasClaimed) throw new Error("Reward already claimed.");
      if (entitlement === 0n) throw new Error("No reward available.");

      setTxStatus(awaitingSignatureState("Confirm redistribution claim in your wallet."));

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.distributionVault,
        abi: distributionVaultAbi,
        functionName: "claim",
        args: [context.auctionId]
      });
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "Redistribution claim submitted. Waiting for confirmation."));
      if (!await confirmSubmittedTransaction(publicClient, hash, "Redistribution confirmed on-chain. Refreshing entitlement state.")) return;
      await afterSuccessfulAction("Redistribution claimed.", "Review any separate refund or withdrawal still available.", hash);
    } catch (caught) {
      const failed = submittedHash
        ? unknownConfirmationState(submittedHash, caught)
        : failedTransactionState(caught, "Redistribution claim failed before submission.");
      setTxStatus(failed);
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

      if (!auction.finalized) throw new Error("Auction is not finalized.");
      if (!sameAddress(context.account, auction.seller)) throw new Error("Connect the seller wallet.");

      const { provider, publicClient, walletClient } = createBrowserClients(context.account);
      await verifyWalletChain(provider);

      const credit = await publicClient.readContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "sellerCredits",
        args: [context.account]
      });

      setSellerCredit(credit);

      if (credit === 0n) throw new Error("No seller proceeds.");

      setTxStatus(awaitingSignatureState("Confirm seller proceeds withdrawal in your wallet."));

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "withdrawSellerProceeds"
      });
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "Seller proceeds withdrawal submitted. Waiting for confirmation."));
      if (!await confirmSubmittedTransaction(publicClient, hash, "Proceeds withdrawal confirmed on-chain. Refreshing wallet-level credit.")) return;
      await afterSuccessfulAction("Proceeds withdrawn.", "Review any other available claim or withdrawal.", hash);
    } catch (caught) {
      const failed = submittedHash
        ? unknownConfirmationState(submittedHash, caught)
        : failedTransactionState(caught, "Proceeds withdrawal failed before submission.");
      setTxStatus(failed);
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

      if (!auction.finalized) throw new Error("Auction is not finalized.");
      if (auction.auctionFeeRecipient && !sameAddress(context.account, auction.auctionFeeRecipient)) {
        throw new Error("Connect the auction fee recipient wallet.");
      }

      const { provider, publicClient, walletClient } = createBrowserClients(context.account);
      await verifyWalletChain(provider);

      const credit = await publicClient.readContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "protocolFeeCredits",
        args: [context.account]
      });

      setProtocolFeeCredit(credit);

      if (credit === 0n) throw new Error("No protocol fees.");

      setTxStatus(awaitingSignatureState("Confirm protocol fee withdrawal in your wallet."));

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "withdrawProtocolFees"
      });
      submittedHash = hash;

      setTxStatus(pendingTransactionState(hash, "Protocol fee withdrawal submitted. Waiting for confirmation."));
      if (!await confirmSubmittedTransaction(publicClient, hash, "Protocol fee withdrawal confirmed on-chain. Refreshing wallet-level credit.")) return;
      await afterSuccessfulAction("Protocol fees withdrawn.", "Review any other available claim or withdrawal.", hash);
    } catch (caught) {
      const failed = submittedHash
        ? unknownConfirmationState(submittedHash, caught)
        : failedTransactionState(caught, "Protocol fee withdrawal failed before submission.");
      setTxStatus(failed);
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
    pending: pendingAction !== null || txStatus?.phase === "confirmation-unknown"
  };

  const claimNftDisabledReason = getClaimNftActionState({
    ...commonActionContext,
    account: address,
    claimant: expectedNftClaimant,
    claimantRoleLabel: expectedNftClaimantLabel,
    nftClaimed: auction.nftClaimed,
    finalized: auction.finalized
  }).disabledReason;

  const claimRefundDisabledReason = getClaimRefundActionState({
    ...commonActionContext,
    refundableAmount,
    refundClaimed,
    finalized: auction.finalized
  }).disabledReason;

  const rawClaimRewardDisabledReason = getClaimRewardActionState({
    ...commonActionContext,
    rewardEntitlement,
    rewardClaimed,
    finalized: auction.finalized
  }).disabledReason;
  const claimRewardDisabledReason = rawClaimRewardDisabledReason === "No reward available."
    ? "No redistribution is currently claimable."
    : rawClaimRewardDisabledReason === "Reward already claimed."
      ? "Redistribution already claimed."
      : rawClaimRewardDisabledReason;
  const availableRefundableAmount = refundClaimed === true ? 0n : refundableAmount;
  const availableRewardEntitlement = rewardClaimed === true ? 0n : rewardEntitlement;

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
        { label: "Refund available", value: availableRefundableAmount === null ? "Not loaded" : formatEth(availableRefundableAmount) },
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
        { label: "Redistribution available", value: availableRewardEntitlement === null ? "Not loaded" : formatEth(availableRewardEntitlement) },
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
        { label: "Amount", value: sellerCredit === null ? "Not loaded" : formatEth(sellerCredit) },
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
        { label: "Amount", value: protocolFeeCredit === null ? "Not loaded" : formatEth(protocolFeeCredit) },
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
    <section aria-busy={isDeploymentLoading || isLoadingClaimData || pendingAction !== null} className="min-w-0 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
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
        <InfoItem label="Refund available" value={availableRefundableAmount === null ? "Not loaded" : formatEth(availableRefundableAmount)} />
        <InfoItem label="Redistribution available" value={availableRewardEntitlement === null ? "Not loaded" : formatEth(availableRewardEntitlement)} />
        <InfoItem label="Global seller proceeds credit" value={sellerCredit === null ? "Not loaded" : formatEth(sellerCredit)} />
        <InfoItem label="Global protocol fee credit" value={protocolFeeCredit === null ? "Not loaded" : formatEth(protocolFeeCredit)} />
        <InfoItem label="NFT claimed" value={auction.nftClaimed ? "Yes" : "No"} />
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
          <InfoItem label="Recorded refundable amount" value={refundableAmount === null ? "Not loaded" : formatEth(refundableAmount)} />
          <InfoItem label="Refund claimed" value={refundClaimed === null ? "Not loaded" : refundClaimed ? "Yes" : "No"} />
          <InfoItem label="Recorded redistribution entitlement" value={rewardEntitlement === null ? "Not loaded" : formatEth(rewardEntitlement)} />
          <InfoItem label="Redistribution claimed" value={rewardClaimed === null ? "Not loaded" : rewardClaimed ? "Yes" : "No"} />
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
          onClick={() => loadWalletClaimData().catch((caught) => setMessage(walletErrorMessage(caught, "Unable to load wallet claim data.")))}
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
        <WalletTransactionStatus title="Wallet claim / withdrawal" status={txStatus} />
      </div>

      {message ? <div role="status" aria-live="polite" className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</div> : null}
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
