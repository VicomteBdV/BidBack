import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { readAuctionHistory } from "@/lib/server/auctionHistoryReader";
import { auctionDetailFixture, localDeploymentFixture, testAddresses } from "@/test/fixtures";

type ReadContractRequest = {
  functionName: string;
  args?: readonly unknown[];
};

type EventRequest = {
  eventName: string;
};

type BlockRequest = {
  blockNumber: bigint;
};

type MockBidRecord = {
  bidder: `0x${string}`;
  amount: bigint;
  timestamp: bigint;
};

type MockLog = {
  args: Record<string, unknown>;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
};

type MockClientOptions = {
  bidRecords?: MockBidRecord[];
  eventLogs?: Record<string, MockLog[]>;
  failBidRecords?: boolean;
  failEvents?: boolean;
  blocks?: Record<string, bigint>;
};

function txHash(seed: string) {
  return `0x${seed.repeat(64).slice(0, 64)}` as `0x${string}`;
}

function bidRecord(bidder: `0x${string}`, amount: bigint, timestamp: bigint): MockBidRecord {
  return {
    bidder,
    amount,
    timestamp
  };
}

function eventLog(args: Record<string, unknown>, blockNumber: bigint, logIndex: number, seed: string): MockLog {
  return {
    args,
    transactionHash: txHash(seed),
    blockNumber,
    logIndex
  };
}

function mockClient({
  bidRecords = [],
  eventLogs = {},
  failBidRecords = false,
  failEvents = false,
  blocks = {}
}: MockClientOptions): PublicClient {
  return {
    readContract: vi.fn(async (request: ReadContractRequest) => {
      if (failBidRecords && (request.functionName === "getBidCount" || request.functionName === "getBid")) {
        throw new Error("bid record failure");
      }

      if (request.functionName === "getBidCount") {
        return BigInt(bidRecords.length);
      }

      if (request.functionName === "getBid") {
        const index = Number(request.args?.[1] ?? 0);
        return bidRecords[index];
      }

      throw new Error(`Unexpected read ${request.functionName}`);
    }),
    getContractEvents: vi.fn(async (request: EventRequest) => {
      if (failEvents) {
        throw new Error("log failure");
      }

      return eventLogs[request.eventName] ?? [];
    }),
    getBlock: vi.fn(async ({ blockNumber }: BlockRequest) => ({
      timestamp: blocks[blockNumber.toString()] ?? blockNumber
    }))
  } as unknown as PublicClient;
}

describe("auctionHistoryReader", () => {
  it("returns an empty bid history when no bids exist", async () => {
    const client = mockClient({
      eventLogs: {
        AuctionCreated: [
          eventLog(
            {
              auctionId: 1n,
              seller: testAddresses.seller,
              tokenId: 1n,
              startPrice: 1_000_000_000_000_000_000n
            },
            10n,
            0,
            "a"
          )
        ]
      },
      blocks: {
        "10": 1780000000n
      }
    });

    const history = await readAuctionHistory({
      client,
      deployment: localDeploymentFixture,
      auctionId: 1n,
      auction: {
        ...auctionDetailFixture.auction,
        bidCount: "0",
        highestBid: "0"
      }
    });

    expect(history.bids).toEqual([]);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].label).toBe("Auction created");
    expect(() => JSON.stringify(history)).not.toThrow();
  });

  it("reads multiple bid records chronologically and enriches them with event transaction data", async () => {
    const client = mockClient({
      bidRecords: [
        bidRecord(testAddresses.primaryBidder, 1_000_000_000_000_000_000n, 1780000100n),
        bidRecord(testAddresses.secondBidder, 1_200_000_000_000_000_000n, 1780000200n)
      ],
      eventLogs: {
        BidPlaced: [
          eventLog(
            {
              auctionId: 1n,
              bidder: testAddresses.primaryBidder,
              amount: 1_000_000_000_000_000_000n
            },
            11n,
            0,
            "b"
          ),
          eventLog(
            {
              auctionId: 1n,
              bidder: testAddresses.secondBidder,
              amount: 1_200_000_000_000_000_000n
            },
            12n,
            0,
            "c"
          )
        ]
      },
      blocks: {
        "11": 1780000100n,
        "12": 1780000200n
      }
    });

    const history = await readAuctionHistory({
      client,
      deployment: localDeploymentFixture,
      auctionId: 1n,
      auction: auctionDetailFixture.auction
    });

    expect(history.source).toBe("bid-records-and-events");
    expect(history.bids.map((bid) => bid.bidder)).toEqual([
      testAddresses.primaryBidder,
      testAddresses.secondBidder
    ]);
    expect(history.bids.map((bid) => bid.amount)).toEqual([
      "1000000000000000000",
      "1200000000000000000"
    ]);
    expect(history.bids[0].transactionHash).toBe(txHash("b"));
    expect(history.bids[1].blockNumber).toBe("12");
    expect(history.events.map((event) => event.label)).toEqual(["Bid placed", "Bid placed"]);
    expect(() => JSON.stringify(history)).not.toThrow();
  });

  it("keeps bid records available when event log reads fail", async () => {
    const client = mockClient({
      bidRecords: [bidRecord(testAddresses.primaryBidder, 1_000_000_000_000_000_000n, 1780000100n)],
      failEvents: true
    });

    const history = await readAuctionHistory({
      client,
      deployment: localDeploymentFixture,
      auctionId: 1n,
      auction: auctionDetailFixture.auction
    });

    expect(history.source).toBe("bid-records-only");
    expect(history.partial).toBe(true);
    expect(history.warnings.join(" ")).toMatch(/log failure/);
    expect(history.bids).toHaveLength(1);
    expect(history.events).toEqual([]);
  });

  it("falls back to bid logs if bid record reads are unavailable", async () => {
    const client = mockClient({
      failBidRecords: true,
      eventLogs: {
        BidPlaced: [
          eventLog(
            {
              auctionId: 1n,
              bidder: testAddresses.primaryBidder,
              amount: 1_000_000_000_000_000_000n
            },
            11n,
            0,
            "d"
          )
        ]
      },
      blocks: {
        "11": 1780000100n
      }
    });

    const history = await readAuctionHistory({
      client,
      deployment: localDeploymentFixture,
      auctionId: 1n,
      auction: auctionDetailFixture.auction
    });

    expect(history.source).toBe("events-only");
    expect(history.partial).toBe(true);
    expect(history.bids).toHaveLength(1);
    expect(history.bids[0]).toMatchObject({
      bidder: testAddresses.primaryBidder,
      amount: "1000000000000000000",
      transactionHash: txHash("d"),
      timestamp: "1780000100"
    });
  });
});
