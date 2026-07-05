import type { Address, PublicClient } from "viem";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import type { DeploymentFile } from "@/lib/server/auctionReader";
import type { WalletActivityDiscovery } from "@/lib/walletActivity";

export const DEFAULT_WALLET_ACTIVITY_EVENT_LIMIT = 100;
export const MAX_WALLET_ACTIVITY_EVENT_LIMIT = 500;

type AuctionEventName = "AuctionCreated" | "BidPlaced" | "AuctionFinalized" | "NFTClaimed";

type AuctionEventLog = {
  args?: {
    auctionId?: bigint;
  };
  blockNumber?: bigint | null;
  logIndex?: number | bigint | null;
};

type EventCapableClient = {
  getContractEvents: (request: unknown) => Promise<unknown[]>;
};

export type AuctionIdDiscoveryResult = {
  ids: bigint[];
  discovery: WalletActivityDiscovery;
};

function normalizePositiveInteger(value: unknown, fallback: number, max: number) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;

  return Math.min(parsed, max);
}

export function normalizeWalletActivityEventLimit(value: unknown) {
  return normalizePositiveInteger(value, DEFAULT_WALLET_ACTIVITY_EVENT_LIMIT, MAX_WALLET_ACTIVITY_EVENT_LIMIT);
}

function normalizeLogIndex(value: number | bigint | null | undefined, fallback: number) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return fallback;
}

function eventSortValue(log: AuctionEventLog, index: number) {
  return {
    auctionId: log.args?.auctionId,
    blockNumber: log.blockNumber ?? 0n,
    logIndex: normalizeLogIndex(log.logIndex, index)
  };
}

function newestUniqueAuctionIds(logs: AuctionEventLog[], nextAuctionId: bigint, limit: number) {
  const seen = new Set<string>();

  return logs
    .map(eventSortValue)
    .filter((entry): entry is { auctionId: bigint; blockNumber: bigint; logIndex: number } => {
      return typeof entry.auctionId === "bigint" && entry.auctionId > 0n && entry.auctionId < nextAuctionId;
    })
    .sort((a, b) => {
      if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
      return a.blockNumber > b.blockNumber ? -1 : 1;
    })
    .map((entry) => entry.auctionId)
    .filter((auctionId) => {
      const key = auctionId.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function fallbackAuctionIdsFromNextId(nextAuctionId: bigint, limit: number) {
  const ids: bigint[] = [];

  if (nextAuctionId <= 1n) return ids;

  for (let auctionId = nextAuctionId - 1n; auctionId >= 1n && ids.length < limit; auctionId -= 1n) {
    ids.push(auctionId);

    if (auctionId === 1n) break;
  }

  return ids;
}

async function getAuctionHouseEvents({
  client,
  deployment,
  eventName,
  args
}: {
  client: PublicClient;
  deployment: DeploymentFile;
  eventName: AuctionEventName;
  args?: Record<string, unknown>;
}) {
  const eventClient = client as unknown as EventCapableClient;

  return (await eventClient.getContractEvents({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    eventName,
    args,
    fromBlock: 0n,
    toBlock: "latest"
  })) as AuctionEventLog[];
}

export async function discoverCreatedAuctionIds({
  client,
  deployment,
  nextAuctionId,
  limit
}: {
  client: PublicClient;
  deployment: DeploymentFile;
  nextAuctionId: bigint;
  limit: number;
}) {
  const logs = await getAuctionHouseEvents({
    client,
    deployment,
    eventName: "AuctionCreated"
  });

  return newestUniqueAuctionIds(logs, nextAuctionId, limit);
}

async function discoverWalletScopedAuctionIds({
  client,
  deployment,
  nextAuctionId,
  wallet,
  limit
}: {
  client: PublicClient;
  deployment: DeploymentFile;
  nextAuctionId: bigint;
  wallet: Address;
  limit: number;
}) {
  const logs = await Promise.all([
    getAuctionHouseEvents({
      client,
      deployment,
      eventName: "AuctionCreated",
      args: { seller: wallet }
    }),
    getAuctionHouseEvents({
      client,
      deployment,
      eventName: "BidPlaced",
      args: { bidder: wallet }
    }),
    getAuctionHouseEvents({
      client,
      deployment,
      eventName: "AuctionFinalized",
      args: { winner: wallet }
    }),
    getAuctionHouseEvents({
      client,
      deployment,
      eventName: "NFTClaimed",
      args: { claimant: wallet }
    })
  ]);

  return newestUniqueAuctionIds(logs.flat(), nextAuctionId, limit);
}

function boundedWarning(nextAuctionId: bigint, limit: number, prefix: string) {
  const totalKnown = nextAuctionId > 1n ? nextAuctionId - 1n : 0n;

  if (totalKnown > BigInt(limit)) {
    return `${prefix} Results are limited to ${limit} newest auction IDs out of ${totalKnown.toString()} known auctions.`;
  }

  return prefix;
}

export async function discoverWalletActivityAuctionIds({
  client,
  deployment,
  nextAuctionId,
  wallet,
  limit,
  requestedLimit
}: {
  client: PublicClient;
  deployment: DeploymentFile;
  nextAuctionId: bigint;
  wallet: Address;
  limit: number;
  requestedLimit: number;
}): Promise<AuctionIdDiscoveryResult> {
  if (nextAuctionId <= 1n) {
    return {
      ids: [],
      discovery: {
        strategy: "event-scoped",
        limit,
        requestedLimit,
        returnedIds: 0
      }
    };
  }

  try {
    const walletScopedIds = await discoverWalletScopedAuctionIds({
      client,
      deployment,
      nextAuctionId,
      wallet,
      limit
    });

    if (walletScopedIds.length > 0) {
      return {
        ids: walletScopedIds,
        discovery: {
          strategy: "event-scoped",
          limit,
          requestedLimit,
          returnedIds: walletScopedIds.length,
          warning:
            walletScopedIds.length >= limit
              ? `Wallet-scoped event results are limited to ${limit} newest matching auction IDs.`
              : undefined
        }
      };
    }

    const generalEventIds = await discoverCreatedAuctionIds({
      client,
      deployment,
      nextAuctionId,
      limit
    });

    if (generalEventIds.length > 0) {
      return {
        ids: generalEventIds,
        discovery: {
          strategy: "general-event-window",
          limit,
          requestedLimit,
          returnedIds: generalEventIds.length,
          warning: boundedWarning(
            nextAuctionId,
            limit,
            "No wallet-scoped AuctionHouse events were found. Scanning a bounded newest-first AuctionCreated window for roles such as fee recipient snapshots."
          )
        }
      };
    }

    const fallbackIds = fallbackAuctionIdsFromNextId(nextAuctionId, limit);

    return {
      ids: fallbackIds,
      discovery: {
        strategy: "bounded-fallback",
        limit,
        requestedLimit,
        returnedIds: fallbackIds.length,
        warning: boundedWarning(
          nextAuctionId,
          limit,
          "No AuctionCreated logs were returned. Used bounded nextAuctionId fallback."
        )
      }
    };
  } catch (error) {
    const fallbackIds = fallbackAuctionIdsFromNextId(nextAuctionId, limit);
    const message = error instanceof Error ? error.message : String(error);

    return {
      ids: fallbackIds,
      discovery: {
        strategy: fallbackIds.length > 0 ? "bounded-fallback" : "unavailable",
        limit,
        requestedLimit,
        returnedIds: fallbackIds.length,
        warning: boundedWarning(
          nextAuctionId,
          limit,
          `Wallet activity event scan failed; used bounded nextAuctionId fallback: ${message}`
        )
      }
    };
  }
}
