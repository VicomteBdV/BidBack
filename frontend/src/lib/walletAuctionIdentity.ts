import type { Address, ContractFunctionReturnType, Hex, PublicClient } from "viem";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import type { SerializedAuction } from "@/lib/auctionTypes";

export type WalletAuctionIdentity = Readonly<{
  chainId: number;
  auctionHouse: Address;
  auctionId: bigint;
  seller: Address;
  nft: Address;
  tokenId: bigint;
  startPrice: bigint;
  startTime: bigint;
  initialEndTime: bigint;
}>;

type LiveAuction = ContractFunctionReturnType<typeof auctionHouseAbi, "view", "getAuction">;
type IdentityClient = Pick<PublicClient, "getBlock" | "readContract">;
export type AuctionReferenceBlock = Readonly<{ number: bigint; hash: Hex; timestamp: bigint }>;
export type WalletAuctionTarget = {
  targetChainId: number;
  selectedChainId: number;
  deploymentChainId: number;
  auctionHouse: Address;
};

export class WalletAuctionIdentityError extends Error {
  constructor(public readonly kind: "context" | "unavailable") {
    super(kind === "context"
      ? "The displayed auction details no longer match the current network or auction. Refresh the auction and review its details before choosing an action."
      : "On-chain auction data is temporarily unavailable or incomplete. No signature was requested. Refresh and try again.");
    this.name = "WalletAuctionIdentityError";
  }
}

const zeroAddress = /^0x0{40}$/i;
function address(value: unknown, allowZero = false): value is Address {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value) && (allowZero || !zeroAddress.test(value));
}
function uint(value: unknown, bits = 256): value is bigint {
  return typeof value === "bigint" && value >= 0n && value < (1n << BigInt(bits));
}
function displayedUint(value: unknown, bits = 256): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new WalletAuctionIdentityError("context");
  const parsed = BigInt(value);
  if (!uint(parsed, bits)) throw new WalletAuctionIdentityError("context");
  return parsed;
}
function chainId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Only fields displayed by the page that are immutable for a given auction. */
export function displayedWalletAuctionIdentity(
  expectedChainId: number,
  expectedAuctionHouse: Address,
  auction: SerializedAuction
): WalletAuctionIdentity {
  if (!chainId(expectedChainId) || !address(expectedAuctionHouse) || !address(auction.seller) || !address(auction.nft)) {
    throw new WalletAuctionIdentityError("context");
  }
  const identity = Object.freeze({
    chainId: expectedChainId,
    auctionHouse: expectedAuctionHouse.toLowerCase() as Address,
    auctionId: displayedUint(auction.auctionId),
    seller: auction.seller.toLowerCase() as Address,
    nft: auction.nft.toLowerCase() as Address,
    tokenId: displayedUint(auction.tokenId),
    startPrice: displayedUint(auction.startPrice),
    startTime: displayedUint(auction.startTime, 64),
    initialEndTime: displayedUint(auction.initialEndTime, 64)
  });
  if (identity.auctionId === 0n || identity.initialEndTime <= identity.startTime) throw new WalletAuctionIdentityError("context");
  return identity;
}

export function walletAuctionIdentityKey(identity: WalletAuctionIdentity): string {
  return [identity.chainId, identity.auctionHouse, identity.auctionId, identity.seller, identity.nft,
    identity.tokenId, identity.startPrice, identity.startTime, identity.initialEndTime].join(":");
}

export function assertWalletAuctionTarget(identity: WalletAuctionIdentity, target: WalletAuctionTarget) {
  if (![identity.chainId, target.targetChainId, target.selectedChainId, target.deploymentChainId].every(chainId) ||
    identity.chainId !== target.targetChainId || target.selectedChainId !== identity.chainId ||
    target.deploymentChainId !== identity.chainId || !address(target.auctionHouse) ||
    target.auctionHouse.toLowerCase() !== identity.auctionHouse.toLowerCase()) {
    throw new WalletAuctionIdentityError("context");
  }
}

function isLiveAuction(value: unknown): value is LiveAuction {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  return address(a.seller) && address(a.nft) && uint(a.tokenId) && uint(a.startPrice) && uint(a.startTime, 64) &&
    uint(a.initialEndTime, 64) && a.initialEndTime > a.startTime && uint(a.endTime, 64) &&
    typeof a.extensionsUsed === "number" && Number.isInteger(a.extensionsUsed) && a.extensionsUsed >= 0 && a.extensionsUsed <= 255 &&
    (a.state === 0 || a.state === 1 || a.state === 2) && address(a.highestBidder, true) && uint(a.highestBid) &&
    uint(a.participantCount) && uint(a.bidCount) && typeof a.nftClaimed === "boolean";
}

export function assertWalletAuctionIdentity(identity: WalletAuctionIdentity, value: unknown): asserts value is LiveAuction {
  if (!isLiveAuction(value)) throw new WalletAuctionIdentityError("unavailable");
  if (value.seller.toLowerCase() !== identity.seller || value.nft.toLowerCase() !== identity.nft ||
    value.tokenId !== identity.tokenId || value.startPrice !== identity.startPrice ||
    value.startTime !== identity.startTime || value.initialEndTime !== identity.initialEndTime) {
    throw new WalletAuctionIdentityError("context");
  }
}

function referenceBlock(value: unknown): AuctionReferenceBlock {
  if (!value || typeof value !== "object") throw new WalletAuctionIdentityError("unavailable");
  const b = value as Record<string, unknown>;
  if (!uint(b.number) || !uint(b.timestamp) || typeof b.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(b.hash) || /^0x0{64}$/i.test(b.hash)) {
    throw new WalletAuctionIdentityError("unavailable");
  }
  return Object.freeze({ number: b.number, hash: b.hash as Hex, timestamp: b.timestamp });
}

/** One reference block for identity and subsequent action eligibility reads. */
export async function preflightWalletAuctionIdentity(
  client: IdentityClient,
  identity: WalletAuctionIdentity,
  target: WalletAuctionTarget,
  existingBlock?: unknown
) {
  assertWalletAuctionTarget(identity, target);
  let block: AuctionReferenceBlock;
  let liveAuction: unknown;
  try {
    block = referenceBlock(existingBlock ?? await client.getBlock({ blockTag: "latest" }));
    liveAuction = await client.readContract({ address: target.auctionHouse, abi: auctionHouseAbi,
      functionName: "getAuction", args: [identity.auctionId], blockNumber: block.number });
  } catch {
    throw new WalletAuctionIdentityError("unavailable");
  }
  assertWalletAuctionIdentity(identity, liveAuction);
  return { liveAuction, referenceBlock: block };
}

/** Detect a reset/reorg during asynchronous reads before a new signature. */
export async function assertAuctionReferenceBlock(client: Pick<PublicClient, "getBlock">, expected: AuctionReferenceBlock) {
  let observed: AuctionReferenceBlock;
  try { observed = referenceBlock(await client.getBlock({ blockNumber: expected.number })); }
  catch { throw new WalletAuctionIdentityError("unavailable"); }
  if (observed.number !== expected.number || observed.hash.toLowerCase() !== expected.hash.toLowerCase() || observed.timestamp !== expected.timestamp) {
    throw new WalletAuctionIdentityError("unavailable");
  }
}
