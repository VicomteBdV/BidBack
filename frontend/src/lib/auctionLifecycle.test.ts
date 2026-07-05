import { describe, expect, it } from "vitest";
import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { testAddresses } from "@/test/fixtures";

function baseAuction(overrides: Partial<SerializedAuction> = {}): SerializedAuction {
  return {
    auctionId: "1",
    seller: testAddresses.seller,
    nft: testAddresses.localNft,
    tokenId: "1",
    startPrice: "1000000000000000000",
    startTime: "1000",
    initialEndTime: "2000",
    endTime: "2000",
    extensionsUsed: 0,
    state: 0,
    stateLabel: "OPEN",
    highestBidder: "0x0000000000000000000000000000000000000000",
    highestBid: "0",
    participantCount: "0",
    bidCount: "0",
    nftClaimed: false,
    finalized: false,
    ...overrides
  };
}

function finalizedEconomics() {
  return {
    primaryBidder: {
      role: "primary" as const,
      label: "Bidder #1",
      address: testAddresses.primaryBidder,
      configured: true,
      cap: "1000000000000000000",
      refundableAmount: "1000000000000000000",
      refundClaimed: false,
      rewardEntitlement: "10000000000000000",
      rewardClaimed: false,
      canClaimRefund: true,
      canClaimReward: true
    },
    secondBidder: {
      role: "secondary" as const,
      label: "Bidder #2",
      address: testAddresses.secondBidder,
      configured: true,
      cap: "1200000000000000000",
      refundableAmount: "0",
      refundClaimed: false,
      rewardEntitlement: "0",
      rewardClaimed: false,
      canClaimRefund: false,
      canClaimReward: false
    },
    settlement: {
      finalized: true,
      winner: testAddresses.secondBidder,
      distributionVault: testAddresses.distributionVault,
      finalPrice: "1200000000000000000",
      sellerProceeds: "1100000000000000000",
      feeAmount: "10000000000000000",
      distributionReserve: "90000000000000000"
    },
    distribution: {
      opened: true,
      totalAssigned: "10000000000000000",
      totalClaimed: "0"
    },
    seller: {
      address: testAddresses.seller,
      configuredAddress: testAddresses.seller,
      configured: true,
      credit: "1100000000000000000",
      canWithdraw: true
    },
    feeRecipient: {
      address: testAddresses.feeRecipient,
      currentGlobalAddress: testAddresses.feeRecipient,
      configuredAddress: testAddresses.feeRecipient,
      configured: true,
      credit: "10000000000000000",
      canWithdraw: true
    },
    nftClaim: {
      claimant: testAddresses.secondBidder,
      claimantRole: "secondary" as const,
      canClaim: true
    },
    hasLosingBidder: true
  };
}

describe("getAuctionLifecycle", () => {
  it("describes an open auction", () => {
    const lifecycle = getAuctionLifecycle(
      baseAuction({
        highestBidder: testAddresses.primaryBidder,
        highestBid: "1000000000000000000"
      }),
      1500
    );

    expect(lifecycle.statusLabel).toBe("Open");
    expect(lifecycle.currentPhase).toBe("Bidding");
    expect(lifecycle.canBid).toBe(true);
    expect(lifecycle.canFinalize).toBe(false);
  });

  it("describes an expired auction that is ready to finalize", () => {
    const lifecycle = getAuctionLifecycle(
      baseAuction({
        highestBidder: testAddresses.primaryBidder,
        highestBid: "1000000000000000000"
      }),
      2500
    );

    expect(lifecycle.statusLabel).toBe("Ready to finalize");
    expect(lifecycle.currentPhase).toBe("Finalization");
    expect(lifecycle.canBid).toBe(false);
    expect(lifecycle.canFinalize).toBe(true);
  });

  it("describes a finalized auction with claimable lifecycle items", () => {
    const lifecycle = getAuctionLifecycle(
      baseAuction({
        state: 2,
        stateLabel: "FINALIZED",
        finalized: true,
        highestBidder: testAddresses.secondBidder,
        highestBid: "1200000000000000000",
        economics: finalizedEconomics()
      }),
      2500
    );

    expect(lifecycle.statusLabel).toBe("Finalized");
    expect(lifecycle.currentPhase).toBe("Claims and withdrawals");
    expect(lifecycle.hasClaimableNft).toBe(true);
    expect(lifecycle.hasRefund).toBe(true);
    expect(lifecycle.hasReward).toBe(true);
    expect(lifecycle.hasSellerProceeds).toBe(true);
    expect(lifecycle.hasProtocolFees).toBe(true);
    expect(lifecycle.claimableItems).toEqual(["NFT claim", "Refund", "Reward", "Seller proceeds", "Protocol fees"]);
  });

  it("describes a settled auction when no visible claims remain", () => {
    const economics = finalizedEconomics();
    economics.primaryBidder.refundableAmount = "0";
    economics.primaryBidder.refundClaimed = true;
    economics.primaryBidder.rewardEntitlement = "0";
    economics.primaryBidder.rewardClaimed = true;
    economics.seller.credit = "0";
    economics.feeRecipient.credit = "0";

    const lifecycle = getAuctionLifecycle(
      baseAuction({
        state: 2,
        stateLabel: "FINALIZED",
        finalized: true,
        nftClaimed: true,
        highestBidder: testAddresses.secondBidder,
        highestBid: "1200000000000000000",
        economics
      }),
      2500
    );

    expect(lifecycle.statusLabel).toBe("Settled");
    expect(lifecycle.currentPhase).toBe("Settled");
    expect(lifecycle.hasAnyClaimOrWithdrawal).toBe(false);
  });
});
