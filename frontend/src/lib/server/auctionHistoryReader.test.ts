import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { InvalidBidHistoryCursorError, parseBidHistoryCursor, readAuctionHistory } from "@/lib/server/auctionHistoryReader";
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
  blockNumber?: bigint | null;
  logIndex?: number | bigint | null;
  removed?: boolean;
};

type MockClientOptions = {
  bidRecords?: MockBidRecord[];
  eventLogs?: Record<string, MockLog[]>;
  failBidRecords?: boolean;
  failEvents?: boolean;
  blocks?: Record<string, bigint>;
  bidCount?: bigint;
  getBid?: (index: bigint) => MockBidRecord;
  failBidIndex?: bigint;
  failEventNames?: string[];
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
  blocks = {},
  bidCount,
  getBid,
  failBidIndex,
  failEventNames = []
}: MockClientOptions): PublicClient {
  return {
    readContract: vi.fn(async (request: ReadContractRequest) => {
      if (failBidRecords && (request.functionName === "getBidCount" || request.functionName === "getBid")) {
        throw new Error("bid record failure");
      }

      if (request.functionName === "getBidCount") {
        return bidCount ?? BigInt(bidRecords.length);
      }

      if (request.functionName === "getBid") {
        const index = request.args?.[1] as bigint;
        if (index === failBidIndex) throw new Error("RPC credential-sensitive internal failure");
        return getBid ? getBid(index) : bidRecords[Number(index)];
      }

      throw new Error(`Unexpected read ${request.functionName}`);
    }),
    getContractEvents: vi.fn(async (request: EventRequest) => {
      if (failEvents || failEventNames.includes(request.eventName)) {
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
  it.each([0, 1, 199, 200, 201, 205, 400, 450])("paginates all %i canonical records without overlap, omissions or extra RPC work", async (count) => {
    const client = mockClient({ bidRecords: Array.from({ length: count }, (_, index) => bidRecord(testAddresses.primaryBidder, BigInt(index + 1), BigInt(index + 100))) });
    const options = { client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction };
    const initial = await readAuctionHistory(options);
    const pages = [initial];
    const readMock = vi.mocked(client.readContract);
    const eventMock = vi.mocked(client.getContractEvents);
    const blockMock = vi.mocked(client.getBlock);
    let next = initial.nextBefore;
    expect(eventMock).toHaveBeenCalledTimes(9);
    expect(readMock.mock.calls.filter(([request]) => request.functionName === "getBid")).toHaveLength(Math.min(count, 200));
    while (next !== null) {
      readMock.mockClear();
      eventMock.mockClear();
      blockMock.mockClear();
      const page = await readAuctionHistory({ ...options, before: BigInt(next!) });
      expect(readMock.mock.calls.filter(([request]) => request.functionName === "getBid").length).toBeLessThanOrEqual(200);
      expect(eventMock).not.toHaveBeenCalled();
      expect(blockMock).not.toHaveBeenCalled();
      expect(page.events).toEqual([]);
      pages.push(page);
      next = page.nextBefore;
    }
    for (const page of pages) {
      expect(page.totalBidCount).toBe(String(count));
      expect(page.returnedBidCount).toBe(page.bids.length);
      expect(page.bidsAvailable).toBe(true);
      expect(page.bids.length).toBeLessThanOrEqual(200);
      const first = BigInt(page.bids[0]?.index ?? "0");
      expect(page.hasMoreBids).toBe(first > 0n);
      expect(page.nextBefore).toBe(first > 0n ? first.toString() : null);
      expect(page.bids.map((bid) => bid.index)).toEqual(Array.from({ length: page.bids.length }, (_, index) => (first + BigInt(index)).toString()));
    }
    const allIndices = pages.flatMap((page) => page.bids.map((bid) => Number(bid.index))).sort((a, b) => a - b);
    expect(allIndices).toEqual(Array.from({ length: count }, (_, index) => index));
  });

  it("keeps exclusive cursor pages stable when new bids arrive", async () => {
    const records = Array.from({ length: 205 }, (_, index) => bidRecord(testAddresses.primaryBidder, BigInt(index + 1), 100n));
    const client = mockClient({ bidRecords: records });
    const options = { client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction };
    const initial = await readAuctionHistory(options);
    records.push(bidRecord(testAddresses.secondBidder, 300n, 101n));
    const earlier = await readAuctionHistory({ ...options, before: BigInt(initial.nextBefore!) });
    expect(earlier.bids.map((bid) => bid.index)).toEqual(["0", "1", "2", "3", "4"]);
    expect(earlier.totalBidCount).toBe("206");
  });

  it("preserves exact bigint indices above JavaScript's safe integer range", async () => {
    const count = BigInt(Number.MAX_SAFE_INTEGER) + 4096n;
    const client = mockClient({ bidCount: count, getBid: (index) => bidRecord(testAddresses.primaryBidder, index + 1n, 100n) });
    const options = { client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction };
    const initial = await readAuctionHistory(options);
    expect(initial.bids[0].index).toBe((count - 200n).toString());
    expect(initial.bids.at(-1)?.index).toBe((count - 1n).toString());
    expect(initial.nextBefore).toBe((count - 200n).toString());
    const earlier = await readAuctionHistory({ ...options, before: parseBidHistoryCursor(initial.nextBefore!) });
    expect(earlier.bids.at(-1)?.index).toBe((count - 201n).toString());
    expect(vi.mocked(client.readContract).mock.calls.filter(([request]) => request.functionName === "getBid")).toHaveLength(400);
  });

  it.each(["", "-1", "+1", "01", "1.5", "1e2", "0x10", " 1", "1 ", "NaN", ((1n << 256n)).toString(), "9".repeat(1000)])("rejects malformed or out-of-range decimal cursor %s", (value) => {
    expect(() => parseBidHistoryCursor(value)).toThrow(InvalidBidHistoryCursorError);
  });

  it("accepts zero and the maximum uint256 decimal cursor without rounding", () => {
    expect(parseBidHistoryCursor("0")).toBe(0n);
    expect(parseBidHistoryCursor(((1n << 256n) - 1n).toString())).toBe((1n << 256n) - 1n);
  });

  it("rejects cursors past the canonical count before reading records or logs", async () => {
    const client = mockClient({ bidRecords: [bidRecord(testAddresses.primaryBidder, 1n, 100n)] });
    await expect(readAuctionHistory({ client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction, before: 2n })).rejects.toThrow(InvalidBidHistoryCursorError);
    expect(client.getContractEvents).not.toHaveBeenCalled();
    expect(client.readContract).toHaveBeenCalledTimes(1);
  });

  it("treats failed canonical pages atomically and never exposes a skipped-page cursor", async () => {
    const client = mockClient({ bidRecords: Array.from({ length: 3 }, (_, index) => bidRecord(testAddresses.primaryBidder, BigInt(index + 1), 100n)), failBidIndex: 1n });
    const options = { client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction };
    const initial = await readAuctionHistory(options);
    expect(initial.bidsAvailable).toBe(false);
    expect(initial.bids).toEqual([]);
    expect(initial.totalBidCount).toBe("3");
    expect(initial.nextBefore).toBeNull();
    await expect(readAuctionHistory({ ...options, before: 3n })).rejects.toThrow("Unable to read earlier bid records");
    expect(JSON.stringify(initial)).not.toContain("credential-sensitive");
  });

  it.each(["missing", "wrong bidder", "wrong amount", "wrong auction", "removed", "duplicate order", "missing block", "missing log index"])("omits all bid metadata when the complete event sequence is %s", async (failure) => {
    const records = [bidRecord(testAddresses.primaryBidder, 1n, 100n), bidRecord(testAddresses.secondBidder, 2n, 101n)];
    const logs = records.map((record, index) => eventLog({ auctionId: 1n, bidder: record.bidder, amount: record.amount }, BigInt(index + 1), 0, String(index + 1)));
    if (failure === "missing") logs.pop();
    if (failure === "wrong bidder") logs[0].args.bidder = testAddresses.secondBidder;
    if (failure === "wrong amount") logs[0].args.amount = 10n;
    if (failure === "wrong auction") logs[0].args.auctionId = 2n;
    if (failure === "removed") logs[0].removed = true;
    if (failure === "duplicate order") logs[1].blockNumber = logs[0].blockNumber;
    if (failure === "missing block") logs[0].blockNumber = null;
    if (failure === "missing log index") logs[0].logIndex = null;
    const client = mockClient({ bidRecords: records, eventLogs: { BidPlaced: logs } });
    const history = await readAuctionHistory({ client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction });
    expect(history.bids.map((bid) => ({ hash: bid.transactionHash, block: bid.blockNumber, log: bid.logIndex }))).toEqual([{ hash: undefined, block: undefined, log: undefined }, { hash: undefined, block: undefined, log: undefined }]);
    expect(history.warnings.join(" ")).toContain("complete event sequence could not be verified");
  });

  it("sorts reversed RPC logs using real block and log order before verification", async () => {
    const records = [bidRecord(testAddresses.primaryBidder, 1n, 100n), bidRecord(testAddresses.secondBidder, 2n, 100n)];
    const logs = records.map((record, index) => eventLog({ auctionId: 1n, bidder: record.bidder, amount: record.amount }, 1n, index, String(index + 1))).reverse();
    const client = mockClient({ bidRecords: records, eventLogs: { BidPlaced: logs } });
    const history = await readAuctionHistory({ client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction });
    expect(history.bids.map((bid) => bid.transactionHash)).toEqual([txHash("1"), txHash("2")]);
    expect(history.bids.map((bid) => bid.logIndex)).toEqual([0, 1]);
  });

  it("verifies a complete 200-bid page at the enrichment boundary", async () => {
    const records = Array.from({ length: 200 }, (_, index) => bidRecord(testAddresses.primaryBidder, BigInt(index + 1), 100n));
    const logs = records.map((record, index) => eventLog({ auctionId: 1n, bidder: record.bidder, amount: record.amount }, BigInt(index + 1), 0, "a")).reverse();
    const client = mockClient({ bidRecords: records, eventLogs: { BidPlaced: logs } });
    const history = await readAuctionHistory({ client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction });
    expect(history.bids).toHaveLength(200);
    expect(history.bids.every((bid) => bid.transactionHash === txHash("a"))).toBe(true);
    expect(history.bids[0].blockNumber).toBe("1");
    expect(history.bids.at(-1)?.blockNumber).toBe("200");
    expect(history.partial).toBe(false);
  });

  it("bounds concurrent timestamp reads to eight", async () => {
    const client = mockClient({ eventLogs: { AuctionExtended: Array.from({ length: 25 }, (_, index) => eventLog({ auctionId: 1n }, BigInt(index + 1), 0, "a")) } });
    let inFlight = 0;
    let peak = 0;
    vi.mocked(client.getBlock).mockImplementation(async (request) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight--;
      return { timestamp: request?.blockNumber ?? 100n } as Awaited<ReturnType<PublicClient["getBlock"]>>;
    });
    const history = await readAuctionHistory({ client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction });
    expect(history.events).toHaveLength(25);
    expect(peak).toBe(8);
    expect(client.getBlock).toHaveBeenCalledTimes(25);
  });

  it("verifies bid metadata independently of timeline truncation and preserves simultaneous log errors", async () => {
    const records = [bidRecord(testAddresses.primaryBidder, 1n, 100n)];
    const client = mockClient({ bidRecords: records, failEventNames: ["RefundClaimed"], eventLogs: {
      AuctionExtended: Array.from({ length: 300 }, (_, index) => eventLog({ auctionId: 1n }, BigInt(index + 1), 0, "a")).reverse(),
      BidPlaced: [eventLog({ auctionId: 1n, bidder: records[0].bidder, amount: 1n }, 400n, 0, "b")]
    } });
    const history = await readAuctionHistory({ client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction });
    expect(history.events).toHaveLength(250);
    expect(history.events[0].blockNumber).toBe("1");
    expect(history.events.at(-1)?.blockNumber).toBe("250");
    expect(history.bids[0].transactionHash).toBe(txHash("b"));
    expect(history.warnings.join(" ")).toContain("Unable to read EscrowVault.RefundClaimed logs.");
    expect(history.warnings.join(" ")).toContain("limited to the first 250 logs");
    expect(client.getBlock).toHaveBeenCalledTimes(250);
  });

  it("makes the oldest records of a 205-bid auction accessible through an exclusive cursor", async () => {
    const client = mockClient({
      bidRecords: Array.from({ length: 205 }, (_, index) =>
        bidRecord(testAddresses.primaryBidder, BigInt(index + 1), BigInt(1780000000 + index))
      )
    });
    const options = { client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction };
    const initial = await readAuctionHistory(options);
    const earlier = await readAuctionHistory({ ...options, before: 5n });

    expect(initial.bids.map((bid) => bid.index)).toEqual(Array.from({ length: 200 }, (_, index) => String(index + 5)));
    expect(initial.nextBefore).toBe("5");
    expect(initial.totalBidCount).toBe("205");
    expect(earlier.bids.map((bid) => bid.index)).toEqual(["0", "1", "2", "3", "4"]);
    expect(earlier.hasMoreBids).toBe(false);
  });

  it("never attributes the earliest event transactions to a partial latest-bid page", async () => {
    const records = Array.from({ length: 205 }, (_, index) =>
      bidRecord(testAddresses.primaryBidder, BigInt(index + 1), BigInt(1780000000 + index))
    );
    const client = mockClient({
      bidRecords: records,
      eventLogs: { BidPlaced: records.map((record, index) => eventLog({ auctionId: 1n, bidder: record.bidder, amount: record.amount }, BigInt(index + 1), 0, "a")) }
    });
    const history = await readAuctionHistory({ client, deployment: localDeploymentFixture, auctionId: 1n, auction: auctionDetailFixture.auction });

    expect(history.bids[0].index).toBe("5");
    expect(history.bids.every((bid) => !bid.transactionHash && !bid.blockNumber && bid.logIndex === undefined)).toBe(true);
  });

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
    expect(history.warnings.join(" ")).toContain("Unable to read AuctionHouse.BidPlaced logs.");
    expect(history.bids).toHaveLength(1);
    expect(history.events).toEqual([]);
  });

  it("keeps event fallback in the timeline without inventing canonical bid indices", async () => {
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
    expect(history.bids).toEqual([]);
    expect(history.bidsAvailable).toBe(false);
    expect(history.totalBidCount).toBeNull();
    expect(history.events[0]).toMatchObject({
      actor: testAddresses.primaryBidder,
      amount: "1000000000000000000",
      transactionHash: txHash("d"),
      timestamp: "1780000100"
    });
  });
});
