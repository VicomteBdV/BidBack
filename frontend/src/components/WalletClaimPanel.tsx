"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type Address,
  type EIP1193Provider
} from "viem";
import { useAccount } from "wagmi";
import { ModeBadge } from "@/components/ModeBadge";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import { targetChain, targetChainId, targetChainLabel } from "@/lib/chains";
import { fetchDeployment, type Deployment } from "@/lib/deployment";
import { formatEth, isZeroAddress, shortenAddress } from "@/lib/format";
import type { SerializedAuction } from "@/lib/auctionTypes";

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

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

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
      `Wallet-signed claims require MetaMask access to the target RPC. ${walletErrorMessage(error, "")}`
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
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

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
    setTxHash(null);
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

  async function loadWalletClaimData(successMessage = "Wallet claim data loaded.") {
    try {
      setIsLoadingClaimData(true);
      setMessage(null);

      const next = await readWalletClaimData();
      applyClaimData(next);
      setMessage(successMessage);
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

  async function afterSuccessfulAction(successMessage: string, hash: `0x${string}`) {
    setTxHash(hash);
    await onActionComplete();

    try {
      const next = await readWalletClaimData();
      applyClaimData(next);
    } catch {
      // The action succeeded. Keep the success message even if a follow-up read fails.
    }

    setMessage(successMessage);
  }

  async function claimNft() {
    try {
      setPendingAction("claim-nft");
      setMessage(null);
      setTxHash(null);

      const context = requireWalletContext();

      if (!auction.finalized) throw new Error("Auction is not finalized.");
      if (auction.nftClaimed) throw new Error("NFT already claimed.");

      if (!sameAddress(context.account, expectedNftClaimant)) {
        throw new Error(`Connected wallet is not the NFT claimant. Expected ${expectedNftClaimantLabel}: ${expectedNftClaimant}.`);
      }

      const { provider, publicClient, walletClient } = createBrowserClients(context.account);
      await verifyWalletChain(provider);

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "claimNft",
        args: [context.auctionId]
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await afterSuccessfulAction("NFT claimed with wallet signature.", hash);
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Transaction reverted."));
    } finally {
      setPendingAction(null);
    }
  }

  async function claimRefund() {
    try {
      setPendingAction("claim-refund");
      setMessage(null);
      setTxHash(null);

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

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "claimRefund",
        args: [context.auctionId]
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await afterSuccessfulAction("Refund claimed with wallet signature.", hash);
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Transaction reverted."));
    } finally {
      setPendingAction(null);
    }
  }

  async function claimReward() {
    try {
      setPendingAction("claim-reward");
      setMessage(null);
      setTxHash(null);

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

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.distributionVault,
        abi: distributionVaultAbi,
        functionName: "claim",
        args: [context.auctionId]
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await afterSuccessfulAction("Reward claimed with wallet signature.", hash);
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Transaction reverted."));
    } finally {
      setPendingAction(null);
    }
  }

  async function withdrawSellerProceeds() {
    try {
      setPendingAction("withdraw-seller");
      setMessage(null);
      setTxHash(null);

      const context = requireWalletContext();

      if (!auction.finalized) throw new Error("Auction is not finalized.");

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

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "withdrawSellerProceeds"
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await afterSuccessfulAction("Seller proceeds withdrawn with wallet signature.", hash);
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Transaction reverted."));
    } finally {
      setPendingAction(null);
    }
  }

  async function withdrawProtocolFees() {
    try {
      setPendingAction("withdraw-fees");
      setMessage(null);
      setTxHash(null);

      const context = requireWalletContext();

      if (!auction.finalized) throw new Error("Auction is not finalized.");

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

      const hash = await walletClient.writeContract({
        address: context.deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "withdrawProtocolFees"
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await afterSuccessfulAction("Protocol fees withdrawn with wallet signature.", hash);
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Transaction reverted."));
    } finally {
      setPendingAction(null);
    }
  }

  function baseDisabledReason() {
    if (!isConnected) return "Wallet not connected.";
    if (wrongNetwork) return `Wallet connected, but not on the target chain (${targetChainLabel}).`;
    if (deploymentError) return deploymentError;
    if (!deployment) return "Deployment missing or stale.";
    if (!auctionIdBigInt) return "Invalid auction ID.";
    if (isLoadingClaimData) return "Wallet claim data is loading.";
    if (pendingAction) return "Another wallet transaction is pending.";
    return null;
  }

  function finalizedDisabledReason() {
    const base = baseDisabledReason();
    if (base) return base;
    if (!auction.finalized) return "Auction is not finalized.";
    return null;
  }

  const claimNftDisabledReason = (() => {
    const base = finalizedDisabledReason();
    if (base) return base;
    if (auction.nftClaimed) return "NFT already claimed.";
    if (!sameAddress(address, expectedNftClaimant)) {
      return `Connected wallet is not the NFT claimant. Expected ${expectedNftClaimantLabel}: ${shortenAddress(expectedNftClaimant)}.`;
    }
    return null;
  })();

  const claimRefundDisabledReason = (() => {
    const base = finalizedDisabledReason();
    if (base) return base;
    if (refundableAmount === null || refundClaimed === null) return "Refresh wallet claim data.";
    if (refundClaimed) return "Refund already claimed.";
    if (refundableAmount === 0n) return "No refund available.";
    return null;
  })();

  const claimRewardDisabledReason = (() => {
    const base = finalizedDisabledReason();
    if (base) return base;
    if (rewardEntitlement === null || rewardClaimed === null) return "Refresh wallet claim data.";
    if (rewardClaimed) return "Reward already claimed.";
    if (rewardEntitlement === 0n) return "No reward available.";
    return null;
  })();

  const withdrawSellerDisabledReason = (() => {
    const base = finalizedDisabledReason();
    if (base) return base;
    if (sellerCredit === null) return "Refresh wallet claim data.";
    if (sellerCredit === 0n) return "No seller proceeds.";
    return null;
  })();

  const withdrawFeesDisabledReason = (() => {
    const base = finalizedDisabledReason();
    if (base) return base;
    if (protocolFeeCredit === null) return "Refresh wallet claim data.";
    if (protocolFeeCredit === 0n) return "No protocol fees.";
    return null;
  })();

  const statusMessage = !isConnected
    ? "Wallet not connected."
    : wrongNetwork
      ? `Wallet connected, but not on the target chain (${targetChainLabel}).`
      : !auction.finalized
        ? "Auction is not finalized."
        : null;

  return (
    <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-white">Wallet-signed claims / withdrawals</h3>
        <ModeBadge variant="wallet-signed" />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/80">
        Pull-based post-finalization actions signed in MetaMask. No server private key is used and no /api/dev route is
        called.
      </p>

      <div className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300">
        Wallet-signed claims require MetaMask access to the target RPC for {targetChainLabel}. In Codespaces with local
        Anvil, MetaMask may not reach the forwarded RPC reliably; use local-dev actions there or expose Anvil through a
        reliable localhost/testnet RPC.
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

      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="Target chain" value={`${targetChainLabel} (${targetChainId})`} />
        <InfoItem label="Wallet" value={address ? shortenAddress(address) : "Not connected"} mono />
        <InfoItem label="Wallet chain" value={chainId ? String(chainId) : "Not connected"} />
        <InfoItem label="NFT claimant" value={shortenAddress(expectedNftClaimant)} mono />
        <InfoItem label="NFT claimant role" value={expectedNftClaimantLabel} />
        <InfoItem label="Refundable amount" value={refundableAmount === null ? "Not loaded" : formatEth(refundableAmount)} />
        <InfoItem label="Refund claimed" value={refundClaimed === null ? "Not loaded" : refundClaimed ? "Yes" : "No"} />
        <InfoItem label="Reward entitlement" value={rewardEntitlement === null ? "Not loaded" : formatEth(rewardEntitlement)} />
        <InfoItem label="Reward claimed" value={rewardClaimed === null ? "Not loaded" : rewardClaimed ? "Yes" : "No"} />
        <InfoItem label="Seller proceeds credit" value={sellerCredit === null ? "Not loaded" : formatEth(sellerCredit)} />
        <InfoItem label="Protocol fee credit" value={protocolFeeCredit === null ? "Not loaded" : formatEth(protocolFeeCredit)} />
        <InfoItem label="NFT claimed" value={auction.nftClaimed ? "Yes" : "No"} />
        <InfoItem label="Auction finalized" value={auction.finalized ? "Yes" : "No"} />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={!isConnected || wrongNetwork || !deployment || isLoadingClaimData || pendingAction !== null}
          onClick={() => loadWalletClaimData().catch((caught) => setMessage(walletErrorMessage(caught, "Unable to load wallet claim data.")))}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoadingClaimData ? "Loading..." : "Refresh wallet claim data"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ActionButton
          label="Claim NFT"
          pending={pendingAction === "claim-nft"}
          disabledReason={claimNftDisabledReason}
          onClick={claimNft}
        />

        <ActionButton
          label="Claim refund"
          pending={pendingAction === "claim-refund"}
          disabledReason={claimRefundDisabledReason}
          onClick={claimRefund}
        />

        <ActionButton
          label="Claim reward"
          pending={pendingAction === "claim-reward"}
          disabledReason={claimRewardDisabledReason}
          onClick={claimReward}
        />

        <ActionButton
          label="Withdraw seller proceeds"
          pending={pendingAction === "withdraw-seller"}
          disabledReason={withdrawSellerDisabledReason}
          onClick={withdrawSellerProceeds}
        />

        <ActionButton
          label="Withdraw protocol fees"
          pending={pendingAction === "withdraw-fees"}
          disabledReason={withdrawFeesDisabledReason}
          onClick={withdrawProtocolFees}
        />
      </div>

      {message ? <div className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</div> : null}

      {txHash ? <div className="mt-3 break-all font-mono text-xs text-emerald-100/70">tx: {txHash}</div> : null}
    </section>
  );
}

function ActionButton({
  label,
  pending,
  disabledReason,
  onClick
}: {
  label: string;
  pending: boolean;
  disabledReason: string | null;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        disabled={Boolean(disabledReason)}
        onClick={onClick}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Working..." : label}
      </button>
      {disabledReason ? <p className="mt-1 text-xs text-emerald-100/70">{disabledReason}</p> : null}
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