import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, defineChain, http, isAddress, type Address, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import { anvilChainId } from "@/lib/chains";
import type {
  AuctionDetailApiResponse,
  AuctionEconomics,
  AuctionParamsSnapshot,
  AuctionStateValue,
  AuctionsApiResponse,
  BidderEconomics,
  DevBidderRole,
  DistributionEconomics,
  SerializedAuction,
  SettlementEconomics
} from "@/lib/auctionTypes";
import {
  orderedCoreContractKeys,
  orderedOptionalContractKeys,
  type ContractKey,
  type DeploymentContracts
} from "@/lib/contracts";
import { formatAuctionState, ZERO_ADDRESS } from "@/lib/format";

export type DeploymentFile = {
  chainId: number;
  generatedAt?: string;
  source?: string;
  contracts: DeploymentContracts;
};

export type LocalDeploymentFile = DeploymentFile & {
  contracts: DeploymentContracts & {
    localNft: Address;
  };
};

type DevAccountRole = "seller" | "feeRecipient" | "primary" | "secondary";

type DevAccountInfo = {
  role: DevAccountRole;
  address: Address | null;
  configured: boolean;
};

export class AuctionNotFoundError extends Error {
  constructor(auctionId: string) {
    super(`Auction ${auctionId} not found`);
    this.name = "AuctionNotFoundError";
  }
}

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseChainId(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const anvilRpcUrl = cleanEnv(process.env.ANVIL_RPC_URL) ?? "http://127.0.0.1:8545";

export const targetServerChainId = parseChainId(
  cleanEnv(process.env.BIDBACK_CHAIN_ID) ?? cleanEnv(process.env.NEXT_PUBLIC_CHAIN_ID),
  anvilChainId
);

export const targetServerRpcUrl =
  cleanEnv(process.env.BIDBACK_RPC_URL) ??
  (targetServerChainId === anvilChainId ? anvilRpcUrl : cleanEnv(process.env.NEXT_PUBLIC_WALLET_RPC_URL)) ??
  anvilRpcUrl;

export const anvilServerChain = defineChain({
  id: anvilChainId,
  name: "Anvil Local",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH"
  },
  rpcUrls: {
    default: {
      http: [anvilRpcUrl]
    }
  }
});

export const targetServerChain = defineChain({
  id: targetServerChainId,
  name: targetServerChainId === anvilChainId ? "Anvil Local" : `BidBack Target ${targetServerChainId}`,
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH"
  },
  rpcUrls: {
    default: {
      http: [targetServerRpcUrl]
    }
  }
});

export function createAnvilPublicClient() {
  return createPublicClient({
    chain: anvilServerChain,
    transport: http(anvilRpcUrl)
  });
}

export function createTargetPublicClient() {
  return createPublicClient({
    chain: targetServerChain,
    transport: http(targetServerRpcUrl)
  });
}

export function parseAuctionId(value: string) {
  if (!/^\d+$/.test(value)) return null;

  const parsed = BigInt(value);
  if (parsed < 1n) return null;

  return parsed;
}

export function devPrivateKeyEnv(role: DevAccountRole) {
  if (role === "seller") return "ANVIL_DEV_SELLER_PRIVATE_KEY";
  if (role === "feeRecipient") return "ANVIL_DEV_FEE_RECIPIENT_PRIVATE_KEY";
  if (role === "primary") return "ANVIL_DEV_BIDDER_PRIVATE_KEY";
  return "ANVIL_DEV_SECOND_BIDDER_PRIVATE_KEY";
}

export function readOptionalDevAccount(role: DevAccountRole): DevAccountInfo {
  const envName = devPrivateKeyEnv(role);
  const privateKey = process.env[envName];

  if (!privateKey || privateKey === "0x") {
    return { role, address: null, configured: false };
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(`${envName} must be a 32-byte hex private key.`);
  }

  return {
    role,
    address: privateKeyToAccount(privateKey as `0x${string}`).address,
    configured: true
  };
}

async function resolveDeploymentPath(chainId: number) {
  const fileName = `${chainId}.json`;
  const candidates = [
    path.join(process.cwd(), "public", "deployments", fileName),
    path.join(process.cwd(), "frontend", "public", "deployments", fileName)
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next common project layout.
    }
  }

  return candidates[0];
}

function assertAddress(value: unknown, label: string): Address {
  if (typeof value === "string" && isAddress(value)) {
    return value;
  }

  throw new Error(`Deployment file is missing ${label}`);
}

async function readDeploymentFile(
  chainId: number,
  options: { requireLocalNft?: boolean } = {}
): Promise<DeploymentFile> {
  const deploymentPath = await resolveDeploymentPath(chainId);
  const raw = await readFile(deploymentPath, "utf8");
  const payload = JSON.parse(raw) as {
    chainId?: unknown;
    generatedAt?: unknown;
    source?: unknown;
    contracts?: Record<string, unknown>;
  };

  if (typeof payload.chainId !== "number") {
    throw new Error("Deployment file is missing chainId");
  }

  if (payload.chainId !== chainId) {
    throw new Error(`Deployment chainId mismatch. Expected ${chainId}, got ${payload.chainId}`);
  }

  if (!payload.contracts || typeof payload.contracts !== "object") {
    throw new Error("Deployment file is missing contracts");
  }

  const contracts: Partial<Record<ContractKey, Address>> = {};

  for (const key of orderedCoreContractKeys) {
    contracts[key] = assertAddress(payload.contracts[key], key);
  }

  for (const key of orderedOptionalContractKeys) {
    const value = payload.contracts[key];

    if (value !== undefined && value !== null) {
      contracts[key] = assertAddress(value, key);
    }
  }

  if (options.requireLocalNft && !contracts.localNft) {
    throw new Error("Deployment file is missing localNft");
  }

  return {
    chainId: payload.chainId,
    generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : undefined,
    source: typeof payload.source === "string" ? payload.source : undefined,
    contracts: contracts as DeploymentContracts
  };
}

export async function readDeployment(chainId = targetServerChainId): Promise<DeploymentFile> {
  return readDeploymentFile(chainId);
}

export async function readTargetDeployment(): Promise<DeploymentFile> {
  return readDeployment(targetServerChainId);
}

export async function readLocalDeployment(): Promise<LocalDeploymentFile> {
  const deployment = await readDeploymentFile(anvilChainId, {
    requireLocalNft: true
  });

  return deployment as LocalDeploymentFile;
}

function getField<T>(raw: unknown, key: string, index: number): T {
  if (Array.isArray(raw)) {
    return raw[index] as T;
  }

  return (raw as Record<string, unknown>)[key] as T;
}

function toDecimalString(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Math.trunc(value).toString();
  if (typeof value === "string") return value;
  return "0";
}

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function toAddress(value: unknown): Address {
  if (typeof value === "string" && isAddress(value)) {
    return value;
  }

  return ZERO_ADDRESS;
}

function toAuctionState(value: unknown): AuctionStateValue {
  const state = toNumber(value);
  if (state === 1) return 1;
  if (state === 2) return 2;
  return 0;
}

function gtZero(value: string) {
  return BigInt(value) > 0n;
}

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "shortMessage" in error) {
    const shortMessage = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof shortMessage === "string") return shortMessage;
  }

  return error instanceof Error ? error.message : String(error);
}

function serializeAuction(auctionId: bigint, raw: unknown): SerializedAuction {
  const state = toAuctionState(getField(raw, "state", 8));

  return {
    auctionId: auctionId.toString(),
    seller: toAddress(getField(raw, "seller", 0)),
    nft: toAddress(getField(raw, "nft", 1)),
    tokenId: toDecimalString(getField(raw, "tokenId", 2)),
    startPrice: toDecimalString(getField(raw, "startPrice", 3)),
    startTime: toDecimalString(getField(raw, "startTime", 4)),
    initialEndTime: toDecimalString(getField(raw, "initialEndTime", 5)),
    endTime: toDecimalString(getField(raw, "endTime", 6)),
    extensionsUsed: toNumber(getField(raw, "extensionsUsed", 7)),
    state,
    stateLabel: formatAuctionState(state),
    highestBidder: toAddress(getField(raw, "highestBidder", 9)),
    highestBid: toDecimalString(getField(raw, "highestBid", 10)),
    participantCount: toDecimalString(getField(raw, "participantCount", 11)),
    bidCount: toDecimalString(getField(raw, "bidCount", 12)),
    nftClaimed: Boolean(getField(raw, "nftClaimed", 13)),
    finalized: state === 2
  };
}

function serializeAuctionParams(raw: unknown): AuctionParamsSnapshot {
  return {
    bidbackFeeBps: toDecimalString(getField(raw, "bidbackFeeBps", 0)),
    redistributionBps: toDecimalString(getField(raw, "redistributionBps", 1)),
    minParticipants: toDecimalString(getField(raw, "minParticipants", 2)),
    alphaBps: toDecimalString(getField(raw, "alphaBps", 3)),
    betaBps: toDecimalString(getField(raw, "betaBps", 4)),
    gammaBps: toDecimalString(getField(raw, "gammaBps", 5)),
    minBidIncrementBps: toDecimalString(getField(raw, "minBidIncrementBps", 6)),
    perUserRewardCapBps: toDecimalString(getField(raw, "perUserRewardCapBps", 7)),
    maxParticipants: toDecimalString(getField(raw, "maxParticipants", 8)),
    maxInteractionCount: toDecimalString(getField(raw, "maxInteractionCount", 9)),
    minAuctionDuration: toDecimalString(getField(raw, "minAuctionDuration", 10)),
    antiSnipeWindow: toDecimalString(getField(raw, "antiSnipeWindow", 11)),
    antiSnipeExtension: toDecimalString(getField(raw, "antiSnipeExtension", 12)),
    maxAntiSnipeExtensions: toDecimalString(getField(raw, "maxAntiSnipeExtensions", 13)),
    minExposure: toDecimalString(getField(raw, "minExposure", 14)),
    minPremiumNet: toDecimalString(getField(raw, "minPremiumNet", 15)),
    efCap: toDecimalString(getField(raw, "efCap", 16)),
    etCap: toDecimalString(getField(raw, "etCap", 17)),
    iiCap: toDecimalString(getField(raw, "iiCap", 18))
  };
}

function serializeSettlement(raw: unknown): SettlementEconomics {
  return {
    finalized: Boolean(getField(raw, "finalized", 0)),
    winner: toAddress(getField(raw, "winner", 1)),
    distributionVault: toAddress(getField(raw, "distributionVault", 2)),
    finalPrice: toDecimalString(getField(raw, "finalPrice", 3)),
    sellerProceeds: toDecimalString(getField(raw, "sellerProceeds", 4)),
    feeAmount: toDecimalString(getField(raw, "feeAmount", 5)),
    distributionReserve: toDecimalString(getField(raw, "distributionReserve", 6))
  };
}

function serializeDistribution(raw: unknown): DistributionEconomics {
  return {
    opened: Boolean(getField(raw, "opened", 0)),
    totalAssigned: toDecimalString(getField(raw, "totalAssigned", 1)),
    totalClaimed: toDecimalString(getField(raw, "totalClaimed", 2))
  };
}

async function readBidderEconomics({
  auctionId,
  bidder,
  role,
  label,
  finalized,
  distributionOpened,
  deployment,
  client
}: {
  auctionId: bigint;
  bidder: DevAccountInfo;
  role: DevBidderRole;
  label: string;
  finalized: boolean;
  distributionOpened: boolean;
  deployment: DeploymentFile;
  client: PublicClient;
}): Promise<BidderEconomics> {
  if (!bidder.address) {
    return {
      role,
      label,
      address: null,
      configured: false,
      cap: "0",
      refundableAmount: "0",
      refundClaimed: false,
      rewardEntitlement: "0",
      rewardClaimed: false,
      canClaimRefund: false,
      canClaimReward: false
    };
  }

  const [cap, refundableAmount, refundClaimed, rewardEntitlement, rewardClaimed] = await Promise.all([
    client.readContract({
      address: deployment.contracts.escrowVault,
      abi: escrowVaultAbi,
      functionName: "capOf",
      args: [auctionId, bidder.address]
    }),
    client.readContract({
      address: deployment.contracts.escrowVault,
      abi: escrowVaultAbi,
      functionName: "refundableAmount",
      args: [auctionId, bidder.address]
    }),
    client.readContract({
      address: deployment.contracts.escrowVault,
      abi: escrowVaultAbi,
      functionName: "refundClaimed",
      args: [auctionId, bidder.address]
    }),
    client.readContract({
      address: deployment.contracts.distributionVault,
      abi: distributionVaultAbi,
      functionName: "entitlementOf",
      args: [auctionId, bidder.address]
    }),
    client.readContract({
      address: deployment.contracts.distributionVault,
      abi: distributionVaultAbi,
      functionName: "claimed",
      args: [auctionId, bidder.address]
    })
  ]);

  return {
    role,
    label,
    address: bidder.address,
    configured: true,
    cap: cap.toString(),
    refundableAmount: refundableAmount.toString(),
    refundClaimed,
    rewardEntitlement: rewardEntitlement.toString(),
    rewardClaimed,
    canClaimRefund: finalized && !refundClaimed && refundableAmount > 0n,
    canClaimReward: finalized && distributionOpened && !rewardClaimed && rewardEntitlement > 0n
  };
}

async function readAuctionEconomics(
  auctionId: bigint,
  auction: SerializedAuction,
  deployment: DeploymentFile,
  client: PublicClient
): Promise<AuctionEconomics> {
  const primary = readOptionalDevAccount("primary");
  const secondary = readOptionalDevAccount("secondary");
  const sellerAccount = readOptionalDevAccount("seller");
  const feeAccount = readOptionalDevAccount("feeRecipient");

  const [globalFeeRecipient, settlementRaw, distributionRaw] = await Promise.all([
    client.readContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "feeRecipient"
    }),
    client.readContract({
      address: deployment.contracts.escrowVault,
      abi: escrowVaultAbi,
      functionName: "settlements",
      args: [auctionId]
    }),
    client.readContract({
      address: deployment.contracts.distributionVault,
      abi: distributionVaultAbi,
      functionName: "distributions",
      args: [auctionId]
    })
  ]);

  const auctionFeeRecipient = auction.auctionFeeRecipient ?? globalFeeRecipient;
  const settlement = serializeSettlement(settlementRaw);
  const distribution = serializeDistribution(distributionRaw);

  const [primaryBidder, secondBidder, sellerCredit, protocolFeeCredit] = await Promise.all([
    readBidderEconomics({
      auctionId,
      bidder: primary,
      role: "primary",
      label: "Bidder #1",
      finalized: settlement.finalized,
      distributionOpened: distribution.opened,
      deployment,
      client
    }),
    readBidderEconomics({
      auctionId,
      bidder: secondary,
      role: "secondary",
      label: "Bidder #2",
      finalized: settlement.finalized,
      distributionOpened: distribution.opened,
      deployment,
      client
    }),
    client.readContract({
      address: deployment.contracts.escrowVault,
      abi: escrowVaultAbi,
      functionName: "sellerCredits",
      args: [auction.seller]
    }),
    client.readContract({
      address: deployment.contracts.escrowVault,
      abi: escrowVaultAbi,
      functionName: "protocolFeeCredits",
      args: [auctionFeeRecipient]
    })
  ]);

  let claimant: Address | null = null;
  let claimantRole: AuctionEconomics["nftClaim"]["claimantRole"] = null;

  if (auction.highestBidder.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    claimant = auction.seller;
    claimantRole = "seller";
  } else {
    claimant = auction.highestBidder;
    if (sameAddress(claimant, primary.address)) claimantRole = "primary";
    else if (sameAddress(claimant, secondary.address)) claimantRole = "secondary";
    else if (sameAddress(claimant, sellerAccount.address)) claimantRole = "seller";
    else claimantRole = "unknown";
  }

  return {
    primaryBidder,
    secondBidder,
    settlement,
    distribution,
    seller: {
      address: auction.seller,
      configuredAddress: sellerAccount.address,
      configured: sellerAccount.configured,
      credit: sellerCredit.toString(),
      canWithdraw: sellerAccount.configured && sameAddress(sellerAccount.address, auction.seller) && sellerCredit > 0n
    },
    feeRecipient: {
      address: auctionFeeRecipient,
      currentGlobalAddress: globalFeeRecipient,
      configuredAddress: feeAccount.address,
      configured: feeAccount.configured,
      credit: protocolFeeCredit.toString(),
      canWithdraw: feeAccount.configured && sameAddress(feeAccount.address, auctionFeeRecipient) && protocolFeeCredit > 0n
    },
    nftClaim: {
      claimant,
      claimantRole,
      canClaim: auction.finalized && !auction.nftClaimed && claimantRole !== null && claimantRole !== "unknown"
    },
    hasLosingBidder:
      settlement.finalized &&
      (gtZero(primaryBidder.refundableAmount) || gtZero(secondBidder.refundableAmount))
  };
}

export async function readAllAuctions(): Promise<AuctionsApiResponse> {
  const deployment = await readTargetDeployment();
  const client = createTargetPublicClient();

  const nextAuctionId = await client.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "nextAuctionId"
  });

  const auctions: SerializedAuction[] = [];

  for (let auctionId = 1n; auctionId < nextAuctionId; auctionId += 1n) {
    const rawAuction = await client.readContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "getAuction",
      args: [auctionId]
    });

    auctions.push(serializeAuction(auctionId, rawAuction));
  }

  return {
    chainId: deployment.chainId,
    auctionHouse: deployment.contracts.auctionHouse,
    nextAuctionId: nextAuctionId.toString(),
    count: auctions.length,
    auctions
  };
}

export async function readAuctionById(auctionIdParam: string): Promise<AuctionDetailApiResponse> {
  const auctionId = parseAuctionId(auctionIdParam);

  if (!auctionId) {
    throw new AuctionNotFoundError(auctionIdParam);
  }

  const deployment = await readTargetDeployment();
  const client = createTargetPublicClient();

  const nextAuctionId = await client.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "nextAuctionId"
  });

  if (auctionId >= nextAuctionId) {
    throw new AuctionNotFoundError(auctionIdParam);
  }

  const rawAuction = await client.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "getAuction",
    args: [auctionId]
  });

  const auction = serializeAuction(auctionId, rawAuction);

  try {
    const rawParams = await client.readContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "getAuctionParams",
      args: [auctionId]
    });

    auction.paramsSnapshot = serializeAuctionParams(rawParams);
  } catch (error) {
    auction.paramsSnapshotError = `Unable to read auction parameter snapshot: ${errorMessage(error)}`;
  }

  try {
    auction.auctionFeeRecipient = await client.readContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "getAuctionFeeRecipient",
      args: [auctionId]
    });
  } catch (error) {
    auction.auctionFeeRecipientError = `Unable to read auction fee recipient snapshot: ${errorMessage(error)}`;
  }

  auction.economics = await readAuctionEconomics(auctionId, auction, deployment, client);

  return {
    chainId: deployment.chainId,
    auctionHouse: deployment.contracts.auctionHouse,
    auction
  };
}