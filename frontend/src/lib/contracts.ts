export const coreContractLabels = {
  auctionHouse: "AuctionHouse",
  nftVault: "NFTVault",
  escrowVault: "EscrowVault",
  distributionVault: "DistributionVault",
  paramsController: "ParamsController",
  reputationAdapter: "ReputationAdapter"
} as const;

export const optionalContractLabels = {
  localNft: "LocalERC721"
} as const;

export const contractLabels = {
  ...coreContractLabels,
  ...optionalContractLabels
} as const;

export type CoreContractKey = keyof typeof coreContractLabels;
export type OptionalContractKey = keyof typeof optionalContractLabels;
export type ContractKey = keyof typeof contractLabels;

export type CoreDeploymentContracts = Record<CoreContractKey, `0x${string}`>;
export type OptionalDeploymentContracts = Partial<Record<OptionalContractKey, `0x${string}`>>;
export type DeploymentContracts = CoreDeploymentContracts & OptionalDeploymentContracts;

export const orderedCoreContractKeys = Object.keys(coreContractLabels) as CoreContractKey[];
export const orderedOptionalContractKeys = Object.keys(optionalContractLabels) as OptionalContractKey[];
export const orderedContractKeys = Object.keys(contractLabels) as ContractKey[];