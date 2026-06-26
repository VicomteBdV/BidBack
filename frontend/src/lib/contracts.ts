export const contractLabels = {
  auctionHouse: "AuctionHouse",
  nftVault: "NFTVault",
  escrowVault: "EscrowVault",
  distributionVault: "DistributionVault",
  paramsController: "ParamsController",
  reputationAdapter: "ReputationAdapter",
  localNft: "LocalERC721"
} as const;

export type ContractKey = keyof typeof contractLabels;

export const orderedContractKeys = Object.keys(contractLabels) as ContractKey[];