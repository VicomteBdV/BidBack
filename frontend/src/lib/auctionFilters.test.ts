import { describe, expect, it } from "vitest";
import { filterAndSortAuctions } from "@/lib/auctionFilters";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { testAddresses } from "@/test/fixtures";

const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

function auctionFixture(overrides: Partial<SerializedAuction> = {}): SerializedAuction {
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

function run(auctions: SerializedAuction[], overrides: Partial<Parameters<typeof filterAndSortAuctions>[1]> = {}) {
  return filterAndSortAuctions(auctions, {
    status: "all",
    query: "",
    sort: "newest",
    nowSeconds: 1_500,
    ...overrides
  });
}

describe("auctionFilters", () => {
  it("filters open auctions", () => {
    const result = run([
      auctionFixture({ auctionId: "1", endTime: "2500" }),
      auctionFixture({ auctionId: "2", endTime: "1000" }),
      auctionFixture({ auctionId: "3", state: 2, stateLabel: "FINALIZED", finalized: true })
    ], {
      status: "open"
    });

    expect(result.map((auction) => auction.auctionId)).toEqual(["1"]);
  });

  it("filters auctions ready to finalize", () => {
    const result = run([
      auctionFixture({ auctionId: "1", endTime: "2500" }),
      auctionFixture({ auctionId: "2", endTime: "1000" }),
      auctionFixture({ auctionId: "3", state: 2, stateLabel: "FINALIZED", finalized: true })
    ], {
      status: "readyToFinalize"
    });

    expect(result.map((auction) => auction.auctionId)).toEqual(["2"]);
  });

  it("filters finalized and settled auctions", () => {
    const finalized = auctionFixture({ auctionId: "2", state: 2, stateLabel: "FINALIZED", finalized: true });
    const settled = auctionFixture({
      auctionId: "3",
      state: 2,
      stateLabel: "FINALIZED",
      finalized: true,
      nftClaimed: true
    });

    expect(run([auctionFixture(), finalized, settled], { status: "finalized" }).map((auction) => auction.auctionId)).toEqual([
      "3",
      "2"
    ]);
    expect(run([auctionFixture(), finalized, settled], { status: "settled" }).map((auction) => auction.auctionId)).toEqual([
      "3"
    ]);
  });

  it("filters claimable or withdrawable auctions when economics are available", () => {
    const result = run([
      auctionFixture({ auctionId: "1", state: 2, stateLabel: "FINALIZED", finalized: true }),
      auctionFixture({
        auctionId: "2",
        state: 2,
        stateLabel: "FINALIZED",
        finalized: true,
        economics: {
          primaryBidder: {
            role: "primary",
            label: "Bidder #1",
            address: testAddresses.primaryBidder,
            configured: true,
            cap: "100",
            refundableAmount: "100",
            refundClaimed: false,
            rewardEntitlement: "0",
            rewardClaimed: false,
            canClaimRefund: true,
            canClaimReward: false
          },
          secondBidder: {
            role: "secondary",
            label: "Bidder #2",
            address: testAddresses.secondBidder,
            configured: true,
            cap: "0",
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
            finalPrice: "0",
            sellerProceeds: "0",
            feeAmount: "0",
            distributionReserve: "0"
          },
          distribution: {
            opened: true,
            totalAssigned: "0",
            totalClaimed: "0"
          },
          seller: {
            address: testAddresses.seller,
            configuredAddress: testAddresses.seller,
            configured: true,
            credit: "0",
            canWithdraw: false
          },
          feeRecipient: {
            address: testAddresses.feeRecipient,
            currentGlobalAddress: testAddresses.feeRecipient,
            configuredAddress: testAddresses.feeRecipient,
            configured: true,
            credit: "0",
            canWithdraw: false
          },
          nftClaim: {
            claimant: testAddresses.secondBidder,
            claimantRole: "secondary",
            canClaim: true
          },
          hasLosingBidder: true
        }
      })
    ], {
      status: "claimable"
    });

    expect(result.map((auction) => auction.auctionId)).toEqual(["2"]);
  });

  it("searches by auction ID, NFT metadata name, collection name, and contract address", () => {
    const auctions = [
      auctionFixture({ auctionId: "1" }),
      auctionFixture({
        auctionId: "7",
        nft: "0x0000000000000000000000000000000000009999",
        tokenId: "42",
        nftMetadata: {
          contractAddress: "0x0000000000000000000000000000000000009999",
          tokenId: "42",
          metadataName: "Golden Test NFT",
          collectionName: "BidBack Browse Collection",
          collectionSymbol: "BBC",
          status: "loaded"
        }
      })
    ];

    expect(run(auctions, { query: "auction #7" }).map((auction) => auction.auctionId)).toEqual(["7"]);
    expect(run(auctions, { query: "golden" }).map((auction) => auction.auctionId)).toEqual(["7"]);
    expect(run(auctions, { query: "browse collection" }).map((auction) => auction.auctionId)).toEqual(["7"]);
    expect(run(auctions, { query: "0000009999" }).map((auction) => auction.auctionId)).toEqual(["7"]);
  });

  it("filters by connected wallet when wallet-scoped data is available", () => {
    const auctions = [
      auctionFixture({ auctionId: "1", seller: testAddresses.seller }),
      auctionFixture({ auctionId: "2", seller: testAddresses.primaryBidder }),
      auctionFixture({ auctionId: "3", highestBidder: testAddresses.primaryBidder })
    ];

    expect(
      run(auctions, {
        status: "createdByWallet",
        connectedWallet: testAddresses.primaryBidder
      }).map((auction) => auction.auctionId)
    ).toEqual(["2"]);
    expect(
      run(auctions, {
        status: "involvingWallet",
        connectedWallet: testAddresses.primaryBidder
      }).map((auction) => auction.auctionId)
    ).toEqual(["3", "2"]);
  });

  it("sorts newest, oldest, ending soon, and highest bid", () => {
    const auctions = [
      auctionFixture({ auctionId: "1", endTime: "4000", highestBid: "10" }),
      auctionFixture({ auctionId: "2", endTime: "2500", highestBid: "30" }),
      auctionFixture({ auctionId: "3", endTime: "3000", highestBid: "20" })
    ];

    expect(run(auctions, { sort: "newest" }).map((auction) => auction.auctionId)).toEqual(["3", "2", "1"]);
    expect(run(auctions, { sort: "oldest" }).map((auction) => auction.auctionId)).toEqual(["1", "2", "3"]);
    expect(run(auctions, { sort: "endingSoon" }).map((auction) => auction.auctionId)).toEqual(["2", "3", "1"]);
    expect(run(auctions, { sort: "highestBid" }).map((auction) => auction.auctionId)).toEqual(["2", "3", "1"]);
  });
});
