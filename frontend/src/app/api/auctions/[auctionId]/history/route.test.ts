// @vitest-environment node
import type { PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { AuctionNotFoundError } from "@/lib/server/auctionReader";
import { auctionDetailFixture, localDeploymentFixture, testAddresses } from "@/test/fixtures";

const mocks = vi.hoisted(() => ({ deployment: vi.fn(), detail: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/server/auctionReader", () => ({
  AuctionNotFoundError: class AuctionNotFoundError extends Error {},
  readTargetDeployment: mocks.deployment,
  readAuctionById: mocks.detail,
  createTargetPublicClient: mocks.client,
  parseAuctionId: (value: string) => /^[1-9][0-9]*$/.test(value) ? BigInt(value) : null
}));

function clientFixture(count = 205n, failAt?: bigint) {
  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args: readonly bigint[] }) => {
      if (functionName === "getBidCount") return count;
      if (args[1] === failAt) throw new Error("https://FAKE_CREDENTIAL@example.invalid/internal-RPC-details");
      return { bidder: testAddresses.primaryBidder, amount: args[1] + 1n, timestamp: 100n };
    }),
    getContractEvents: vi.fn(async () => []),
    getBlock: vi.fn()
  } as unknown as PublicClient;
}

async function request(query = "", auctionId = "1") {
  return GET(new Request(`https://bidback.example/api/auctions/${auctionId}/history${query}`), { params: Promise.resolve({ auctionId }) });
}

beforeEach(() => {
  mocks.deployment.mockResolvedValue(localDeploymentFixture);
  mocks.detail.mockResolvedValue(auctionDetailFixture);
  mocks.client.mockReturnValue(clientFixture());
});

describe("auction history pagination API", () => {
  it("returns a compatible initial response with decimal pagination metadata", async () => {
    const response = await request();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ chainId: localDeploymentFixture.chainId, auctionId: "1", history: {
      totalBidCount: "205", returnedBidCount: 200, hasMoreBids: true, nextBefore: "5", bidsAvailable: true
    } });
    expect(payload.history.bids[0].index).toBe("5");
    expect(payload.history.bids.at(-1).index).toBe("204");
  });

  it("reads only an earlier canonical page without event or block scans", async () => {
    const client = clientFixture();
    mocks.client.mockReturnValue(client);
    const response = await request("?before=5");
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.history).toMatchObject({ totalBidCount: "205", returnedBidCount: 5, hasMoreBids: false, nextBefore: null });
    expect(payload.history.bids.map((bid: { index: string }) => bid.index)).toEqual(["0", "1", "2", "3", "4"]);
    expect(client.getContractEvents).not.toHaveBeenCalled();
    expect(client.getBlock).not.toHaveBeenCalled();
    expect(client.readContract).toHaveBeenCalledTimes(6);
  });

  it.each(["?before=", "?before=-1", "?before=%2B1", "?before=01", "?before=1.5", "?before=1e2", "?before=0x10", "?before=%201", "?before=1%20", "?before=1&before=2", `?before=${1n << 256n}`])("rejects invalid or duplicate cursors before any RPC read: %s", async (query) => {
    const response = await request(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid bid history cursor" });
    expect(mocks.deployment).not.toHaveBeenCalled();
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("rejects a well-formed cursor outside the current canonical count", async () => {
    const response = await request("?before=206");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid bid history cursor" });
  });

  it("returns an empty terminal page for an exclusive zero cursor", async () => {
    const response = await request("?before=0");
    expect(response.status).toBe(200);
    expect((await response.json()).history).toMatchObject({ bids: [], returnedBidCount: 0, nextBefore: null, hasMoreBids: false });
  });

  it("returns a controlled 503 for a failed earlier page without internal diagnostics", async () => {
    mocks.client.mockReturnValue(clientFixture(205n, 2n));
    const response = await request("?before=5");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Unable to read auction history" });
  });

  it("preserves initial partial responses while marking failed canonical reads explicitly", async () => {
    mocks.client.mockReturnValue(clientFixture(205n, 6n));
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).history).toMatchObject({ bids: [], bidsAvailable: false, totalBidCount: "205", nextBefore: null, partial: true });
  });

  it("preserves missing auction and invalid auction ID behavior", async () => {
    expect((await request("", "bad")).status).toBe(404);
    mocks.detail.mockRejectedValueOnce(new AuctionNotFoundError("Missing"));
    const response = await request("?before=5");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Auction not found" });
  });

  it("sanitizes failures from the existing auction-detail read", async () => {
    mocks.detail.mockRejectedValueOnce(new Error("FAKE_RPC_AUTH_INTERNAL"));
    const response = await request("?before=5");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Unable to read auction history" });
  });
});
