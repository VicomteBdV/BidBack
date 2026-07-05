import { describe, expect, it } from "vitest";
import { buildWalletActivity, type WalletActivityAuction, type WalletAuctionPosition } from "@/lib/walletActivity";
import { testAddresses } from "@/test/fixtures";

const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

function baseAuction(overrides: Partial<WalletActivityAuction> = {}): WalletActivityAuction {
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
    highestBidder: zeroAddress,
    highestBid: "0",
    participantCount: "0",
    bidCount: "0",
    nftClaimed: false,
    finalized: false,
    ...overrides
  };
}

function walletPosition(overrides: Partial<WalletAuctionPosition> = {}): WalletAuctionPosition {
  return {
    cap: "0",
    refundableAmount: "0",
    refundClaimed: false,
    rewardEntitlement: "0",
    rewardClaimed: false,
    sellerCredit: "0",
    protocolFeeCredit: "0",
    auctionFeeRecipient: testAddresses.feeRecipient,
    isAuctionFeeRecipient: false,
    ...overrides
  };
}

describe("buildWalletActivity", () => {
  it("returns a connect-wallet warning when no wallet is provided", () => {
    const activity = buildWalletActivity([baseAuction()], null, 1500);

    expect(activity.walletConnected).toBe(false);
    expect(activity.hasActivity).toBe(false);
    expect(activity.warnings[0]).toMatch(/Connect a wallet/);
  });

  it("returns an empty connected activity state when the wallet is unrelated", () => {
    const activity = buildWalletActivity(
      [baseAuction({ walletPosition: walletPosition() })],
      testAddresses.primaryBidder,
      1500
    );

    expect(activity.walletConnected).toBe(true);
    expect(activity.hasActivity).toBe(false);
    expect(activity.nextActions).toHaveLength(0);
  });

  it("tracks seller auctions and withdrawable seller proceeds", () => {
    const activity = buildWalletActivity(
      [
        baseAuction({
          state: 2,
          stateLabel: "FINALIZED",
          finalized: true,
          highestBidder: testAddresses.secondBidder,
          walletPosition: walletPosition({ sellerCredit: "1000000000000000000" })
        })
      ],
      testAddresses.seller,
      2500
    );

    expect(activity.createdAuctions).toBe(1);
    expect(activity.withdrawableSellerProceeds).toBe(1);
    expect(activity.sellerProceedsAvailable).toBe("1000000000000000000");
    expect(activity.nextActions.some((action) => action.kind === "withdrawSellerProceeds")).toBe(true);
  });

  it("tracks active bids that can be increased", () => {
    const activity = buildWalletActivity(
      [
        baseAuction({
          highestBidder: testAddresses.secondBidder,
          highestBid: "1200000000000000000",
          walletPosition: walletPosition({ cap: "1000000000000000000" })
        })
      ],
      testAddresses.primaryBidder,
      1500
    );

    expect(activity.activeBids).toBe(1);
    expect(activity.nextActions.some((action) => action.kind === "bid")).toBe(true);
  });

  it("tracks a winner with a claimable NFT", () => {
    const activity = buildWalletActivity(
      [
        baseAuction({
          state: 2,
          stateLabel: "FINALIZED",
          finalized: true,
          highestBidder: testAddresses.secondBidder,
          nftClaimed: false,
          walletPosition: walletPosition({ cap: "1200000000000000000" })
        })
      ],
      testAddresses.secondBidder,
      2500
    );

    expect(activity.wonAuctions).toBe(1);
    expect(activity.claimableNfts).toBe(1);
    expect(activity.nextActions.some((action) => action.kind === "claimNft")).toBe(true);
  });

  it("tracks a losing bidder with refund and reward available", () => {
    const activity = buildWalletActivity(
      [
        baseAuction({
          state: 2,
          stateLabel: "FINALIZED",
          finalized: true,
          highestBidder: testAddresses.secondBidder,
          walletPosition: walletPosition({
            cap: "1000000000000000000",
            refundableAmount: "1000000000000000000",
            rewardEntitlement: "10000000000000000"
          })
        })
      ],
      testAddresses.primaryBidder,
      2500
    );

    expect(activity.lostAuctions).toBe(1);
    expect(activity.claimableRefunds).toBe(1);
    expect(activity.claimableRewards).toBe(1);
    expect(activity.totalRefundableAmount).toBe("1000000000000000000");
    expect(activity.totalRewardEntitlement).toBe("10000000000000000");
    expect(activity.nextActions.some((action) => action.kind === "claimRefund")).toBe(true);
    expect(activity.nextActions.some((action) => action.kind === "claimReward")).toBe(true);
  });

  it("tracks a fee recipient with protocol fees available", () => {
    const activity = buildWalletActivity(
      [
        baseAuction({
          state: 2,
          stateLabel: "FINALIZED",
          finalized: true,
          highestBidder: testAddresses.secondBidder,
          walletPosition: walletPosition({
            auctionFeeRecipient: testAddresses.feeRecipient,
            isAuctionFeeRecipient: true,
            protocolFeeCredit: "20000000000000000"
          })
        })
      ],
      testAddresses.feeRecipient,
      2500
    );

    expect(activity.withdrawableProtocolFees).toBe(1);
    expect(activity.protocolFeesAvailable).toBe("20000000000000000");
    expect(activity.nextActions.some((action) => action.kind === "withdrawProtocolFees")).toBe(true);
  });
});
