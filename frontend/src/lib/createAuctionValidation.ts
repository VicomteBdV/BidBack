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

export type CreateAuctionFieldName = keyof CreateAuctionValues;

export type CreateAuctionValidationIssue = {
  field: CreateAuctionFieldName | "form";
  message: string;
};

function validateTokenId(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "Token ID is required.";
  if (!/^\d+$/.test(trimmed)) return "Token ID must be a non-negative integer.";

  return null;
}

export function getCreateAuctionValidationIssue(
  values: CreateAuctionValues,
  options: { minAuctionDuration?: string | bigint | null; paused?: boolean } = {}
): CreateAuctionValidationIssue | null {
  const nftContract = values.nftContract.trim();

  if (!nftContract) return { field: "nftContract", message: "NFT contract address is required." };
  if (!isAddress(nftContract)) return { field: "nftContract", message: "Invalid NFT contract address." };

  const tokenIdError = validateTokenId(values.tokenId);
  if (tokenIdError) return { field: "tokenId", message: tokenIdError };

  if (!values.durationSeconds.trim() || !/^\d+$/.test(values.durationSeconds.trim())) {
    return { field: "durationSeconds", message: "Duration must be a positive integer in seconds." };
  }

  const duration = BigInt(values.durationSeconds.trim());

  if (duration < 1n) return { field: "durationSeconds", message: "Duration must be greater than zero." };
  if (duration > UINT64_MAX) return { field: "durationSeconds", message: "Duration is too large." };

  if (options.minAuctionDuration !== undefined && options.minAuctionDuration !== null) {
    const minAuctionDuration =
      typeof options.minAuctionDuration === "bigint"
        ? options.minAuctionDuration
        : BigInt(options.minAuctionDuration);

    if (duration < minAuctionDuration) {
      return {
        field: "durationSeconds",
        message: `Duration below minimum. minAuctionDuration is ${minAuctionDuration.toString()} seconds.`
      };
    }
  }

  try {
    if (!values.startPriceEth.trim() || values.startPriceEth.trim().startsWith("-")) {
      return { field: "startPriceEth", message: "Start price must be zero or greater." };
    }

    const parsed = parseEther(values.startPriceEth.trim());
    if (parsed < 0n) return { field: "startPriceEth", message: "Start price must be zero or greater." };
  } catch {
    return { field: "startPriceEth", message: "Start price must be a valid ETH amount." };
  }

  if (options.paused) return { field: "form", message: "Protocol is paused. Auction creation is disabled." };

  return null;
}

export function validateCreateAuctionFields(
  values: CreateAuctionValues,
  options: { minAuctionDuration?: string | bigint | null; paused?: boolean } = {}
) {
  return getCreateAuctionValidationIssue(values, options)?.message ?? null;
}

export function parseCreateAuctionValues(values: CreateAuctionValues): ParsedCreateAuctionValues {
  const validationError = validateCreateAuctionFields(values);

  if (validationError) {
    throw new Error(validationError);
  }

  return {
    nftContract: values.nftContract.trim() as Address,
    tokenId: BigInt(values.tokenId.trim()),
    startPrice: parseEther(values.startPriceEth.trim()),
    duration: BigInt(values.durationSeconds.trim())
  };
}
