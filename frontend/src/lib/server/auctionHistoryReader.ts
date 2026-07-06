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
import { ZERO_ADDRESS } from "@/lib/format";
import type { DeploymentFile } from "@/lib/server/auctionReader";

const MAX_BID_HISTORY_RECORDS = 200;
const MAX_HISTORY_EVENTS = 250;

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
};

type EventReadResult = {
  logs: TaggedHistoryLog[];
  warning?: string;
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

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "shortMessage" in error) {
    const shortMessage = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof shortMessage === "string") return shortMessage;
  }

  return error instanceof Error ? error.message : String(error);
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
  auctionId
}: {
  client: PublicClient;
  deployment: DeploymentFile;
  auctionId: bigint;
}): Promise<BidRecordReadResult> {
  try {
    const bidCount = (await client.readContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "getBidCount",
      args: [auctionId]
    })) as bigint;

    const recordsToRead = bidCount > BigInt(MAX_BID_HISTORY_RECORDS) ? MAX_BID_HISTORY_RECORDS : Number(bidCount);
    const startIndex = bidCount > BigInt(MAX_BID_HISTORY_RECORDS) ? bidCount - BigInt(MAX_BID_HISTORY_RECORDS) : 0n;

    const bids: AuctionBidHistoryEntry[] = [];

    for (let offset = 0; offset < recordsToRead; offset += 1) {
      const recordIndex = startIndex + BigInt(offset);
      const rawBid = await client.readContract({
        address: deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "getBid",
        args: [auctionId, recordIndex]
      });

      bids.push({
        index: recordIndex.toString(),
        bidder: toAddress(getField(rawBid, "bidder", 0)) ?? ZERO_ADDRESS,
        amount: toDecimalString(getField(rawBid, "amount", 1)),
        timestamp: toDecimalString(getField(rawBid, "timestamp", 2))
      });
    }

    return {
      readSucceeded: true,
      bids,
      warning:
        bidCount > BigInt(MAX_BID_HISTORY_RECORDS)
          ? `Bid history is limited to the latest ${MAX_BID_HISTORY_RECORDS} bid records.`
          : undefined
    };
  } catch (error) {
    return {
      readSucceeded: false,
      bids: [],
      warning: `Unable to read bid records from AuctionHouse.getBid: ${errorMessage(error)}`
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

    return {
      logs: logs.map((log, index) => ({
        ...log,
        source: config.source,
        eventName: config.eventName,
        kind: config.kind,
        fallbackIndex: index
      }))
    };
  } catch (error) {
    return {
      logs: [],
      warning: `Unable to read ${config.source}.${config.eventName} logs: ${errorMessage(error)}`
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

  return {
    logs: logs.slice(0, MAX_HISTORY_EVENTS),
    warning:
      warnings.length > 0
        ? warnings.join(" ")
        : logs.length > MAX_HISTORY_EVENTS
          ? `Auction timeline is limited to the first ${MAX_HISTORY_EVENTS} logs returned by the RPC.`
          : undefined
  };
}

async function readBlockTimestamps(client: PublicClient, logs: TaggedHistoryLog[]) {
  const blockClient = client as unknown as BlockReadableClient;
  const blockNumbers = Array.from(
    new Set(logs.map((log) => log.blockNumber).filter((value): value is bigint => typeof value === "bigint"))
  );
  const timestamps = new Map<string, string>();
  const warnings: string[] = [];

  await Promise.all(
    blockNumbers.map(async (blockNumber) => {
      try {
        const block = await blockClient.getBlock({ blockNumber });
        timestamps.set(blockNumber.toString(), toDecimalString(block.timestamp));
      } catch (error) {
        warnings.push(`Unable to read timestamp for block ${blockNumber.toString()}: ${errorMessage(error)}`);
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

function bidEntriesFromLogs(logs: TaggedHistoryLog[], timestampByBlock: Map<string, string>): AuctionBidHistoryEntry[] {
  return logs
    .filter((log) => log.kind === "bid-placed")
    .map((log, index) => {
      const blockNumber = log.blockNumber?.toString();
      const logIndex = normalizeLogIndex(log.logIndex, log.fallbackIndex);

      return {
        index: index.toString(),
        bidder: eventActor(log) ?? ZERO_ADDRESS,
        amount: eventAmount(log) ?? "0",
        timestamp: blockNumber ? (timestampByBlock.get(blockNumber) ?? "0") : "0",
        transactionHash: typeof log.transactionHash === "string" ? log.transactionHash : undefined,
        blockNumber,
        logIndex
      };
    });
}

function mergeBidRecordsWithLogs(records: AuctionBidHistoryEntry[], logs: TaggedHistoryLog[]) {
  const bidLogs = logs.filter((log) => log.kind === "bid-placed");

  return records.map((record, index) => {
    const log = bidLogs[index];

    if (!log) return record;

    const blockNumber = log.blockNumber?.toString();

    return {
      ...record,
      transactionHash: typeof log.transactionHash === "string" ? log.transactionHash : undefined,
      blockNumber,
      logIndex: normalizeLogIndex(log.logIndex, log.fallbackIndex)
    };
  });
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
  auction
}: {
  client: PublicClient;
  deployment: DeploymentFile;
  auctionId: bigint;
  auction: SerializedAuction;
}): Promise<AuctionHistory> {
  const warnings: string[] = [];
  const [bidRecordResult, eventResult] = await Promise.all([
    readBidRecords({ client, deployment, auctionId }),
    readHistoryLogs({ client, deployment, auctionId })
  ]);

  if (bidRecordResult.warning) warnings.push(bidRecordResult.warning);
  if (eventResult.warning) warnings.push(eventResult.warning);

  const timestampResult = await readBlockTimestamps(client, eventResult.logs);
  warnings.push(...timestampResult.warnings);

  const events = eventResult.logs.map((log, index) => serializeHistoryEvent(log, timestampResult.timestamps, index));
  const bids = bidRecordResult.readSucceeded
    ? mergeBidRecordsWithLogs(bidRecordResult.bids, eventResult.logs)
    : bidEntriesFromLogs(eventResult.logs, timestampResult.timestamps);

  return {
    auctionId: auctionId.toString(),
    source: historySource({
      bidRecordsRead: bidRecordResult.readSucceeded,
      bids,
      events
    }),
    partial: warnings.length > 0,
    warnings,
    bids,
    events,
    transparency: buildTransparencySummary(auction)
  };
}
