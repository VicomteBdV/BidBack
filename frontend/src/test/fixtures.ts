import type { AuctionDetailApiResponse } from "@/lib/auctionTypes";
import type { LocalDeployment } from "@/lib/deployment";

export const testAddresses = {
  auctionHouse: "0x0000000000000000000000000000000000001001",
  nftVault: "0x0000000000000000000000000000000000001002",
  escrowVault: "0x0000000000000000000000000000000000001003",
  distributionVault: "0x0000000000000000000000000000000000001004",
  paramsController: "0x0000000000000000000000000000000000001005",
  reputationAdapter: "0x0000000000000000000000000000000000001006",
  localNft: "0x0000000000000000000000000000000000001007",
  seller: "0x0000000000000000000000000000000000002001",
  primaryBidder: "0x0000000000000000000000000000000000002002",
  secondBidder: "0x0000000000000000000000000000000000002003",
  feeRecipient: "0x0000000000000000000000000000000000002004"
} as const;

export const localDeploymentFixture = {
  chainId: 31337,
  generatedAt: "2026-01-01T00:00:00.000Z",
  source: "test",
  contracts: {
    auctionHouse: testAddresses.auctionHouse,
    nftVault: testAddresses.nftVault,
    escrowVault: testAddresses.escrowVault,
    distributionVault: testAddresses.distributionVault,
    paramsController: testAddresses.paramsController,
    reputationAdapter: testAddresses.reputationAdapter,
    localNft: testAddresses.localNft
  }
} satisfies LocalDeployment;

export const auctionDetailFixture = {
  chainId: 31337,
  auctionHouse: testAddresses.auctionHouse,
  auction: {
    auctionId: "1",
    seller: testAddresses.seller,
    nft: testAddresses.localNft,
    tokenId: "1",
    startPrice: "1000000000000000000",
    startTime: "1780000000",
    initialEndTime: "1780007200",
    endTime: "1780007200",
    extensionsUsed: 0,
    state: 0,
    stateLabel: "OPEN",
    highestBidder: testAddresses.secondBidder,
    highestBid: "1200000000000000000",
    participantCount: "2",
    bidCount: "2",
    nftClaimed: false,
    finalized: false,
    economics: {
      primaryBidder: {
        role: "primary",
        label: "Bidder #1",
        address: testAddresses.primaryBidder,
        configured: true,
        cap: "1000000000000000000",
        refundableAmount: "1000000000000000000",
        refundClaimed: false,
        rewardEntitlement: "10000000000000000",
        rewardClaimed: false,
        canClaimRefund: false,
        canClaimReward: false
      },
      secondBidder: {
        role: "secondary",
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
        finalized: false,
        winner: testAddresses.secondBidder,
        distributionVault: testAddresses.distributionVault,
        finalPrice: "0",
        sellerProceeds: "0",
        feeAmount: "0",
        distributionReserve: "0"
      },
      distribution: {
        opened: false,
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
        canClaim: false
      },
      hasLosingBidder: false
    }
  }
} satisfies AuctionDetailApiResponse;