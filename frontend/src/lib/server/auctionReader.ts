import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, defineChain, http, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import type {
  AuctionDetailApiResponse,
  AuctionEconomics,
  AuctionStateValue,
  AuctionsApiResponse,
  BidderEconomics,
  DevBidderRole,
  DistributionEconomics,
  SerializedAuction,
  SettlementEconomics
} from "@/lib/auctionTypes";
import { orderedContractKeys, type ContractKey } from "@/lib/contracts";
import { formatAuctionState, ZERO_ADDRESS } from "@/lib/format";

export type DeploymentFile = {
  chainId: number;
  generatedAt?: string;
  source?: string;
  contracts: Record<ContractKey, Address>;
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

export const anvilRpcUrl = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";

export const anvilServerChain = defineChain({
  id: 31337,
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

export function createAnvilPublicClient() {
  return createPublicClient({
    chain: anvilServerChain,
    transport: http(anvilRpcUrl)
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

async function resolveDeploymentPath() {
  const candidates = [
    path.join(process.cwd(), "public", "deployments", "31337.json"),
    path.join(process.cwd(), "frontend", "public", "deployments", "31337.json")
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

export async function readLocalDeployment(): Promise<DeploymentFile> {
  const deploymentPath = await resolveDeploymentPath();
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

  if (!payload.contracts || typeof payload.contracts !== "object") {
    throw new Error("Deployment file is missing contracts");
  }

  const contracts = {} as Record<ContractKey, Address>;

  for (const key of orderedContractKeys) {
    contracts[key] = assertAddress(payload.contracts[key], key);
  }

  return {
    chainId: payload.chainId,
    generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : undefined,
    source: typeof payload.source === "string" ? payload.source : undefined,
    contracts
  };
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
  deployment
}: {
  auctionId: bigint;
  bidder: DevAccountInfo;
  role: DevBidderRole;
  label: string;
  finalized: boolean;
  distributionOpened: boolean;
  deployment: DeploymentFile;
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

  const client = createAnvilPublicClient();

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
  deployment: DeploymentFile
): Promise<AuctionEconomics> {
  const client = createAnvilPublicClient();

  const primary = readOptionalDevAccount("primary");
  const secondary = readOptionalDevAccount("secondary");
  const sellerAccount = readOptionalDevAccount("seller");
  const feeAccount = readOptionalDevAccount("feeRecipient");

  const [feeRecipient, settlementRaw, distributionRaw] = await Promise.all([
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
      deployment
    }),
    readBidderEconomics({
      auctionId,
      bidder: secondary,
      role: "secondary",
      label: "Bidder #2",
      finalized: settlement.finalized,
      distributionOpened: distribution.opened,
      deployment
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
      args: [feeRecipient]
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
      address: feeRecipient,
      configuredAddress: feeAccount.address,
      configured: feeAccount.configured,
      credit: protocolFeeCredit.toString(),
      canWithdraw: feeAccount.configured && sameAddress(feeAccount.address, feeRecipient) && protocolFeeCredit > 0n
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
  const deployment = await readLocalDeployment();
  const client = createAnvilPublicClient();

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

  const deployment = await readLocalDeployment();
  const client = createAnvilPublicClient();

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
  auction.economics = await readAuctionEconomics(auctionId, auction, deployment);

  return {
    chainId: deployment.chainId,
    auctionHouse: deployment.contracts.auctionHouse,
    auction
  };
}