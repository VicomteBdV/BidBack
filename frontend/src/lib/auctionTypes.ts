export type AuctionStateValue = 0 | 1 | 2;
export type DevBidderRole = "primary" | "secondary";

export type AuctionParamsSnapshot = {
  bidbackFeeBps: string;
  redistributionBps: string;
  minParticipants: string;
  alphaBps: string;
  betaBps: string;
  gammaBps: string;
  minBidIncrementBps: string;
  perUserRewardCapBps: string;
  maxParticipants: string;
  maxInteractionCount: string;
  minAuctionDuration: string;
  antiSnipeWindow: string;
  antiSnipeExtension: string;
  maxAntiSnipeExtensions: string;
  minExposure: string;
  minPremiumNet: string;
  efCap: string;
  etCap: string;
  iiCap: string;
};

export type SerializedAuction = {
  auctionId: string;
  seller: `0x${string}`;
  nft: `0x${string}`;
  tokenId: string;
  startPrice: string;
  startTime: string;
  initialEndTime: string;
  endTime: string;
  extensionsUsed: number;
  state: AuctionStateValue;
  stateLabel: string;
  highestBidder: `0x${string}`;
  highestBid: string;
  participantCount: string;
  bidCount: string;
  nftClaimed: boolean;
  finalized: boolean;
  paramsSnapshot?: AuctionParamsSnapshot;
  paramsSnapshotError?: string;
  auctionFeeRecipient?: `0x${string}`;
  auctionFeeRecipientError?: string;
  economics?: AuctionEconomics;
};

export type BidderEconomics = {
  role: DevBidderRole;
  label: string;
  address: `0x${string}` | null;
  configured: boolean;
  cap: string;
  refundableAmount: string;
  refundClaimed: boolean;
  rewardEntitlement: string;
  rewardClaimed: boolean;
  canClaimRefund: boolean;
  canClaimReward: boolean;
};

export type SettlementEconomics = {
  finalized: boolean;
  winner: `0x${string}`;
  distributionVault: `0x${string}`;
  finalPrice: string;
  sellerProceeds: string;
  feeAmount: string;
  distributionReserve: string;
};

export type DistributionEconomics = {
  opened: boolean;
  totalAssigned: string;
  totalClaimed: string;
};

export type AuctionEconomics = {
  primaryBidder: BidderEconomics;
  secondBidder: BidderEconomics;
  settlement: SettlementEconomics;
  distribution: DistributionEconomics;
  seller: {
    address: `0x${string}`;
    configuredAddress: `0x${string}` | null;
    configured: boolean;
    credit: string;
    canWithdraw: boolean;
  };
  feeRecipient: {
    address: `0x${string}`;
    currentGlobalAddress: `0x${string}`;
    configuredAddress: `0x${string}` | null;
    configured: boolean;
    credit: string;
    canWithdraw: boolean;
  };
  nftClaim: {
    claimant: `0x${string}` | null;
    claimantRole: "seller" | "primary" | "secondary" | "unknown" | null;
    canClaim: boolean;
  };
  hasLosingBidder: boolean;
};

export type AuctionsApiResponse = {
  chainId: number;
  auctionHouse: `0x${string}`;
  nextAuctionId: string;
  count: number;
  auctions: SerializedAuction[];
};

export type AuctionDetailApiResponse = {
  chainId: number;
  auctionHouse: `0x${string}`;
  auction: SerializedAuction;
};