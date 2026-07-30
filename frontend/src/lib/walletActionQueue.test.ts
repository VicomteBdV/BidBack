import { describe, expect, it } from "vitest";
import {
  buildWalletActionQueue,
  type WalletActivityAuction,
  type WalletAuctionPosition
} from "@/lib/walletActionQueue";
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
    auctionFeeRecipient: testAddresses.feeRecipient,
    isAuctionFeeRecipient: false,
    ...overrides
  };
}

function finalizedAuction(overrides: Partial<WalletActivityAuction> = {}) {
  return baseAuction({
    state: 2,
    stateLabel: "FINALIZED",
    finalized: true,
    highestBidder: testAddresses.secondBidder,
    nftClaimed: true,
    walletPosition: walletPosition(),
    ...overrides
  });
}

describe("buildWalletActionQueue", () => {
  it("returns a JSON-safe empty projection without a wallet", () => {
    const queue = buildWalletActionQueue([baseAuction()], null, { nowSeconds: 1500 });

    expect(queue.relatedAuctionCount).toBe(0);
    expect(queue.availableActionCount).toBe(0);
    expect(() => JSON.stringify(queue)).not.toThrow();
  });

  it("groups all auction actions once and applies claim priority", () => {
    const queue = buildWalletActionQueue(
      [
        finalizedAuction({
          highestBidder: testAddresses.secondBidder,
          nftClaimed: false,
          walletPosition: walletPosition({
            cap: "1200000000000000000",
            refundableAmount: "100000000000000000",
            rewardEntitlement: "10000000000000000"
          })
        })
      ],
      testAddresses.secondBidder,
      { nowSeconds: 2500 }
    );

    expect(queue.auctionActions).toHaveLength(1);
    expect(queue.auctionActions[0].actions.map((action) => action.kind)).toEqual([
      "claimNft",
      "claimRefund",
      "claimReward"
    ]);
    expect(queue.availableActionCount).toBe(3);
    expect(queue.auctionActions[0].roles).toEqual([
      "bidder",
      "highest-bidder",
      "winner",
      "nft-claimant"
    ]);
    expect([...queue.auctionActions, ...queue.watching, ...queue.history].map((item) => item.auctionId)).toEqual(["1"]);
  });

  it("uses cautious redistribution wording", () => {
    const queue = buildWalletActionQueue(
      [
        finalizedAuction({
          walletPosition: walletPosition({ cap: "1", rewardEntitlement: "10" })
        })
      ],
      testAddresses.primaryBidder,
      { nowSeconds: 2500 }
    );

    const reward = queue.auctionActions[0].actions.find((action) => action.kind === "claimReward");
    expect(reward?.description).toMatch(/not guaranteed in advance/i);
  });

  it("keeps seller proceeds as one global wallet action across auctions", () => {
    const queue = buildWalletActionQueue(
      [
        finalizedAuction({ auctionId: "1", seller: testAddresses.seller, endTime: "2000" }),
        finalizedAuction({ auctionId: "2", seller: testAddresses.seller, endTime: "3000" })
      ],
      testAddresses.seller,
      {
        nowSeconds: 4000,
        globalCredits: { sellerCredit: "1000000000000000000" }
      }
    );

    expect(queue.globalActions).toHaveLength(1);
    expect(queue.globalActions[0]).toMatchObject({
      kind: "withdrawSellerProceeds",
      amount: "1000000000000000000",
      targetAuctionId: "2"
    });
    expect(queue.globalActions[0].description).toMatch(/global wallet credit/i);
  });

  it("keeps a positive global credit visible even without an auction navigation target", () => {
    const queue = buildWalletActionQueue([], testAddresses.seller, {
      nowSeconds: 2500,
      globalCredits: { sellerCredit: "5" }
    });

    expect(queue.relatedAuctionCount).toBe(0);
    expect(queue.globalActions[0]).toMatchObject({
      kind: "withdrawSellerProceeds",
      amount: "5"
    });
    expect(queue.globalActions[0].targetAuctionId).toBeUndefined();
  });

  it("orders global seller proceeds before protocol fees", () => {
    const position = walletPosition({
      auctionFeeRecipient: testAddresses.seller,
      isAuctionFeeRecipient: true
    });
    const queue = buildWalletActionQueue(
      [finalizedAuction({ seller: testAddresses.seller, walletPosition: position })],
      testAddresses.seller,
      {
        nowSeconds: 2500,
        globalCredits: { sellerCredit: "2", protocolFeeCredit: "1" }
      }
    );

    expect(queue.globalActions.map((action) => action.kind)).toEqual([
      "withdrawSellerProceeds",
      "withdrawProtocolFees"
    ]);
  });

  it("classifies seller, highest bidder, and outbid bidder auctions as watching", () => {
    const sellerQueue = buildWalletActionQueue([baseAuction()], testAddresses.seller, { nowSeconds: 1500 });
    const highestQueue = buildWalletActionQueue(
      [
        baseAuction({
          highestBidder: testAddresses.primaryBidder,
          walletPosition: walletPosition({ cap: "2" })
        })
      ],
      testAddresses.primaryBidder,
      { nowSeconds: 1500 }
    );
    const outbidQueue = buildWalletActionQueue(
      [
        baseAuction({
          highestBidder: testAddresses.secondBidder,
          walletPosition: walletPosition({ cap: "1" })
        })
      ],
      testAddresses.primaryBidder,
      { nowSeconds: 1500 }
    );

    expect(sellerQueue.watching[0].roles).toContain("seller");
    expect(highestQueue.watching[0].roles).toContain("highest-bidder");
    expect(outbidQueue.watching[0].reason).toMatch(/not the current highest bidder/i);
    expect(outbidQueue).not.toHaveProperty("attentionSoon");
  });

  it("offers permissionless finalization only for a related expired auction", () => {
    const queue = buildWalletActionQueue(
      [baseAuction({ seller: testAddresses.seller, endTime: "2000" })],
      testAddresses.seller,
      { nowSeconds: 2500 }
    );

    expect(queue.auctionActions[0].actions.map((action) => action.kind)).toEqual(["finalize"]);
  });

  it("puts settled auctions in history, newest first", () => {
    const queue = buildWalletActionQueue(
      [
        finalizedAuction({ auctionId: "1", endTime: "2000", walletPosition: walletPosition({ cap: "1", refundClaimed: true }) }),
        finalizedAuction({ auctionId: "2", endTime: "3000", walletPosition: walletPosition({ cap: "1", refundClaimed: true }) })
      ],
      testAddresses.primaryBidder,
      { nowSeconds: 4000 }
    );

    expect(queue.history.map((item) => item.auctionId)).toEqual(["2", "1"]);
  });

  it("sorts action items deterministically by priority, end time, and auction id", () => {
    const refundAuction = (auctionId: string, endTime: string) =>
      finalizedAuction({
        auctionId,
        endTime,
        walletPosition: walletPosition({ cap: "1", refundableAmount: "1" })
      });
    const nftAuction = finalizedAuction({
      auctionId: "9",
      endTime: "5000",
      highestBidder: testAddresses.primaryBidder,
      nftClaimed: false,
      walletPosition: walletPosition({ cap: "2" })
    });
    const queue = buildWalletActionQueue(
      [refundAuction("3", "3000"), nftAuction, refundAuction("2", "3000")],
      testAddresses.primaryBidder,
      { nowSeconds: 6000 }
    );

    expect(queue.auctionActions.map((item) => item.auctionId)).toEqual(["9", "2", "3"]);
  });

  it("keeps incomplete wallet reads in watching and surfaces warnings", () => {
    const queue = buildWalletActionQueue(
      [
        finalizedAuction({
          seller: testAddresses.seller,
          highestBidder: testAddresses.secondBidder,
          walletPosition: undefined,
          walletPositionError: "RPC timeout"
        })
      ],
      testAddresses.seller,
      { nowSeconds: 2500, partial: true, warnings: ["Bounded discovery"] }
    );

    expect(queue.partial).toBe(true);
    expect(queue.watching[0].partial).toBe(true);
    expect(queue.warnings).toEqual(expect.arrayContaining(["Bounded discovery", "Auction #1: RPC timeout"]));
  });

  it("ignores malformed amount strings without throwing or inventing actions", () => {
    expect(() =>
      buildWalletActionQueue(
        [finalizedAuction({ walletPosition: walletPosition({ cap: "invalid", refundableAmount: "invalid" }) })],
        testAddresses.primaryBidder,
        { nowSeconds: 2500 }
      )
    ).not.toThrow();

    const queue = buildWalletActionQueue(
      [finalizedAuction({ walletPosition: walletPosition({ cap: "invalid", refundableAmount: "invalid" }) })],
      testAddresses.primaryBidder,
      { nowSeconds: 2500 }
    );
    expect(queue.availableActionCount).toBe(0);
  });

  it("does not use the wallet selected network as a read-only classification input", () => {
    const auction = finalizedAuction({
      highestBidder: testAddresses.primaryBidder,
      nftClaimed: false,
      walletPosition: walletPosition({ cap: "2" })
    });
    const first = buildWalletActionQueue([auction], testAddresses.primaryBidder, { nowSeconds: 2500 });
    const second = buildWalletActionQueue([auction], testAddresses.primaryBidder, { nowSeconds: 2500 });

    expect(second).toEqual(first);
    expect(first.auctionActions[0].actions[0].kind).toBe("claimNft");
  });
});
