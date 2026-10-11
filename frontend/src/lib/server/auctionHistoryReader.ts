import { isAddress, type Address, type PublicClient } from "viem";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import type {
  AuctionBidHistoryEntry,
  AuctionHistory,
  AuctionHistoryEvent,
  AuctionHistoryEventKind,
  AuctionHistorySource,
  AuctionTransparencySummary,
  SerializedAuction
} from "@/lib/auctionTypes";
import type { DeploymentFile } from "@/lib/server/auctionReader";

const MAX_BID_HISTORY_RECORDS = 200;
const MAX_HISTORY_EVENTS = 250;
const MAX_BLOCK_READ_CONCURRENCY = 8;
const MAX_UINT256 = (1n << 256n) - 1n;

export class InvalidBidHistoryCursorError extends Error {
  constructor() {
    super("Invalid bid history cursor");
    this.name = "InvalidBidHistoryCursorError";
  }
}

export function parseBidHistoryCursor(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > 78) throw new InvalidBidHistoryCursorError();
  const cursor = BigInt(value);
  if (cursor > MAX_UINT256) throw new InvalidBidHistoryCursorError();
  return cursor;
}

type EventReadableClient = {
  getContractEvents: (request: {
    address: Address;
    abi: readonly unknown[];
    eventName: string;
    args?: Record<string, unknown>;
    fromBlock: bigint;
    toBlock: "latest";
  }) => Promise<RawHistoryLog[]>;
};

type BlockReadableClient = {
  getBlock: (request: { blockNumber: bigint }) => Promise<{ timestamp?: bigint | number | string }>;
};

type RawHistoryLog = {
  args?: Record<string, unknown>;
  transactionHash?: `0x${string}` | null;
  blockNumber?: bigint | null;
  logIndex?: number | bigint | null;
  removed?: boolean;
};

type HistoryEventConfig = {
  source: "AuctionHouse" | "EscrowVault" | "DistributionVault";
  address: Address;
  abi: readonly unknown[];
  eventName: string;
  kind: AuctionHistoryEventKind;
};

type TaggedHistoryLog = RawHistoryLog & {
  source: HistoryEventConfig["source"];
  eventName: string;
  kind: AuctionHistoryEventKind;
  fallbackIndex: number;
};

type BidRecordReadResult = {
  readSucceeded: boolean;
  bids: AuctionBidHistoryEntry[];
  warning?: string;
  totalBidCount: string | null;
  hasMoreBids: boolean;
  nextBefore: string | null;
};

type EventReadResult = {
  logs: TaggedHistoryLog[];
  warning?: string;
  totalLogCount?: number;
  bidLogs?: TaggedHistoryLog[];
  bidLogsRead?: boolean;
};

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

function toAddress(value: unknown): Address | undefined {
  if (typeof value === "string" && isAddress(value)) {
    return value;
  }

  return undefined;
}

function normalizeLogIndex(value: number | bigint | null | undefined, fallback: number) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return fallback;
}

function parseAmount(value?: string | null) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function sumAmounts(values: Array<string | undefined | null>) {
  return values.reduce((total, value) => total + parseAmount(value), 0n).toString();
}

function blockSortValue(log: TaggedHistoryLog) {
  return log.blockNumber ?? 0n;
}

function sortChronologically(a: TaggedHistoryLog, b: TaggedHistoryLog) {
  const aBlock = blockSortValue(a);
  const bBlock = blockSortValue(b);

  if (aBlock === bBlock) {
    return normalizeLogIndex(a.logIndex, a.fallbackIndex) - normalizeLogIndex(b.logIndex, b.fallbackIndex);
  }

  return aBlock < bBlock ? -1 : 1;
}

function buildTransparencySummary(auction: SerializedAuction): AuctionTransparencySummary {
  const economics = auction.economics;

  return {
    seller: auction.seller,
    highestBidder: auction.highestBidder,
    highestBid: auction.highestBid,
    finalPrice: economics?.settlement.finalPrice ?? (auction.finalized ? auction.highestBid : "0"),
    sellerProceeds: economics?.settlement.sellerProceeds ?? "0",
    protocolFees: economics?.settlement.feeAmount ?? "0",
    distributionReserve: economics?.settlement.distributionReserve ?? "0",
    totalAssignedRewards: economics?.distribution.totalAssigned ?? "0",
    totalClaimedRewards: economics?.distribution.totalClaimed ?? "0",
    visibleRefundableAmount: sumAmounts([
      economics?.primaryBidder.refundableAmount,
      economics?.secondBidder.refundableAmount
    ]),
    visibleRewardEntitlement: sumAmounts([
      economics?.primaryBidder.rewardEntitlement,
      economics?.secondBidder.rewardEntitlement
    ]),
    nftClaimed: auction.nftClaimed
  };
}

async function readBidRecords({
  client,
  deployment,
  auctionId,
  before
}: {
  client: PublicClient;
  deployment: DeploymentFile;
  auctionId: bigint;
  before?: bigint;
}): Promise<BidRecordReadResult> {
  let totalBidCount: string | null = null;
  if (before !== undefined && (before < 0n || before > MAX_UINT256)) throw new InvalidBidHistoryCursorError();
  try {
    const bidCount = (await client.readContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "getBidCount",
      args: [auctionId]
    })) as bigint;
    if (typeof bidCount !== "bigint" || bidCount < 0n || bidCount > MAX_UINT256) throw new Error("Invalid bid count");
    totalBidCount = bidCount.toString();
    if (before !== undefined && before > bidCount) throw new InvalidBidHistoryCursorError();
    const endIndex = before ?? bidCount;
    const startIndex = endIndex > BigInt(MAX_BID_HISTORY_RECORDS) ? endIndex - BigInt(MAX_BID_HISTORY_RECORDS) : 0n;
    const recordsToRead = Number(endIndex - startIndex);

    const bids: AuctionBidHistoryEntry[] = [];

    for (let offset = 0; offset < recordsToRead; offset += 1) {
      const recordIndex = startIndex + BigInt(offset);
      const rawBid = await client.readContract({
        address: deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "getBid",
        args: [auctionId, recordIndex]
      });

      const bidder = toAddress(getField(rawBid, "bidder", 0));
      if (!bidder) throw new Error("Invalid bid record");
      bids.push({
        index: recordIndex.toString(),
        bidder,
        amount: toDecimalString(getField(rawBid, "amount", 1)),
        timestamp: toDecimalString(getField(rawBid, "timestamp", 2))
      });
    }

    return {
      readSucceeded: true,
      bids,
      totalBidCount,
      hasMoreBids: startIndex > 0n,
      nextBefore: startIndex > 0n ? startIndex.toString() : null
    };
  } catch (error) {
    if (error instanceof InvalidBidHistoryCursorError) throw error;
    // A failed page is atomic: never skip an unread record and advance its cursor.
    if (before !== undefined) throw new Error("Unable to read earlier bid records");
    return {
      readSucceeded: false,
      bids: [],
      totalBidCount,
      hasMoreBids: false,
      nextBefore: null,
      warning: "Unable to read bid records from AuctionHouse.getBid."
    };
  }
}

async function readEventsForConfig({
  client,
  config,
  auctionId
}: {
  client: PublicClient;
  config: HistoryEventConfig;
  auctionId: bigint;
}): Promise<EventReadResult> {
  try {
    const eventClient = client as unknown as EventReadableClient;
    const logs = await eventClient.getContractEvents({
      address: config.address,
      abi: config.abi,
      eventName: config.eventName,
      args: { auctionId },
      fromBlock: 0n,
      toBlock: "latest"
    });

    // Retain only the earliest bounded timeline window, even if the RPC returns
    // more logs or returns them in reverse order. Bid verification uses its own
    // complete sequence below, independently of the mixed timeline window.
    const retained: TaggedHistoryLog[] = [];
    const bidLogs: TaggedHistoryLog[] = [];
    logs.forEach((log, index) => {
      const tagged = {
        ...log,
        source: config.source,
        eventName: config.eventName,
        kind: config.kind,
        fallbackIndex: index
      };
      if (config.kind === "bid-placed" && logs.length <= MAX_BID_HISTORY_RECORDS) bidLogs.push(tagged);
      let low = 0;
      let high = retained.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (sortChronologically(retained[middle], tagged) <= 0) low = middle + 1;
        else high = middle;
      }
      if (low < MAX_HISTORY_EVENTS) {
        retained.splice(low, 0, tagged);
        if (retained.length > MAX_HISTORY_EVENTS) retained.pop();
      }
    });

    return {
      logs: retained,
      totalLogCount: logs.length,
      bidLogs: config.kind === "bid-placed" ? bidLogs : undefined,
      bidLogsRead: config.kind === "bid-placed"
    };
  } catch {
    return {
      logs: [],
      warning: `Unable to read ${config.source}.${config.eventName} logs.`
    };
  }
}

async function readHistoryLogs({
  client,
  deployment,
  auctionId
}: {
  client: PublicClient;
  deployment: DeploymentFile;
  auctionId: bigint;
}): Promise<EventReadResult> {
  const eventConfigs: HistoryEventConfig[] = [
    {
      source: "AuctionHouse",
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      eventName: "AuctionCreated",
      kind: "auction-created"
    },
    {
      source: "AuctionHouse",
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      eventName: "BidPlaced",
      kind: "bid-placed"
    },
    {
      source: "AuctionHouse",
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      eventName: "AuctionExtended",
      kind: "auction-extended"
    },
    {
      source: "AuctionHouse",
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      eventName: "AuctionEnded",
      kind: "auction-ended"
    },
    {
      source: "AuctionHouse",
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      eventName: "AuctionFinalized",
      kind: "auction-finalized"
    },
    {
      source: "AuctionHouse",
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      eventName: "NFTClaimed",
      kind: "nft-claimed"
    },
    {
      source: "EscrowVault",
      address: deployment.contracts.escrowVault,
      abi: escrowVaultAbi,
      eventName: "RefundClaimed",
      kind: "refund-claimed"
    },
    {
      source: "DistributionVault",
      address: deployment.contracts.distributionVault,
      abi: distributionVaultAbi,
      eventName: "DistributionOpened",
      kind: "distribution-opened"
    },
    {
      source: "DistributionVault",
      address: deployment.contracts.distributionVault,
      abi: distributionVaultAbi,
      eventName: "DistributionClaimed",
      kind: "reward-claimed"
    }
  ];

  const results = await Promise.all(
    eventConfigs.map((config) =>
      readEventsForConfig({
        client,
        config,
        auctionId
      })
    )
  );

  const logs = results.flatMap((result) => result.logs).sort(sortChronologically);
  const warnings = results.flatMap((result) => (result.warning ? [result.warning] : []));
  const totalLogCount = results.reduce((count, result) => count + (result.totalLogCount ?? 0), 0);
  const bidResult = results[1];
  if (totalLogCount > MAX_HISTORY_EVENTS) {
    warnings.push(`Auction timeline is limited to the first ${MAX_HISTORY_EVENTS} logs returned by the RPC.`);
  }

  return {
    logs: logs.slice(0, MAX_HISTORY_EVENTS),
    bidLogs: bidResult.bidLogs,
    bidLogsRead: bidResult.bidLogsRead,
    warning: warnings.length > 0 ? warnings.join(" ") : undefined
  };
}

async function readBlockTimestamps(client: PublicClient, logs: TaggedHistoryLog[]) {
  const blockClient = client as unknown as BlockReadableClient;
  const blockNumbers = Array.from(
    new Set(logs.map((log) => log.blockNumber).filter((value): value is bigint => typeof value === "bigint"))
  );
  const timestamps = new Map<string, string>();
  const warnings: string[] = [];

  let nextBlock = 0;
  await Promise.all(
    Array.from({ length: Math.min(MAX_BLOCK_READ_CONCURRENCY, blockNumbers.length) }, async () => {
      while (nextBlock < blockNumbers.length) {
        const blockNumber = blockNumbers[nextBlock++];
        try {
          const block = await blockClient.getBlock({ blockNumber });
          timestamps.set(blockNumber.toString(), toDecimalString(block.timestamp));
        } catch {
          warnings.push(`Unable to read timestamp for block ${blockNumber.toString()}.`);
        }
      }
    })
  );

  return { timestamps, warnings };
}

function eventActor(log: TaggedHistoryLog): Address | undefined {
  const args = log.args ?? {};
  return (
    toAddress(args.seller) ??
    toAddress(args.bidder) ??
    toAddress(args.winner) ??
    toAddress(args.claimant)
  );
}

function eventAmount(log: TaggedHistoryLog): string | undefined {
  const args = log.args ?? {};
  const amount = args.amount ?? args.finalPrice ?? args.startPrice ?? args.totalAssigned;

  if (amount === undefined || amount === null) return undefined;

  return toDecimalString(amount);
}

function eventLabel(kind: AuctionHistoryEventKind) {
  const labels: Record<AuctionHistoryEventKind, string> = {
    "auction-created": "Auction created",
    "bid-placed": "Bid placed",
    "auction-extended": "Auction extended",
    "auction-ended": "Auction ended",
    "auction-finalized": "Auction finalized",
    "nft-claimed": "NFT claimed",
    "refund-claimed": "Refund claimed",
    "distribution-opened": "Distribution opened",
    "reward-claimed": "Reward claimed"
  };

  return labels[kind];
}

function eventDetails(log: TaggedHistoryLog) {
  const args = log.args ?? {};

  if (log.kind === "auction-created") {
    return `Token ${toDecimalString(args.tokenId)} was listed.`;
  }

  if (log.kind === "auction-extended") {
    return `New end time ${toDecimalString(args.newEndTime)}; extensions used ${toDecimalString(args.extensionsUsed)}.`;
  }

  if (log.kind === "auction-finalized") {
    return `Fee ${toDecimalString(args.feeAmount)} wei; distribution ${toDecimalString(args.distributionAmount)} wei.`;
  }

  return undefined;
}

function serializeHistoryEvent(
  log: TaggedHistoryLog,
  timestampByBlock: Map<string, string>,
  fallbackIndex: number
): AuctionHistoryEvent {
  const blockNumber = log.blockNumber?.toString();
  const logIndex = normalizeLogIndex(log.logIndex, log.fallbackIndex);
  const transactionHash = typeof log.transactionHash === "string" ? log.transactionHash : undefined;

  return {
    id: `${log.kind}:${transactionHash ?? "no-tx"}:${blockNumber ?? "no-block"}:${logIndex}:${fallbackIndex}`,
    kind: log.kind,
    label: eventLabel(log.kind),
    actor: eventActor(log),
    amount: eventAmount(log),
    transactionHash,
    blockNumber,
    logIndex,
    timestamp: blockNumber ? timestampByBlock.get(blockNumber) : undefined,
    details: eventDetails(log)
  };
}

function realLogIndex(log: TaggedHistoryLog): number | undefined {
  if (typeof log.logIndex === "bigint" && log.logIndex >= 0n && log.logIndex <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(log.logIndex);
  }
  if (typeof log.logIndex === "number" && Number.isSafeInteger(log.logIndex) && log.logIndex >= 0) return log.logIndex;
  return undefined;
}

function mergeBidRecordsWithLogs(result: BidRecordReadResult, events: EventReadResult, auctionId: bigint) {
  const records = result.bids;
  if (records.length === 0) return { bids: records };
  const bidLogs = [...(events.bidLogs ?? [])].sort(sortChronologically);
  const orderKeys = new Set<string>();
  const verified = events.bidLogsRead && result.totalBidCount === String(records.length) &&
    bidLogs.length === records.length && bidLogs.every((log, index) => {
      const record = records[index];
      const logIndex = realLogIndex(log);
      if (log.removed || typeof log.blockNumber !== "bigint" || log.blockNumber < 0n || logIndex === undefined ||
        typeof log.transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash)) return false;
      const orderKey = `${log.blockNumber}:${logIndex}`;
      if (orderKeys.has(orderKey)) return false;
      orderKeys.add(orderKey);
      return record.index === String(index) && log.args?.auctionId === auctionId &&
        toAddress(log.args?.bidder)?.toLowerCase() === record.bidder.toLowerCase() &&
        typeof log.args?.amount === "bigint" && log.args.amount.toString() === record.amount;
    });

  if (!verified) {
    return { bids: records, warning: "Bid transaction metadata is unavailable because the complete event sequence could not be verified against canonical bid records." };
  }
  return { bids: records.map((record, index) => ({
      ...record,
      transactionHash: bidLogs[index].transactionHash ?? undefined,
      blockNumber: bidLogs[index].blockNumber?.toString(),
      logIndex: realLogIndex(bidLogs[index])
    })) };
}

function historySource({
  bidRecordsRead,
  bids,
  events
}: {
  bidRecordsRead: boolean;
  bids: AuctionBidHistoryEntry[];
  events: AuctionHistoryEvent[];
}): AuctionHistorySource {
  if (bidRecordsRead && events.length > 0) return "bid-records-and-events";
  if (bidRecordsRead) return "bid-records-only";
  if (events.length > 0 || bids.length > 0) return "events-only";
  return "unavailable";
}

export async function readAuctionHistory({
  client,
  deployment,
  auctionId,
  auction,
  before
}: {
  client: PublicClient;
  deployment: DeploymentFile;
  auctionId: bigint;
  auction: SerializedAuction;
  before?: bigint;
}): Promise<AuctionHistory> {
  const warnings: string[] = [];
  const [bidRecordResult, eventResult] = await Promise.all([
    readBidRecords({ client, deployment, auctionId, before }),
    before === undefined ? readHistoryLogs({ client, deployment, auctionId }) : Promise.resolve<EventReadResult>({ logs: [] })
  ]);

  if (bidRecordResult.warning) warnings.push(bidRecordResult.warning);
  if (eventResult.warning) warnings.push(eventResult.warning);

  const timestampResult = await readBlockTimestamps(client, eventResult.logs);
  warnings.push(...timestampResult.warnings);

  const events = eventResult.logs.map((log, index) => serializeHistoryEvent(log, timestampResult.timestamps, index));
  // Event-only fallback belongs in the timeline: it cannot establish canonical
  // getBid indices and must never fabricate rows in the canonical bid table.
  const bidMerge = bidRecordResult.readSucceeded && before === undefined
    ? mergeBidRecordsWithLogs(bidRecordResult, eventResult, auctionId)
    : { bids: bidRecordResult.bids, warning: before !== undefined && bidRecordResult.bids.length > 0
      ? "Earlier bid transaction metadata is unavailable; earlier pages read canonical records without rescanning event logs."
      : undefined };
  if (bidMerge.warning) warnings.push(bidMerge.warning);
  const bids = bidMerge.bids;

  return {
    auctionId: auctionId.toString(),
    source: historySource({
      bidRecordsRead: bidRecordResult.readSucceeded,
      bids,
      events
    }),
    partial: warnings.length > 0,
    warnings,
    totalBidCount: bidRecordResult.totalBidCount,
    bidsAvailable: bidRecordResult.readSucceeded,
    hasMoreBids: bidRecordResult.hasMoreBids,
    nextBefore: bidRecordResult.nextBefore,
    returnedBidCount: bids.length,
    bids,
    events,
    transparency: buildTransparencySummary(auction)
  };
}
