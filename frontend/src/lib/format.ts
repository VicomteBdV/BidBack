import { formatEther } from "viem";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isZeroAddress(address?: string | null) {
  return !address || address.toLowerCase() === ZERO_ADDRESS;
}

export function shortenAddress(address?: string | null) {
  if (!address) return "Not connected";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatAddressOrNone(address?: string | null) {
  if (isZeroAddress(address)) return "None";
  return shortenAddress(address);
}

export function formatEth(value?: string | bigint | null) {
  try {
    const wei = typeof value === "bigint" ? value : BigInt(value ?? "0");
    const formatted = formatEther(wei);

    if (!formatted.includes(".")) return `${formatted} ETH`;

    const [whole, fraction] = formatted.split(".");
    const trimmedFraction = fraction.slice(0, 5).replace(/0+$/, "");

    return trimmedFraction ? `${whole}.${trimmedFraction} ETH` : `${whole} ETH`;
  } catch {
    return "0 ETH";
  }
}

export function formatTimestamp(value?: string | number | bigint | null) {
  const timestamp = Number(value ?? 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Not set";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp * 1000));
}

export function formatAuctionState(state?: number | string | null) {
  const normalized = Number(state);

  if (normalized === 0) return "OPEN";
  if (normalized === 1) return "ENDED";
  if (normalized === 2) return "FINALIZED";

  return "UNKNOWN";
}