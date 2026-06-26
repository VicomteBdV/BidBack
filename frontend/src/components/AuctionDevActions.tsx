"use client";

import { useState } from "react";
import type { AuctionEconomics, DevBidderRole } from "@/lib/auctionTypes";
import { formatEth, shortenAddress } from "@/lib/format";

type DevActionResponse = {
  status: "ok" | "error";
  action: string;
  localDevOnly: true;
  txHash?: `0x${string}`;
  bidder?: `0x${string}`;
  claimant?: `0x${string}`;
  recipient?: `0x${string}`;
  bidAmount?: string;
  valueSent?: string;
  amount?: string;
  timeIncreasedBy?: string;
  error?: string;
};

function gtZero(value: string) {
  return BigInt(value) > 0n;
}

export function AuctionDevActions({
  auctionId,
  auctionState,
  finalized,
  economics,
  onActionComplete
}: {
  auctionId: string;
  auctionState: number;
  finalized: boolean;
  economics?: AuctionEconomics;
  onActionComplete: () => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  const primary = economics?.primaryBidder;
  const second = economics?.secondBidder;

  const primaryHasBid = primary ? gtZero(primary.cap) : false;
  const secondHasBid = second ? gtZero(second.cap) : false;

  const canPrimaryBid = auctionState === 0 && Boolean(primary?.configured) && !primaryHasBid;
  const canSecondBid = auctionState === 0 && Boolean(second?.configured) && primaryHasBid && !secondHasBid;
  const canFinalize = !finalized;
  const canClaimNft = Boolean(economics?.nftClaim.canClaim);
  const canWithdrawSeller = Boolean(economics?.seller.canWithdraw);
  const canWithdrawFees = Boolean(economics?.feeRecipient.canWithdraw);

  async function runDevAction({
    key,
    endpoint,
    body,
    success
  }: {
    key: string;
    endpoint: string;
    body?: Record<string, unknown>;
    success: (payload: DevActionResponse) => string;
  }) {
    try {
      setPendingAction(key);
      setMessage(null);
      setLastTxHash(null);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ auctionId, ...body })
      });

      const payload = (await response.json().catch(() => null)) as DevActionResponse | null;

      if (!response.ok || !payload || payload.status === "error") {
        throw new Error(payload?.error ?? "Local dev action failed");
      }

      setLastTxHash(payload.txHash ?? null);
      setMessage(success(payload));
      await onActionComplete();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Local dev action failed");
    } finally {
      setPendingAction(null);
    }
  }

  function placeBid(role: DevBidderRole) {
    return runDevAction({
      key: `bid-${role}`,
      endpoint: "/api/dev/place-bid",
      body: { bidderRole: role },
      success: (payload) =>
        `Demo bid placed by ${shortenAddress(payload.bidder)} at ${formatEth(payload.bidAmount)}. Value sent: ${formatEth(
          payload.valueSent
        )}.`
    });
  }

  return (
    <section className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-100">Local dev actions only</h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-100/80">
        These buttons use local Anvil dev keys on the Next.js server. They are for Codespaces MVP testing only and are
        not a production transaction flow.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ActionButton
          label="Place primary demo bid"
          disabled={!canPrimaryBid || pendingAction !== null}
          pending={pendingAction === "bid-primary"}
          disabledReason={
            auctionState !== 0
              ? "Auction is not OPEN"
              : !primary?.configured
                ? "Primary bidder key missing"
                : primaryHasBid
                  ? "Primary bidder already has a cap"
                  : undefined
          }
          onClick={() => placeBid("primary")}
        />

        <ActionButton
          label="Place second demo bid"
          disabled={!canSecondBid || pendingAction !== null}
          pending={pendingAction === "bid-secondary"}
          disabledReason={
            auctionState !== 0
              ? "Auction is not OPEN"
              : !second?.configured
                ? "Second bidder key missing"
                : !primaryHasBid
                  ? "Primary bid required first"
                  : secondHasBid
                    ? "Second bidder already has a cap"
                    : undefined
          }
          onClick={() => placeBid("secondary")}
        />

        <ActionButton
          label="Finalize auction"
          disabled={!canFinalize || pendingAction !== null}
          pending={pendingAction === "finalize"}
          disabledReason={finalized ? "Auction already finalized" : undefined}
          onClick={() =>
            runDevAction({
              key: "finalize",
              endpoint: "/api/dev/finalize",
              success: (payload) => `Auction finalized. Time increased by ${payload.timeIncreasedBy ?? "0"} seconds.`
            })
          }
        />

        <ActionButton
          label="Claim NFT"
          disabled={!canClaimNft || pendingAction !== null}
          pending={pendingAction === "claim-nft"}
          disabledReason={
            !finalized
              ? "Auction not finalized"
              : economics?.nftClaim.canClaim === false
                ? "NFT already claimed or claimant unavailable"
                : undefined
          }
          onClick={() =>
            runDevAction({
              key: "claim-nft",
              endpoint: "/api/dev/claim-nft",
              success: (payload) => `NFT claimed by ${shortenAddress(payload.claimant)}.`
            })
          }
        />

        <ClaimButton
          label="Claim bidder #1 refund"
          role="primary"
          type="refund"
          enabled={Boolean(primary?.canClaimRefund)}
          pendingAction={pendingAction}
          runDevAction={runDevAction}
          disabledReason={
            !finalized
              ? "Auction not finalized"
              : !primary?.configured
                ? "Bidder #1 key missing"
                : primary.refundClaimed
                  ? "Refund already claimed"
                  : !gtZero(primary.refundableAmount)
                    ? "No refundable amount"
                    : undefined
          }
        />

        <ClaimButton
          label="Claim bidder #1 reward"
          role="primary"
          type="reward"
          enabled={Boolean(primary?.canClaimReward)}
          pendingAction={pendingAction}
          runDevAction={runDevAction}
          disabledReason={
            !finalized
              ? "Auction not finalized"
              : !primary?.configured
                ? "Bidder #1 key missing"
                : primary.rewardClaimed
                  ? "Reward already claimed"
                  : !gtZero(primary.rewardEntitlement)
                    ? "No reward entitlement"
                    : undefined
          }
        />

        <ClaimButton
          label="Claim bidder #2 refund"
          role="secondary"
          type="refund"
          enabled={Boolean(second?.canClaimRefund)}
          pendingAction={pendingAction}
          runDevAction={runDevAction}
          disabledReason={
            !finalized
              ? "Auction not finalized"
              : !second?.configured
                ? "Bidder #2 key missing"
                : second.refundClaimed
                  ? "Refund already claimed"
                  : !gtZero(second.refundableAmount)
                    ? "No refundable amount"
                    : undefined
          }
        />

        <ClaimButton
          label="Claim bidder #2 reward"
          role="secondary"
          type="reward"
          enabled={Boolean(second?.canClaimReward)}
          pendingAction={pendingAction}
          runDevAction={runDevAction}
          disabledReason={
            !finalized
              ? "Auction not finalized"
              : !second?.configured
                ? "Bidder #2 key missing"
                : second.rewardClaimed
                  ? "Reward already claimed"
                  : !gtZero(second.rewardEntitlement)
                    ? "No reward entitlement"
                    : undefined
          }
        />

        <ActionButton
          label="Withdraw seller proceeds"
          disabled={!canWithdrawSeller || pendingAction !== null}
          pending={pendingAction === "withdraw-seller"}
          disabledReason={
            !finalized
              ? "Auction not finalized"
              : !economics?.seller.configured
                ? "Seller key missing"
                : !gtZero(economics.seller.credit)
                  ? "Seller proceeds already withdrawn or unavailable"
                  : undefined
          }
          onClick={() =>
            runDevAction({
              key: "withdraw-seller",
              endpoint: "/api/dev/withdraw-seller-proceeds",
              success: (payload) => `Seller proceeds withdrawn: ${formatEth(payload.amount)}.`
            })
          }
        />

        <ActionButton
          label="Withdraw protocol fees"
          disabled={!canWithdrawFees || pendingAction !== null}
          pending={pendingAction === "withdraw-fees"}
          disabledReason={
            !finalized
              ? "Auction not finalized"
              : !economics?.feeRecipient.configured
                ? "Fee recipient key missing"
                : !gtZero(economics.feeRecipient.credit)
                  ? "Protocol fees already withdrawn or unavailable"
                  : undefined
          }
          onClick={() =>
            runDevAction({
              key: "withdraw-fees",
              endpoint: "/api/dev/withdraw-protocol-fees",
              success: (payload) => `Protocol fees withdrawn: ${formatEth(payload.amount)}.`
            })
          }
        />
      </div>

      {!economics?.hasLosingBidder && finalized ? (
        <p className="mt-4 text-xs text-amber-100/70">
          This auction has no configured losing bidder with a refundable amount. Run the two-bidder demo flow on a fresh
          deployment to test refund and reward claims.
        </p>
      ) : null}

      {message ? <div className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</div> : null}

      {lastTxHash ? <div className="mt-3 break-all font-mono text-xs text-amber-100/70">tx: {lastTxHash}</div> : null}
    </section>
  );
}

function ActionButton({
  label,
  disabled,
  pending,
  disabledReason,
  onClick
}: {
  label: string;
  disabled: boolean;
  pending: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Working..." : label}
      </button>
      {disabledReason ? <p className="mt-1 text-xs text-amber-100/70">{disabledReason}</p> : null}
    </div>
  );
}

function ClaimButton({
  label,
  role,
  type,
  enabled,
  pendingAction,
  disabledReason,
  runDevAction
}: {
  label: string;
  role: DevBidderRole;
  type: "refund" | "reward";
  enabled: boolean;
  pendingAction: string | null;
  disabledReason?: string;
  runDevAction: (args: {
    key: string;
    endpoint: string;
    body?: Record<string, unknown>;
    success: (payload: DevActionResponse) => string;
  }) => Promise<void>;
}) {
  const key = `claim-${type}-${role}`;
  const endpoint = type === "refund" ? "/api/dev/claim-refund" : "/api/dev/claim-reward";

  return (
    <ActionButton
      label={label}
      disabled={!enabled || pendingAction !== null}
      pending={pendingAction === key}
      disabledReason={disabledReason}
      onClick={() =>
        runDevAction({
          key,
          endpoint,
          body: { bidderRole: role },
          success: (payload) => `${label} succeeded for ${shortenAddress(payload.claimant)}.`
        })
      }
    />
  );
}