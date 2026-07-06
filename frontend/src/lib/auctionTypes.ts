export type AuctionStateValue = 0 | 1 | 2;
export type DevBidderRole = "primary" | "secondary";

export type AuctionDiscoveryStrategy = "events" | "nextAuctionIdFallback";

export type AuctionDiscovery = {
  strategy: AuctionDiscoveryStrategy;
  limit: number;
  requestedLimit: number;
  warning?: string;
};

export type NftMetadataStatus = "loaded" | "unavailable" | "fetch-failed" | "unsupported-token-uri" | "no-image";

export type NftMetadata = {
  contractAddress: `0x${string}`;
  tokenId: string;
  collectionName?: string;
  collectionSymbol?: string;
  tokenUri?: string;
  tokenUriGatewayUrl?: string;
  metadataName?: string;
  description?: string;
  imageUrl?: string;
  externalUrl?: string;
  status: NftMetadataStatus;
  errorMessage?: string;
};

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

export type AuctionHistorySource = "bid-records-and-events" | "bid-records-only" | "events-only" | "unavailable";

export type AuctionHistoryEventKind =
  | "auction-created"
  | "bid-placed"
  | "auction-extended"
  | "auction-ended"
  | "auction-finalized"
  | "nft-claimed"
  | "refund-claimed"
  | "distribution-opened"
  | "reward-claimed";

export type AuctionHistoryEvent = {
  id: string;
  kind: AuctionHistoryEventKind;
  label: string;
  actor?: `0x${string}`;
  amount?: string;
  transactionHash?: `0x${string}`;
  blockNumber?: string;
  logIndex?: number;
  timestamp?: string;
  details?: string;
};

export type AuctionBidHistoryEntry = {
  index: string;
  bidder: `0x${string}`;
  amount: string;
  timestamp: string;
  transactionHash?: `0x${string}`;
  blockNumber?: string;
  logIndex?: number;
};

export type AuctionTransparencySummary = {
  seller: `0x${string}`;
  highestBidder: `0x${string}`;
  highestBid: string;
  finalPrice: string;
  sellerProceeds: string;
  protocolFees: string;
  distributionReserve: string;
  totalAssignedRewards: string;
  totalClaimedRewards: string;
  visibleRefundableAmount: string;
  visibleRewardEntitlement: string;
  nftClaimed: boolean;
};

export type AuctionHistory = {
  auctionId: string;
  source: AuctionHistorySource;
  partial: boolean;
  warnings: string[];
  bids: AuctionBidHistoryEntry[];
  events: AuctionHistoryEvent[];
  transparency: AuctionTransparencySummary;
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
  nftMetadata?: NftMetadata;
  paramsSnapshot?: AuctionParamsSnapshot;
  paramsSnapshotError?: string;
  auctionFeeRecipient?: `0x${string}`;
  auctionFeeRecipientError?: string;
  economics?: AuctionEconomics;
  history?: AuctionHistory;
  historyError?: string;
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
  discovery: AuctionDiscovery;
  auctions: SerializedAuction[];
};

export type AuctionDetailApiResponse = {
  chainId: number;
  auctionHouse: `0x${string}`;
  auction: SerializedAuction;
};

export type AuctionHistoryApiResponse = {
  chainId: number;
  auctionHouse: `0x${string}`;
  auctionId: string;
  history: AuctionHistory;
};
