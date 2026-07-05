import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  discoverCreatedAuctionIds,
  discoverWalletActivityAuctionIds,
  normalizeWalletActivityEventLimit
} from "@/lib/server/auctionEventReader";
import { localDeploymentFixture, testAddresses } from "@/test/fixtures";

type MockEventRequest = {
  eventName: string;
  args?: Record<string, unknown>;
};

type MockEventLog = {
  args: {
    auctionId: bigint;
  };
  blockNumber: bigint;
  logIndex: number;
};

function eventLog(auctionId: bigint, blockNumber: bigint, logIndex = 0): MockEventLog {
  return {
    args: {
      auctionId
    },
    blockNumber,
    logIndex
  };
}

function mockClient(handler: (request: MockEventRequest) => MockEventLog[] | Promise<MockEventLog[]>): PublicClient {
  return {
    getContractEvents: vi.fn(async (request: MockEventRequest) => handler(request))
  } as unknown as PublicClient;
}

describe("auctionEventReader", () => {
  it("normalizes wallet activity limits", () => {
    expect(normalizeWalletActivityEventLimit(undefined)).toBe(100);
    expect(normalizeWalletActivityEventLimit("10")).toBe(10);
    expect(normalizeWalletActivityEventLimit("9999")).toBe(500);
    expect(normalizeWalletActivityEventLimit("nope")).toBe(100);
  });

  it("discovers created auction IDs newest-first from AuctionCreated", async () => {
    const client = mockClient(() => [eventLog(1n, 10n), eventLog(2n, 12n), eventLog(1n, 11n)]);

    const ids = await discoverCreatedAuctionIds({
      client,
      deployment: localDeploymentFixture,
      nextAuctionId: 4n,
      limit: 10
    });

    expect(ids.map((id) => id.toString())).toEqual(["2", "1"]);
  });

  it("uses wallet-scoped AuctionHouse events when available", async () => {
    const client = mockClient(({ eventName, args }) => {
      if (eventName === "AuctionCreated" && args?.seller === testAddresses.primaryBidder) {
        return [eventLog(5n, 50n)];
      }

      if (eventName === "BidPlaced" && args?.bidder === testAddresses.primaryBidder) {
        return [eventLog(3n, 30n), eventLog(5n, 55n)];
      }

      return [];
    });

    const result = await discoverWalletActivityAuctionIds({
      client,
      deployment: localDeploymentFixture,
      nextAuctionId: 8n,
      wallet: testAddresses.primaryBidder,
      limit: 10,
      requestedLimit: 10
    });

    expect(result.discovery.strategy).toBe("event-scoped");
    expect(result.ids.map((id) => id.toString())).toEqual(["5", "3"]);
  });

  it("uses a general AuctionCreated window when no wallet-scoped events exist", async () => {
    const client = mockClient(({ eventName, args }) => {
      if (eventName === "AuctionCreated" && !args) {
        return [eventLog(4n, 40n), eventLog(2n, 20n)];
      }

      return [];
    });

    const result = await discoverWalletActivityAuctionIds({
      client,
      deployment: localDeploymentFixture,
      nextAuctionId: 6n,
      wallet: testAddresses.feeRecipient,
      limit: 10,
      requestedLimit: 10
    });

    expect(result.discovery.strategy).toBe("general-event-window");
    expect(result.discovery.warning).toMatch(/No wallet-scoped AuctionHouse events/);
    expect(result.ids.map((id) => id.toString())).toEqual(["4", "2"]);
  });

  it("falls back to a bounded nextAuctionId window when event reads fail", async () => {
    const client = mockClient(() => {
      throw new Error("RPC event failure");
    });

    const result = await discoverWalletActivityAuctionIds({
      client,
      deployment: localDeploymentFixture,
      nextAuctionId: 6n,
      wallet: testAddresses.primaryBidder,
      limit: 2,
      requestedLimit: 2
    });

    expect(result.discovery.strategy).toBe("bounded-fallback");
    expect(result.discovery.warning).toMatch(/RPC event failure/);
    expect(result.ids.map((id) => id.toString())).toEqual(["5", "4"]);
  });

  it("applies the discovery limit to wallet-scoped results", async () => {
    const client = mockClient(({ eventName, args }) => {
      if (eventName === "BidPlaced" && args?.bidder === testAddresses.primaryBidder) {
        return [eventLog(1n, 10n), eventLog(2n, 20n), eventLog(3n, 30n)];
      }

      return [];
    });

    const result = await discoverWalletActivityAuctionIds({
      client,
      deployment: localDeploymentFixture,
      nextAuctionId: 5n,
      wallet: testAddresses.primaryBidder,
      limit: 2,
      requestedLimit: 2
    });

    expect(result.discovery.strategy).toBe("event-scoped");
    expect(result.discovery.warning).toMatch(/limited to 2/);
    expect(result.ids.map((id) => id.toString())).toEqual(["3", "2"]);
  });
});
