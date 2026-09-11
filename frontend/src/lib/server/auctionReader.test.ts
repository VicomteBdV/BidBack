import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { readAllAuctions, readAuctionsByIds, normalizeAuctionListLimit, readAuctionSettlementReadiness } from "@/lib/server/auctionReader";
import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import { filterAndSortAuctions } from "@/lib/auctionFilters";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { auctionDetailFixture, localDeploymentFixture, testAddresses } from "@/test/fixtures";

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
  tokenUri,
  blockTimestamp = 1_780_000_100n
}: {
  nextAuctionId: bigint;
  logs?: ReturnType<typeof auctionCreatedLog>[];
  logsError?: Error;
  tokenUri?: string;
  blockTimestamp?: bigint;
}) {
  const readContract = vi.fn(async (request: unknown): Promise<unknown> => {
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
  const getBlock = vi.fn(async () => ({ timestamp: blockTimestamp, number: 42n }));

  return {
    client: {
      readContract,
      getContractEvents,
      getBlock
    } as unknown as PublicClient,
    readContract,
    getContractEvents,
    getBlock
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
    const { client, getBlock } = createReaderClient({
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
    expect(getBlock).not.toHaveBeenCalled();
  });

  it("shares one latest block timestamp across an auction snapshot", async () => {
    const { client, getBlock } = createReaderClient({
      nextAuctionId: 3n,
      blockTimestamp: 1_780_000_321n
    });

    const auctions = await readAuctionsByIds([1n, 2n], {
      client,
      deployment: localDeploymentFixture
    });

    expect(getBlock).toHaveBeenCalledTimes(1);
    expect(getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
    expect(auctions.map((auction) => auction.chainTimestamp)).toEqual(["1780000321", "1780000321"]);
  });

  it("keeps read-only auction loading available when metadata fetch fails", async () => {
    const { client } = createReaderClient({
      nextAuctionId: 2n,
      tokenUri: "http://127.0.0.1/private-metadata"
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


const thirdBidder = "0x0000000000000000000000000000000000002005" as const;
const fourthBidder = "0x0000000000000000000000000000000000002006" as const;

function settlementReader({
  participants = [testAddresses.primaryBidder, testAddresses.secondBidder, thirdBidder, fourthBidder] as readonly `0x${string}`[],
  thirdRefundClaimed = false, assigned = 100n, claimed = 100n,
  fail = "", sellerCredit = 0n, noBids = false
} = {}) {
  const auction: SerializedAuction = { ...auctionDetailFixture.auction, state: 2, finalized: true,
    nftClaimed: true, participantCount: noBids ? "0" : "4", readBlockNumber: "42",
    highestBid: noBids ? "0" : auctionDetailFixture.auction.highestBid,
    highestBidder: noBids ? "0x0000000000000000000000000000000000000000" : testAddresses.secondBidder,
    economics: undefined };
  const readContract = vi.fn(async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
    if (fail === functionName || fail === "all" || (fail === "thirdRefund" && functionName === "refundClaimed" && args[1] === thirdBidder)) {
      throw new Error("Economic RPC read unavailable");
    }
    if (functionName === "getParticipants") return noBids ? [] : participants;
    if (functionName === "settlements") return { finalized: !noBids };
    if (functionName === "distributions") return { opened: !noBids, totalAssigned: noBids ? 0n : assigned, totalClaimed: noBids ? 0n : claimed };
    if (functionName === "sellerCredits") return sellerCredit;
    if (functionName === "protocolFeeCredits") return 0n;
    if (functionName === "refundableAmount") return args[1] === testAddresses.secondBidder ? 0n : 1000n;
    if (functionName === "refundClaimed") return args[1] !== thirdBidder || thirdRefundClaimed;
    throw new Error(`Unexpected read ${functionName}`);
  });
  return { auction, readContract, client: { readContract } as unknown as PublicClient };
}

function catalogSettlementReader({
  count = 1,
  openIds = [] as bigint[],
  ...settlementOptions
}: NonNullable<Parameters<typeof settlementReader>[0]> & { count?: number; openIds?: bigint[] } = {}) {
  const reader = createReaderClient({
    nextAuctionId: BigInt(count + 1),
    logs: Array.from({ length: count }, (_, index) => auctionCreatedLog(BigInt(index + 1), 40n, index))
  });
  const baseRead = reader.readContract.getMockImplementation()!;
  const economicReader = settlementReader({ thirdRefundClaimed: true, ...settlementOptions });
  reader.readContract.mockImplementation(async (request: unknown) => {
    const { functionName, args = [] } = request as { functionName: string; args?: readonly unknown[] };
    if (functionName === "getAuction") {
      const id = args[0] as bigint;
      const tuple = auctionTuple(id);
      if (!openIds.includes(id)) {
        tuple[8] = 2;
        tuple[9] = settlementOptions.noBids ? tuple[9] : testAddresses.secondBidder;
        tuple[10] = settlementOptions.noBids ? 0n : 1_200_000_000_000_000_000n;
        tuple[11] = settlementOptions.noBids ? 0n : BigInt(settlementOptions.participants?.length ?? 4);
        tuple[12] = tuple[11];
        tuple[13] = true;
      }
      return tuple;
    }
    if (["nextAuctionId", "name", "symbol", "tokenURI"].includes(functionName)) return baseRead(request);
    if (functionName === "getAuctionFeeRecipient") {
      if (settlementOptions.fail === functionName || settlementOptions.fail === "all") {
        throw new Error("Auction fee recipient snapshot unavailable");
      }
      return testAddresses.feeRecipient;
    }
    return economicReader.readContract({ functionName, args });
  });
  return reader;
}

function filterCatalog(auctions: SerializedAuction[], status: "settled" | "finalized") {
  return filterAndSortAuctions(auctions, { status, query: "", sort: "newest" }).map((auction) => auction.auctionId);
}

describe("catalog settlement evidence through discovery and filtering", () => {
  it.each([false, true])("preserves settlement evidence when metadata is rejected (refund claimed: %s)", async (thirdRefundClaimed) => {
    const { client, readContract } = catalogSettlementReader({ thirdRefundClaimed });
    const before = await readAllAuctions({ client, deployment: localDeploymentFixture });
    const read = readContract.getMockImplementation()!;
    readContract.mockImplementation(async (request: unknown) => {
      if ((request as { functionName: string }).functionName === "tokenURI") return "http://169.254.169.254/private";
      return read(request);
    });
    const after = await readAllAuctions({ client, deployment: localDeploymentFixture });
    expect(after.auctions[0].nftMetadata?.status).toBe("fetch-failed");
    const { nftMetadata: _beforeMetadata, ...beforeAuction } = before.auctions[0];
    const { nftMetadata: _afterMetadata, ...afterAuction } = after.auctions[0];
    expect(afterAuction).toEqual(beforeAuction);
    expect(afterAuction.settlementReadiness?.status).toBe("complete");
    expect(afterAuction.settlementReadiness?.refunds).toEqual({ status: "known", value: thirdRefundClaimed ? "0" : "1000" });
    expect(getAuctionLifecycle(after.auctions[0])).toEqual(getAuctionLifecycle(before.auctions[0]));
    expect(filterCatalog(after.auctions, "settled")).toEqual(thirdRefundClaimed ? ["1"] : []);
  });

  it("includes a claimed NFT with complete evidence and zero outstanding balances", async () => {
    const { client, readContract } = catalogSettlementReader();
    const payload = await readAllAuctions({ client, deployment: localDeploymentFixture });

    expect(filterCatalog(payload.auctions, "settled")).toEqual(["1"]);
    expect(payload.auctions[0].settlementReadiness).toMatchObject({ status: "complete", participantsRead: 4 });
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "protocolFeeCredits", args: [testAddresses.feeRecipient], blockNumber: 42n
    }));
    const unpinnedFunctions = ["nextAuctionId", "name", "symbol", "tokenURI"];
    for (const [request] of readContract.mock.calls) {
      const { functionName } = request as { functionName: string };
      if (!unpinnedFunctions.includes(functionName)) expect(request).toHaveProperty("blockNumber", 42n);
    }
    for (const functionName of ["feeRecipient", "getAuctionParams", "capOf", "entitlementOf", "claimed"]) {
      expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName }));
    }
    expect(payload.auctions[0].economics).toBeUndefined();
  });

  it("excludes an auction when a third participant still has a refund", async () => {
    const { client, readContract } = catalogSettlementReader({ thirdRefundClaimed: false });
    const payload = await readAllAuctions({ client, deployment: localDeploymentFixture });

    expect(filterCatalog(payload.auctions, "settled")).toEqual([]);
    expect(filterCatalog(payload.auctions, "finalized")).toEqual(["1"]);
    expect(payload.auctions[0].settlementReadiness?.refunds).toEqual({ status: "known", value: "1000" });
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "refundableAmount", args: [1n, thirdBidder]
    }));
  });

  it.each([
    ["thirdRefund", "refunds"],
    ["distributions", "redistribution"],
    ["sellerCredits", "sellerWalletCredit"],
    ["protocolFeeCredits", "protocolWalletCredit"],
    ["getAuctionFeeRecipient", "protocolWalletCredit"]
  ] as const)("keeps %s failures unknown and visible in finalized", async (fail, field) => {
    const { client, readContract } = catalogSettlementReader({ fail });
    const payload = await readAllAuctions({ client, deployment: localDeploymentFixture });

    expect(filterCatalog(payload.auctions, "settled")).toEqual([]);
    expect(filterCatalog(payload.auctions, "finalized")).toEqual(["1"]);
    expect(payload.auctions[0].settlementReadiness?.status).toBe("partial");
    expect(payload.auctions[0].settlementReadiness?.[field]).toEqual({ status: "unavailable" });
    if (fail === "getAuctionFeeRecipient") {
      expect(payload.auctions[0].auctionFeeRecipientError).toContain("snapshot unavailable");
      expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "protocolFeeCredits" }));
      expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "feeRecipient" }));
    }
  });

  it("retains a fully unavailable auction without treating balances as zero", async () => {
    const { client } = catalogSettlementReader({ fail: "all" });
    const payload = await readAllAuctions({ client, deployment: localDeploymentFixture });
    expect(payload.auctions[0].settlementReadiness?.status).toBe("unavailable");
    expect(filterCatalog(payload.auctions, "settled")).toEqual([]);
    expect(filterCatalog(payload.auctions, "finalized")).toEqual(["1"]);
  });

  it.each([0n, 123n])("isolates an economic failure and preserves a known seller credit of %s", async (sellerCredit) => {
    const { client, readContract } = catalogSettlementReader({ count: 2, sellerCredit });
    const read = readContract.getMockImplementation()!;
    readContract.mockImplementation(async (request: unknown) => {
      const { functionName, args } = request as { functionName: string; args?: readonly unknown[] };
      if (functionName === "distributions" && args?.[0] === 1n) throw new Error("Isolated RPC failure");
      return read(request);
    });
    const payload = await readAllAuctions({ client, deployment: localDeploymentFixture });
    expect(filterCatalog(payload.auctions, "finalized")).toEqual(["2", "1"]);
    expect(filterCatalog(payload.auctions, "settled")).toEqual(sellerCredit === 0n ? ["2"] : []);
    expect(payload.auctions.map((auction) => auction.settlementReadiness?.status)).toEqual(["complete", "partial"]);
    expect(payload.auctions[1].settlementReadiness?.sellerWalletCredit).toEqual({ status: "known", value: sellerCredit.toString() });
  });

  it("includes a fully settled auction without bids or opened ETH settlement", async () => {
    const { client, readContract } = catalogSettlementReader({ noBids: true });
    const payload = await readAllAuctions({ client, deployment: localDeploymentFixture });
    expect(filterCatalog(payload.auctions, "settled")).toEqual(["1"]);
    expect(payload.auctions[0].settlementReadiness).toMatchObject({ status: "complete", participantsRead: 0 });
    expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "refundableAmount" }));
  });

  it("skips settlement reads for open auctions and the base detail snapshot", async () => {
    const { client, readContract } = catalogSettlementReader({ count: 2, openIds: [1n, 2n] });
    const payload = await readAllAuctions({ client, deployment: localDeploymentFixture });
    expect(payload.auctions.every((auction) => auction.settlementReadiness === undefined)).toBe(true);
    expect(readContract.mock.calls.every(([request]) =>
      ["nextAuctionId", "getAuction", "name", "symbol", "tokenURI"].includes((request as { functionName: string }).functionName)
    )).toBe(true);

    const detailReader = catalogSettlementReader();
    const [auction] = await readAuctionsByIds([1n], { client: detailReader.client, deployment: localDeploymentFixture });
    expect(auction.finalized).toBe(true);
    expect(auction.settlementReadiness).toBeUndefined();
    expect(detailReader.readContract).toHaveBeenCalledTimes(1);
  });

  it("bounds extra concurrent reads while preserving discovery and participant ceilings", async () => {
    const participants = Array.from({ length: 24 }, (_, index) =>
      `0x${(3000 + index).toString(16).padStart(40, "0")}` as `0x${string}`);
    const { client, readContract } = catalogSettlementReader({ count: 6, participants });
    const read = readContract.getMockImplementation()!;
    let active = 0;
    let peak = 0;
    readContract.mockImplementation(async (request: unknown) => {
      const { functionName } = request as { functionName: string };
      if (["nextAuctionId", "getAuction", "name", "symbol", "tokenURI"].includes(functionName)) return read(request);
      active += 1;
      peak = Math.max(peak, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return await read(request);
      } finally {
        active -= 1;
      }
    });
    const payload = await readAllAuctions({ client, deployment: localDeploymentFixture, limit: 5 });
    expect(filterCatalog(payload.auctions, "settled")).toEqual(["6", "5", "4", "3", "2"]);
    // Two auctions, each with four refund pairs and at most three other economic reads.
    expect(peak).toBeLessThanOrEqual(22);
    expect(peak).toBeGreaterThan(1);
    expect(active).toBe(0);
    expect(readContract.mock.calls.filter(([request]) => (request as { functionName: string }).functionName === "getAuctionFeeRecipient")).toHaveLength(5);

    const oversized = catalogSettlementReader({ participants: Array.from({ length: 257 }, (_, index) =>
      `0x${(3000 + index).toString(16).padStart(40, "0")}` as `0x${string}`) });
    const rejected = await readAllAuctions({ client: oversized.client, deployment: localDeploymentFixture });
    expect(filterCatalog(rejected.auctions, "settled")).toEqual([]);
    expect(rejected.auctions[0].settlementReadiness?.refunds.status).toBe("unavailable");
    expect(oversized.readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "refundableAmount" }));
  });
});

describe("complete settlement reads", () => {
  it("finds a third wallet refund after the first two wallets have finished", async () => {
    const { auction, client, readContract } = settlementReader();
    auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
    expect(auction.settlementReadiness).toMatchObject({ status: "complete", participantsRead: 4,
      refunds: { status: "known", value: "1000" } });
    expect(getAuctionLifecycle(auction).hasRefund).toBe(true);
    expect(getAuctionLifecycle(auction).statusLabel).not.toBe("Settled");
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "refundableAmount", args: [1n, thirdBidder] }));
    for (const [request] of readContract.mock.calls) expect(request).toHaveProperty("blockNumber", 42n);
  });

  it("keeps redistribution due after all refunds have been claimed", async () => {
    const { auction, client } = settlementReader({ thirdRefundClaimed: true, claimed: 50n });
    auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
    expect(auction.settlementReadiness.redistribution).toEqual({ status: "known", value: "50" });
    expect(getAuctionLifecycle(auction).hasReward).toBe(true);
    expect(getAuctionLifecycle(auction).statusLabel).not.toBe("Settled");
  });

  it.each(["all", "thirdRefund", "getParticipants", "distributions", "sellerCredits", "protocolFeeCredits", "settlements"])(
    "never settles after a failed %s read", async (fail) => {
      const { auction, client } = settlementReader({ thirdRefundClaimed: true, fail });
      auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
      expect(auction.settlementReadiness.status).not.toBe("complete");
      expect(auction.settlementReadiness.warnings.length).toBeGreaterThan(0);
      expect(getAuctionLifecycle(auction).statusLabel).not.toBe("Settled");
    }
  );

  it.each<{ participants: readonly `0x${string}`[] }>([
    { participants: [testAddresses.primaryBidder, testAddresses.secondBidder] },
    { participants: [testAddresses.primaryBidder, testAddresses.secondBidder, thirdBidder, thirdBidder] },
    { participants: Array.from({ length: 257 }, () => thirdBidder) }
  ])("rejects partial, duplicate or oversized participant lists", async ({ participants }) => {
    const { auction, client, readContract } = settlementReader({ participants });
    auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
    expect(auction.settlementReadiness.refunds.status).toBe("unavailable");
    expect(getAuctionLifecycle(auction).statusLabel).not.toBe("Settled");
    expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "refundableAmount" }));
  });

  it("settles only when every participant and distribution is cleared and aggregate credits are zero", async () => {
    const { auction, client } = settlementReader({ thirdRefundClaimed: true });
    auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
    expect(getAuctionLifecycle(auction).statusLabel).toBe("Settled");
  });

  it("handles no bids without requiring an opened ETH settlement or distribution", async () => {
    const { auction, client } = settlementReader({ noBids: true });
    auction.nftClaimed = false;
    auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
    expect(auction.settlementReadiness.status).toBe("complete");
    expect(getAuctionLifecycle(auction).nftClaimantAddress).toBe(testAddresses.seller);
    expect(getAuctionLifecycle(auction).hasClaimableNft).toBe(true);
    auction.nftClaimed = true;
    expect(getAuctionLifecycle(auction).statusLabel).toBe("Settled");
  });

  it("keeps a global seller credit distinct from the auction's cleared claims", async () => {
    const { auction, client } = settlementReader({ thirdRefundClaimed: true, sellerCredit: 123n });
    auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
    const lifecycle = getAuctionLifecycle(auction);
    expect(lifecycle.statusLabel).not.toBe("Settled");
    expect(lifecycle.nextActionReason).toContain("aggregate wallet balances across auctions");
  });

  it("does not substitute the current fee recipient when the auction recipient is unknown", async () => {
    const { auction, client, readContract } = settlementReader({ thirdRefundClaimed: true });
    auction.auctionFeeRecipient = undefined;
    auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
    expect(auction.settlementReadiness.protocolWalletCredit.status).toBe("unavailable");
    expect(getAuctionLifecycle(auction).statusLabel).not.toBe("Settled");
    expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "protocolFeeCredits" }));
  });

  it("rejects inconsistent assigned and claimed totals", async () => {
    const { auction, client } = settlementReader({ thirdRefundClaimed: true, claimed: 101n });
    auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
    expect(auction.settlementReadiness.redistribution.status).toBe("unavailable");
    expect(getAuctionLifecycle(auction).statusLabel).not.toBe("Settled");
  });
  it("does not infer completion without a block for the economic snapshot", async () => {
    const { auction, client, readContract } = settlementReader({ thirdRefundClaimed: true });
    auction.readBlockNumber = undefined;
    auction.settlementReadiness = await readAuctionSettlementReadiness(auction, localDeploymentFixture, client);
    expect(auction.settlementReadiness.status).toBe("unavailable");
    expect(getAuctionLifecycle(auction).statusLabel).not.toBe("Settled");
    expect(readContract).not.toHaveBeenCalled();
  });

});
