import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { readAllAuctions, readAuctionsByIds, normalizeAuctionListLimit } from "@/lib/server/auctionReader";
import { localDeploymentFixture, testAddresses } from "@/test/fixtures";

function auctionTuple(auctionId: bigint) {
  return [
    testAddresses.seller,
    testAddresses.localNft,
    auctionId,
    1_000_000_000_000_000_000n,
    1_780_000_000n + auctionId,
    1_780_007_200n + auctionId,
    1_780_007_200n + auctionId,
    0,
    0,
    "0x0000000000000000000000000000000000000000",
    0n,
    0n,
    0n,
    false
  ];
}

function auctionCreatedLog(auctionId: bigint, blockNumber: bigint, logIndex = 0) {
  return {
    args: {
      auctionId
    },
    blockNumber,
    logIndex
  };
}

function createReaderClient({
  nextAuctionId,
  logs,
  logsError,
  tokenUri
}: {
  nextAuctionId: bigint;
  logs?: ReturnType<typeof auctionCreatedLog>[];
  logsError?: Error;
  tokenUri?: string;
}) {
  const readContract = vi.fn(async (request: unknown) => {
    const { functionName, args } = request as { functionName?: string; args?: readonly unknown[] };

    if (functionName === "nextAuctionId") {
      return nextAuctionId;
    }

    if (functionName === "getAuction") {
      const auctionId = args?.[0];
      if (typeof auctionId !== "bigint") throw new Error("missing auctionId");
      return auctionTuple(auctionId);
    }

    if (functionName === "name") {
      return "BidBack Demo";
    }

    if (functionName === "symbol") {
      return "BID";
    }

    if (functionName === "tokenURI") {
      if (tokenUri) return tokenUri;
      throw new Error("tokenURI unavailable in test fixture");
    }

    throw new Error(`unexpected readContract call: ${String(functionName)}`);
  });

  const getContractEvents = vi.fn(async () => {
    if (logsError) throw logsError;
    return logs ?? [];
  });

  return {
    client: {
      readContract,
      getContractEvents
    } as unknown as PublicClient,
    readContract,
    getContractEvents
  };
}

describe("auctionReader auction discovery", () => {
  it("discovers auctions from AuctionCreated events newest-first", async () => {
    const { client, getContractEvents, readContract } = createReaderClient({
      nextAuctionId: 4n,
      logs: [auctionCreatedLog(1n, 10n), auctionCreatedLog(3n, 30n), auctionCreatedLog(2n, 20n)]
    });

    const payload = await readAllAuctions({
      deployment: localDeploymentFixture,
      client,
      limit: 2
    });

    expect(getContractEvents).toHaveBeenCalledTimes(1);
    expect(payload.discovery.strategy).toBe("events");
    expect(payload.discovery.limit).toBe(2);
    expect(payload.auctions.map((auction) => auction.auctionId)).toEqual(["3", "2"]);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getAuction",
        args: [3n]
      })
    );
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getAuction",
        args: [2n]
      })
    );
    expect(payload.auctions[0].nftMetadata?.status).toBe("unavailable");
  });

  it("falls back to bounded nextAuctionId discovery when event scanning fails", async () => {
    const { client } = createReaderClient({
      nextAuctionId: 5n,
      logsError: new Error("logs unavailable")
    });

    const payload = await readAllAuctions({
      deployment: localDeploymentFixture,
      client,
      limit: 2
    });

    expect(payload.discovery.strategy).toBe("nextAuctionIdFallback");
    expect(payload.discovery.warning).toContain("AuctionCreated event scan failed");
    expect(payload.auctions.map((auction) => auction.auctionId)).toEqual(["4", "3"]);
  });

  it("returns an empty event-discovered list when no auction exists", async () => {
    const { client } = createReaderClient({
      nextAuctionId: 1n,
      logs: []
    });

    const payload = await readAllAuctions({
      deployment: localDeploymentFixture,
      client,
      limit: 10
    });

    expect(payload.discovery.strategy).toBe("events");
    expect(payload.count).toBe(0);
    expect(payload.auctions).toEqual([]);
  });

  it("keeps read-only auction loading available when metadata fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("not-json", {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        })
      )
    );

    const { client } = createReaderClient({
      nextAuctionId: 2n,
      tokenUri: "https://metadata.example/bad.json"
    });

    const auctions = await readAuctionsByIds([1n], {
      client,
      deployment: localDeploymentFixture,
      includeNftMetadata: true
    });

    expect(auctions).toHaveLength(1);
    expect(auctions[0].auctionId).toBe("1");
    expect(auctions[0].nftMetadata?.status).toBe("fetch-failed");
    expect(auctions[0].nftMetadata?.collectionName).toBe("BidBack Demo");
  });

  it("normalizes auction list limits", () => {
    expect(normalizeAuctionListLimit(undefined)).toBe(25);
    expect(normalizeAuctionListLimit("0")).toBe(25);
    expect(normalizeAuctionListLimit("abc")).toBe(25);
    expect(normalizeAuctionListLimit("5")).toBe(5);
    expect(normalizeAuctionListLimit(500)).toBe(100);
  });
});
