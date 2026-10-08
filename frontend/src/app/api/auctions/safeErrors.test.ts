// @vitest-environment node
import { BaseError, HttpRequestError, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listGET } from "./route";
import { GET as detailGET } from "./[auctionId]/route";
import { GET as historyGET } from "./[auctionId]/history/route";
import { AuctionNotFoundError } from "@/lib/server/auctionReader";
import { auctionDetailFixture, localDeploymentFixture, testAddresses } from "@/test/fixtures";

const mocks = vi.hoisted(() => {
  // Import-time server configuration is synthetic, and detail reads use a public
  // target fixture so the reader never consults local wallet key configuration.
  vi.stubEnv("ANVIL_RPC_URL", "http://rpc.example.invalid");
  vi.stubEnv("BIDBACK_RPC_URL", "http://rpc.example.invalid");
  vi.stubEnv("BIDBACK_CHAIN_ID", "84532");
  return {
    list: vi.fn(), detail: vi.fn(), history: vi.fn(), deployment: vi.fn(),
    createPublicClient: vi.fn(), access: vi.fn(), readFile: vi.fn(), metadata: vi.fn()
  };
});

vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: mocks.createPublicClient
}));
vi.mock("node:fs/promises", () => ({ access: mocks.access, readFile: mocks.readFile }));
vi.mock("@/lib/server/nftMetadataReader", () => ({ readNftMetadata: mocks.metadata }));
vi.mock("@/lib/server/auctionReader", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/auctionReader")>(),
  readAllAuctions: mocks.list,
  readAuctionById: mocks.detail,
  readTargetDeployment: mocks.deployment
}));
vi.mock("@/lib/server/auctionHistoryReader", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/auctionHistoryReader")>(),
  readAuctionHistory: mocks.history
}));

const realReader = await vi.importActual<typeof import("@/lib/server/auctionReader")>("@/lib/server/auctionReader");
const realHistory = await vi.importActual<typeof import("@/lib/server/auctionHistoryReader")>("@/lib/server/auctionHistoryReader");
const deployment = { ...localDeploymentFixture, chainId: 84532 };
const fakeRpcUrl = "https://FAKE_USER_G1:FAKE_PASSWORD_G1@rpc.example.invalid/private-path/FAKE_SECRET_G1?apiKey=FAKE_QUERY_SECRET_G1";
const forbidden = ["rpc.example.invalid", "private-path", "FAKE_USER_G1", "FAKE_PASSWORD_G1", "FAKE_SECRET_G1", "FAKE_QUERY_SECRET_G1"];

function rpcError() {
  return new HttpRequestError({
    url: fakeRpcUrl,
    status: 503,
    details: `RPC unavailable at ${fakeRpcUrl}`,
    cause: new Error(`Network failed at ${fakeRpcUrl}`)
  });
}

const failures = [
  { label: "ordinary exception", create: () => new Error(`Unavailable ${fakeRpcUrl}`) },
  { label: "viem HTTP exception", create: rpcError },
  { label: "viem shortMessage and nested cause", create: () => new BaseError(`Read failed at ${fakeRpcUrl}`, { cause: rpcError() }) },
  { label: "nested viem details", create: () => new BaseError("Read failed", { cause: rpcError() }) },
  { label: "non-Error diagnostic object", create: () => ({ message: fakeRpcUrl, shortMessage: fakeRpcUrl, details: fakeRpcUrl, cause: rpcError() }) }
];

function expectSafe(body: unknown) {
  const serialized = JSON.stringify(body);
  for (const marker of forbidden) expect(serialized).not.toContain(marker);
}

type ContractRequest = { functionName: string; args?: readonly unknown[] };
type EventRequest = { eventName: string };
type ReaderOptions = {
  finalized?: boolean;
  nextAuctionId?: bigint;
  fail?: string;
  error?: unknown;
  overrides?: Record<string, unknown>;
  eventFailure?: boolean;
  blockFailure?: boolean;
  eventLogs?: Record<string, unknown[]>;
};

function readerClient({
  finalized = true, nextAuctionId = 2n, fail, error = rpcError(), overrides = {},
  eventFailure = false, blockFailure = false, eventLogs = {}
}: ReaderOptions = {}) {
  const auction = auctionDetailFixture.auction;
  const readContract = vi.fn(async ({ functionName, args = [] }: ContractRequest) => {
    if (functionName === fail) throw error;
    if (Object.hasOwn(overrides, functionName)) return overrides[functionName];
    switch (functionName) {
      case "nextAuctionId": return nextAuctionId;
      case "getAuction": return {
        ...auction, tokenId: BigInt(auction.tokenId), startPrice: BigInt(auction.startPrice),
        startTime: BigInt(auction.startTime), initialEndTime: BigInt(auction.initialEndTime), endTime: BigInt(auction.endTime),
        highestBid: BigInt(auction.highestBid), participantCount: 2n, bidCount: 2n,
        state: finalized ? 2 : 0
      };
      case "getAuctionParams": return Object.fromEntries(Object.entries(auction.paramsSnapshot).map(([key, value]) => [key, BigInt(value)]));
      case "getAuctionFeeRecipient":
      case "feeRecipient": return testAddresses.feeRecipient;
      case "getParticipants": return [testAddresses.primaryBidder, testAddresses.secondBidder];
      case "settlements": return { ...auction.economics.settlement, finalized,
        finalPrice: finalized ? BigInt(auction.highestBid) : 0n, sellerProceeds: 1_180_000_000_000_000_000n,
        feeAmount: 10_000_000_000_000_000n, distributionReserve: 10_000_000_000_000_000n };
      case "distributions": return { opened: finalized, totalAssigned: 100n, totalClaimed: 0n };
      case "capOf": return 1_200_000_000_000_000_000n;
      case "refundableAmount": return args[1] === testAddresses.primaryBidder ? 1_000_000_000_000_000_000n : 0n;
      case "entitlementOf": return 50n;
      case "refundClaimed":
      case "claimed": return false;
      case "sellerCredits": return 123n;
      case "protocolFeeCredits": return 456n;
      case "getBidCount": return 1n;
      case "getBid": return { bidder: testAddresses.primaryBidder, amount: 1_000_000_000_000_000_000n, timestamp: 1780000100n };
      default: throw new Error(`Unexpected synthetic contract read: ${functionName}`);
    }
  });
  const client = {
    readContract,
    getContractEvents: vi.fn(async ({ eventName }: EventRequest) => {
      if (eventFailure) throw error;
      return eventLogs[eventName] ?? (eventName === "AuctionCreated" ? [{ args: { auctionId: 1n }, blockNumber: 40n, logIndex: 0 }] : []);
    }),
    getBlock: vi.fn(async (request: { blockNumber?: bigint }) => {
      if (blockFailure && request.blockNumber !== undefined) throw error;
      return { number: 42n, timestamp: 1780000100n };
    })
  } as unknown as PublicClient;
  mocks.createPublicClient.mockReturnValue(client);
  return { client, readContract };
}

async function request(endpoint: "list" | "detail" | "history", auctionId = "1") {
  const url = new Request(`https://bidback.example.invalid/api/auctions${endpoint === "list" ? "?limit=2" : `/${encodeURIComponent(auctionId)}${endpoint === "history" ? "/history" : ""}`}`);
  const context = { params: Promise.resolve({ auctionId }) };
  const response = endpoint === "list" ? await listGET(url)
    : endpoint === "detail" ? await detailGET(url, context) : await historyGET(url, context);
  const body: any = await response.json();
  expectSafe(body);
  return { response, body };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(undefined);
  mocks.readFile.mockResolvedValue(JSON.stringify(deployment));
  mocks.metadata.mockResolvedValue(auctionDetailFixture.auction.nftMetadata);
  mocks.deployment.mockResolvedValue(deployment);
  mocks.list.mockImplementation(realReader.readAllAuctions);
  mocks.detail.mockImplementation(realReader.readAuctionById);
  mocks.history.mockImplementation(realHistory.readAuctionHistory);
  readerClient();
});

describe("auction GET public diagnostics", () => {
  it("uses genuine viem error fields and nested causes for the regression fixtures", () => {
    const error = rpcError();
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error.message).toContain(fakeRpcUrl);
    expect(error.details).toContain(fakeRpcUrl);
    const wrapped = failures[2].create() as BaseError;
    expect(wrapped.shortMessage).toContain(fakeRpcUrl);
    expect(wrapped.cause).toBeInstanceOf(HttpRequestError);
  });

  for (const endpoint of ["list", "detail", "history"] as const) {
    it.each(failures)(`returns a safe 503 for ${endpoint}: $label`, async ({ create }) => {
      const reader = endpoint === "list" ? mocks.list : endpoint === "detail" ? mocks.detail : mocks.history;
      reader.mockRejectedValueOnce(create());
      const { response, body } = await request(endpoint);
      expect(response.status).toBe(503);
      expect(body).toEqual({ error: endpoint === "list" ? "Unable to read auctions" : endpoint === "detail" ? "Unable to read auction" : "Unable to read auction history" });
    });
  }

  for (const endpoint of ["detail", "history"] as const) {
    it(`returns a controlled ${endpoint} 404 for a missing auction`, async () => {
      readerClient({ nextAuctionId: 1n });
      const { response, body } = await request(endpoint, "2");
      expect(response.status).toBe(404);
      expect(body).toEqual({ error: "Auction not found" });
    });

    it.each([fakeRpcUrl, "0", "-1", "1.5"])(`returns a controlled ${endpoint} 404 for invalid IDs: %s`, async (auctionId) => {
      const { response, body } = await request(endpoint, auctionId);
      expect(response.status).toBe(404);
      expect(body).toEqual({ error: "Auction not found" });
      expect(mocks.createPublicClient).not.toHaveBeenCalled();
    });

    it(`does not expose arbitrary AuctionNotFoundError content for ${endpoint}`, async () => {
      mocks.detail.mockRejectedValueOnce(new AuctionNotFoundError(fakeRpcUrl));
      const { response, body } = await request(endpoint);
      expect(response.status).toBe(404);
      expect(body).toEqual({ error: "Auction not found" });
    });

    it(`keeps ${endpoint} RPC failures as 503 rather than missing-auction 404`, async () => {
      readerClient({ fail: "nextAuctionId" });
      const { response } = await request(endpoint);
      expect(response.status).toBe(503);
    });
  }

  it("preserves complete nominal JSON bodies and list limit forwarding", async () => {
    const detail = auctionDetailFixture;
    const list = { chainId: detail.chainId, auctionHouse: detail.auctionHouse, nextAuctionId: "2", count: 1,
      discovery: { strategy: "events", limit: 2, requestedLimit: 2 }, auctions: [detail.auction] };
    mocks.list.mockResolvedValueOnce(list);
    mocks.detail.mockResolvedValue(detail);
    mocks.history.mockResolvedValueOnce(detail.auction.history);
    const listed = await request("list");
    expect(listed.response.status).toBe(200);
    expect(listed.body).toEqual(list);
    expect(mocks.list).toHaveBeenCalledWith({ limit: "2" });
    const detailed = await request("detail");
    expect(detailed.response.status).toBe(200);
    expect(detailed.body).toEqual(detail);
    const history = await request("history");
    expect(history.response.status).toBe(200);
    expect(history.body).toEqual({ chainId: deployment.chainId, auctionHouse: deployment.contracts.auctionHouse,
      auctionId: "1", history: detail.auction.history });
  });
});

describe("real auction readers through partial HTTP 200 responses", () => {
  it.each(failures)("keeps bounded discovery fallback safe: $label", async ({ create }) => {
    readerClient({ finalized: false, eventFailure: true, error: create() });
    const { response, body } = await request("list");
    expect(response.status).toBe(200);
    expect(body.discovery).toEqual({ strategy: "nextAuctionIdFallback", limit: 2, requestedLimit: 2,
      warning: "AuctionCreated event scan failed; used bounded nextAuctionId fallback." });
    expect(body.auctions.map((auction: { auctionId: string }) => auction.auctionId)).toEqual(["1"]);
  });

  it("preserves the useful no-event discovery warning", async () => {
    readerClient({ finalized: false, eventLogs: { AuctionCreated: [] } });
    const { body } = await request("list");
    expect(body.discovery.warning).toBe("No AuctionCreated logs were returned; used bounded nextAuctionId fallback.");
  });

  it.each(["list", "detail"] as const)("keeps fee snapshot failures visible and safe in %s", async (endpoint) => {
    readerClient({ fail: "getAuctionFeeRecipient", error: failures[2].create() });
    const { response, body } = await request(endpoint);
    expect(response.status).toBe(200);
    const auction = endpoint === "list" ? body.auctions[0] : body.auction;
    expect(auction.auctionFeeRecipientError).toBe("Unable to read auction fee recipient snapshot.");
    expect(auction.settlementReadiness.protocolWalletCredit.status).toBe("unavailable");
    expect(auction.settlementReadiness.warnings).toContain("Auction fee recipient is unavailable.");
  });

  it("keeps detail parameter snapshot failures visible and safe", async () => {
    readerClient({ fail: "getAuctionParams", error: failures[2].create() });
    const { response, body } = await request("detail");
    expect(response.status).toBe(200);
    expect(body.auction.paramsSnapshotError).toBe("Unable to read auction parameter snapshot.");
    expect(body.auction.paramsSnapshot).toBeUndefined();
    expect(body.auction.economicSummary).toBeDefined();
  });

  it.each(["feeRecipient", "capOf", "entitlementOf"])("keeps detailed economics failures safe after %s", async (fail) => {
    readerClient({ fail, error: failures[2].create() });
    const { response, body } = await request("detail");
    expect(response.status).toBe(200);
    expect(body.auction.economics).toBeUndefined();
    expect(body.auction.economicSummary.warnings).toContain("Unable to read detailed auction economics.");
    expect(body.auction.settlementReadiness.status).toBe("complete");
  });

  for (const endpoint of ["list", "detail"] as const) {
    it.each([
      ["getParticipants", "refunds", "Unable to read participant refunds."],
      ["settlements", "refunds", "Unable to read participant refunds."],
      ["refundableAmount", "refunds", "Some participant refunds are unavailable."],
      ["refundClaimed", "refunds", "Some participant refunds are unavailable."],
      ["distributions", "redistribution", "Unable to read redistribution settlement."],
      ["sellerCredits", "sellerWalletCredit", "Unable to read seller wallet credit."],
      ["protocolFeeCredits", "protocolWalletCredit", "Unable to read protocol wallet credit."]
    ])(`keeps ${endpoint} settlement group failures safe: %s`, async (fail, field, warning) => {
      readerClient({ fail, error: failures[2].create() });
      const { response, body } = await request(endpoint);
      expect(response.status).toBe(200);
      const auction = endpoint === "list" ? body.auctions[0] : body.auction;
      expect(auction.settlementReadiness.status).toBe("partial");
      expect(auction.settlementReadiness[field].status).toBe("unavailable");
      expect(auction.settlementReadiness.warnings).toContain(warning);
      if (field !== "sellerWalletCredit") expect(auction.settlementReadiness.sellerWalletCredit).toEqual({ status: "known", value: "123" });
      if (endpoint === "detail") expect(auction.economicSummary.warnings).toContain(warning);
    });
  }

  it.each([
    { overrides: { getParticipants: [testAddresses.primaryBidder] }, warning: "Participant reads are incomplete or exceed the contract limit." },
    { overrides: { settlements: { finalized: false } }, warning: "ETH settlement is not confirmed." },
    { overrides: { distributions: { opened: true, totalAssigned: 0n, totalClaimed: 1n } }, warning: "Redistribution settlement is unavailable or inconsistent." },
    { overrides: { sellerCredits: -1n }, warning: "Invalid economic amount." },
    { overrides: { refundClaimed: "unknown" }, warning: "Some participant refunds are unavailable." }
  ])("preserves safe internally generated validation: $warning", async ({ overrides, warning }) => {
    readerClient({ overrides });
    const { response, body } = await request("detail");
    expect(response.status).toBe(200);
    expect(body.auction.settlementReadiness.warnings).toContain(warning);
    expect(body.auction.settlementReadiness.status).toBe("partial");
  });

  it("does not treat an external error message matching internal text as trusted", async () => {
    readerClient({ fail: "sellerCredits", error: new Error("ETH settlement is not confirmed.") });
    const { body } = await request("list");
    expect(body.auctions[0].settlementReadiness.warnings).toEqual(["Unable to read seller wallet credit."]);
  });

  it("preserves complete real-reader data without diagnostics", async () => {
    const { response, body } = await request("detail");
    expect(response.status).toBe(200);
    expect(body.auction.paramsSnapshot).toEqual(auctionDetailFixture.auction.paramsSnapshot);
    expect(body.auction.auctionFeeRecipient).toBe(testAddresses.feeRecipient);
    expect(body.auction.settlementReadiness).toEqual({ status: "complete", participantsExpected: "2", participantsRead: 2,
      refunds: { status: "known", value: "1000000000000000000" }, redistribution: { status: "known", value: "100" },
      sellerWalletCredit: { status: "known", value: "123" }, protocolWalletCredit: { status: "known", value: "456" }, warnings: [] });
    expect(body.auction.economics.primaryBidder.refundableAmount).toBe("1000000000000000000");
    expect(body.auction.economics.seller.credit).toBe("123");
    expect(body.auction).not.toHaveProperty("paramsSnapshotError");
    expect(body.auction).not.toHaveProperty("auctionFeeRecipientError");
  });
});

describe("real history reader through partial HTTP 200 responses", () => {
  it.each(["getBidCount", "getBid"])("keeps bid-record failures safe after %s", async (fail) => {
    readerClient({ fail, error: failures[2].create() });
    const { response, body } = await request("history");
    expect(response.status).toBe(200);
    expect(body.history.partial).toBe(true);
    expect(body.history.warnings).toContain("Unable to read bid records from AuctionHouse.getBid.");
    expect(body.history.source).toBe("events-only");
    expect(body.history.events).toHaveLength(1);
  });

  it.each(failures)("keeps all event failure warnings safe: $label", async ({ create }) => {
    readerClient({ eventFailure: true, error: create() });
    const { response, body } = await request("history");
    expect(response.status).toBe(200);
    expect(body.history.partial).toBe(true);
    expect(body.history.source).toBe("bid-records-only");
    expect(body.history.bids).toHaveLength(1);
    for (const event of ["AuctionHouse.AuctionCreated", "AuctionHouse.BidPlaced", "AuctionHouse.AuctionExtended",
      "AuctionHouse.AuctionEnded", "AuctionHouse.AuctionFinalized", "AuctionHouse.NFTClaimed", "EscrowVault.RefundClaimed",
      "DistributionVault.DistributionOpened", "DistributionVault.DistributionClaimed"]) {
      expect(body.history.warnings.join(" ")).toContain(`Unable to read ${event} logs.`);
    }
  });

  it("keeps block timestamp failures safe while retaining bids and events", async () => {
    readerClient({ blockFailure: true, error: failures[2].create() });
    const { response, body } = await request("history");
    expect(response.status).toBe(200);
    expect(body.history.partial).toBe(true);
    expect(body.history.warnings).toEqual(["Unable to read timestamp for block 40."]);
    expect(body.history.bids).toHaveLength(1);
    expect(body.history.events).toHaveLength(1);
    expect(body.history.events[0].timestamp).toBeUndefined();
  });

  it("preserves useful bounded-history business warnings", async () => {
    readerClient({ overrides: { getBidCount: 201n } });
    const { response, body } = await request("history");
    expect(response.status).toBe(200);
    expect(body.history.bids).toHaveLength(200);
    expect(body.history.bids[0].index).toBe("1");
    expect(body.history.warnings).toEqual(["Bid history is limited to the latest 200 bid records."]);
  });
});
