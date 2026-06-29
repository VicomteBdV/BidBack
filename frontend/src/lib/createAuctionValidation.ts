import { isAddress, parseEther, type Address } from "viem";

const UINT64_MAX = (1n << 64n) - 1n;

export type CreateAuctionValues = {
  nftContract: string;
  tokenId: string;
  startPriceEth: string;
  durationSeconds: string;
};

export type ParsedCreateAuctionValues = {
  nftContract: Address;
  tokenId: bigint;
  startPrice: bigint;
  duration: bigint;
};

export function validateCreateAuctionFields(
  values: CreateAuctionValues,
  options: { minAuctionDuration?: string | bigint | null; paused?: boolean } = {}
) {
  if (!isAddress(values.nftContract)) return "Invalid NFT contract address.";

  if (!/^\d+$/.test(values.tokenId.trim()) || BigInt(values.tokenId.trim()) < 1n) {
    return "Token ID must be a positive integer.";
  }

  if (!values.durationSeconds.trim() || !/^\d+$/.test(values.durationSeconds.trim())) {
    return "Duration must be a positive integer in seconds.";
  }

  const duration = BigInt(values.durationSeconds.trim());

  if (duration < 1n) return "Duration must be greater than zero.";
  if (duration > UINT64_MAX) return "Duration is too large.";

  if (options.minAuctionDuration !== undefined && options.minAuctionDuration !== null) {
    const minAuctionDuration =
      typeof options.minAuctionDuration === "bigint"
        ? options.minAuctionDuration
        : BigInt(options.minAuctionDuration);

    if (duration < minAuctionDuration) {
      return `Duration below minimum. minAuctionDuration is ${minAuctionDuration.toString()} seconds.`;
    }
  }

  try {
    if (!values.startPriceEth.trim() || values.startPriceEth.trim().startsWith("-")) {
      return "Start price must be zero or greater.";
    }

    const parsed = parseEther(values.startPriceEth.trim());
    if (parsed < 0n) return "Start price must be zero or greater.";
  } catch {
    return "Start price must be a valid ETH amount.";
  }

  if (options.paused) return "Protocol is paused. Auction creation is disabled.";

  return null;
}

export function parseCreateAuctionValues(values: CreateAuctionValues): ParsedCreateAuctionValues {
  const validationError = validateCreateAuctionFields(values);

  if (validationError) {
    throw new Error(validationError);
  }

  return {
    nftContract: values.nftContract as Address,
    tokenId: BigInt(values.tokenId.trim()),
    startPrice: parseEther(values.startPriceEth.trim()),
    duration: BigInt(values.durationSeconds.trim())
  };
}