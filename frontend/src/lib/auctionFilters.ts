import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { isZeroAddress } from "@/lib/format";

export type AuctionStatusFilter =
  | "all"
  | "open"
  | "readyToFinalize"
  | "finalized"
  | "claimable"
  | "settled"
  | "createdByWallet"
  | "involvingWallet";

export type AuctionSortOption = "newest" | "oldest" | "endingSoon" | "highestBid";

export type AuctionFilterOptions = {
  status: AuctionStatusFilter;
  query: string;
  sort: AuctionSortOption;
  connectedWallet?: `0x${string}` | null;
  nowSeconds?: number | bigint;
};

export const auctionStatusFilterLabels: Record<AuctionStatusFilter, string> = {
  all: "All auctions",
  open: "Open",
  readyToFinalize: "Ready to finalize",
  finalized: "Finalized",
  claimable: "Claimable / withdrawable",
  settled: "Settled",
  createdByWallet: "Created by wallet",
  involvingWallet: "Involving wallet"
};

export const auctionSortLabels: Record<AuctionSortOption, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  endingSoon: "Ending soon",
  highestBid: "Highest bid / final price"
};

function parseBigInt(value?: string | bigint | number | null) {
  try {
    return typeof value === "bigint" ? value : BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function searchValue(value?: string | number | bigint | null) {
  return String(value ?? "").toLowerCase();
}

function nftClaimant(auction: SerializedAuction) {
  return isZeroAddress(auction.highestBidder) ? auction.seller : auction.highestBidder;
}

function isWalletInvolved(auction: SerializedAuction, wallet?: `0x${string}` | null) {
  if (!wallet) return false;

  return (
    sameAddress(auction.seller, wallet) ||
    sameAddress(auction.highestBidder, wallet) ||
    sameAddress(nftClaimant(auction), wallet) ||
    sameAddress(auction.auctionFeeRecipient, wallet) ||
    sameAddress(auction.economics?.feeRecipient.address, wallet) ||
    sameAddress(auction.economics?.primaryBidder.address, wallet) ||
    sameAddress(auction.economics?.secondBidder.address, wallet)
  );
}

function matchesStatus(
  auction: SerializedAuction,
  status: AuctionStatusFilter,
  connectedWallet?: `0x${string}` | null,
  nowSeconds?: number | bigint
) {
  const lifecycle = getAuctionLifecycle(auction, nowSeconds);

  if (status === "all") return true;
  if (status === "open") return lifecycle.canBid;
  if (status === "readyToFinalize") return lifecycle.canFinalize;
  if (status === "finalized") return lifecycle.isFinalized;
  if (status === "claimable") return lifecycle.hasAnyClaimOrWithdrawal;
  if (status === "settled") return lifecycle.statusLabel === "Settled";
  if (status === "createdByWallet") return sameAddress(auction.seller, connectedWallet);
  if (status === "involvingWallet") return isWalletInvolved(auction, connectedWallet);

  return true;
}

function matchesQuery(auction: SerializedAuction, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const metadata = auction.nftMetadata;
  const fields = [
    auction.auctionId,
    `auction #${auction.auctionId}`,
    auction.nft,
    auction.tokenId,
    `#${auction.tokenId}`,
    auction.seller,
    auction.highestBidder,
    auction.auctionFeeRecipient,
    metadata?.metadataName,
    metadata?.collectionName,
    metadata?.collectionSymbol,
    metadata?.tokenUri
  ];

  return fields.some((field) => searchValue(field).includes(normalized));
}

function compareBigIntDescending(a: bigint, b: bigint) {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function compareBigIntAscending(a: bigint, b: bigint) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortAuctions(auctions: SerializedAuction[], sort: AuctionSortOption, nowSeconds?: number | bigint) {
  const now = typeof nowSeconds === "bigint" ? nowSeconds : BigInt(nowSeconds ?? Math.floor(Date.now() / 1000));

  return [...auctions].sort((a, b) => {
    if (sort === "oldest") {
      return compareBigIntAscending(parseBigInt(a.auctionId), parseBigInt(b.auctionId));
    }

    if (sort === "endingSoon") {
      const aLifecycle = getAuctionLifecycle(a, now);
      const bLifecycle = getAuctionLifecycle(b, now);
      const aActive = !aLifecycle.isFinalized && parseBigInt(a.endTime) >= now;
      const bActive = !bLifecycle.isFinalized && parseBigInt(b.endTime) >= now;

      if (aActive !== bActive) return aActive ? -1 : 1;

      const endCompare = compareBigIntAscending(parseBigInt(a.endTime), parseBigInt(b.endTime));
      if (endCompare !== 0) return endCompare;

      return compareBigIntDescending(parseBigInt(a.auctionId), parseBigInt(b.auctionId));
    }

    if (sort === "highestBid") {
      const bidCompare = compareBigIntDescending(parseBigInt(a.highestBid), parseBigInt(b.highestBid));
      if (bidCompare !== 0) return bidCompare;

      return compareBigIntDescending(parseBigInt(a.auctionId), parseBigInt(b.auctionId));
    }

    return compareBigIntDescending(parseBigInt(a.auctionId), parseBigInt(b.auctionId));
  });
}

export function filterAndSortAuctions(auctions: SerializedAuction[], options: AuctionFilterOptions) {
  const filtered = auctions.filter((auction) => {
    return (
      matchesStatus(auction, options.status, options.connectedWallet, options.nowSeconds) &&
      matchesQuery(auction, options.query)
    );
  });

  return sortAuctions(filtered, options.sort, options.nowSeconds);
}
