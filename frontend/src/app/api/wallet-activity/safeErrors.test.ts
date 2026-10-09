// @vitest-environment node
import { BaseError, HttpRequestError, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { auctionDetailFixture, localDeploymentFixture, testAddresses } from "@/test/fixtures";
import type { WalletActivityApiResponse } from "@/lib/walletActivity";

const mocks = vi.hoisted(() => {
  // Synthetic public-target configuration prevents local wallet-key reads.
  vi.stubEnv("ANVIL_RPC_URL", "http://rpc.example.invalid");
  vi.stubEnv("BIDBACK_RPC_URL", "http://rpc.example.invalid");
  vi.stubEnv("BIDBACK_CHAIN_ID", "84532");
  return { createPublicClient: vi.fn(), access: vi.fn(), readFile: vi.fn(), auctionsByIds: vi.fn() };
});

vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: mocks.createPublicClient
}));
vi.mock("node:fs/promises", () => ({ access: mocks.access, readFile: mocks.readFile }));
vi.mock("@/lib/server/auctionReader", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/auctionReader")>(),
  readAuctionsByIds: mocks.auctionsByIds
}));

const realReader = await vi.importActual<typeof import("@/lib/server/auctionReader")>("@/lib/server/auctionReader");
const deployment = { ...localDeploymentFixture, chainId: 84532 };
const wallet = testAddresses.primaryBidder;
const fakeRpcUrl = "https://FAKE_USER:FAKE_PASSWORD@rpc.example.invalid/private-path/FAKE_SECRET?apiKey=FAKE_QUERY_SECRET";
const forbidden = ["FAKE_USER", "FAKE_PASSWORD", "rpc.example.invalid", "private-path", "FAKE_SECRET", "FAKE_QUERY_SECRET"];
const internalWarning = "ETH settlement is not confirmed.";
const publicErrors = {
  global: "Unable to read wallet activity",
  position: "Unable to read wallet position for this auction.",
  seller: "Unable to read global seller proceeds credit.",
  protocol: "Unable to read global protocol fees credit.",
  discovery: "Wallet activity event scan failed; used bounded nextAuctionId fallback."
};

function rpcError() {
  return new HttpRequestError({ url: fakeRpcUrl, status: 503,
    details: `RPC unavailable at ${fakeRpcUrl}`, cause: new Error(`Transport failed at ${fakeRpcUrl}`) });
}

const failures = [
  { label: "standard Error", create: () => new Error(`Read failed at ${fakeRpcUrl}`) },
  { label: "viem shortMessage", create: () => new BaseError(`Read failed at ${fakeRpcUrl}`, { cause: rpcError() }) },
  { label: "HttpRequestError", create: rpcError },
  { label: "nested cause", create: () => new Error("Outer read failed", { cause: new BaseError("Wrapped RPC failure", { cause: rpcError() }) }) },
  { label: "viem details", create: () => new BaseError("Read failed", { details: `Transport details at ${fakeRpcUrl}` }) },
  { label: "non-Error diagnostic", create: () => ({ message: fakeRpcUrl, shortMessage: fakeRpcUrl,
    details: fakeRpcUrl, cause: rpcError(), toString: () => `Diagnostic at ${fakeRpcUrl}` }) },
  { label: "external message exactly matching an internal warning", create: () => new Error(internalWarning, { cause: rpcError() }) }
];

function expectSafe(body: unknown) {
  const serialized = JSON.stringify(body);
  for (const marker of forbidden) expect(serialized).not.toContain(marker);
}

type ContractRequest = { functionName: string; args?: readonly unknown[]; blockNumber?: bigint };
type EventRequest = { eventName: string; args?: Record<string, unknown> };
type ReaderOptions = {
  nextAuctionId?: bigint;
  fail?: (request: ContractRequest) => boolean;
  error?: unknown;
  blockFailure?: boolean;
  eventMode?: "scoped" | "general" | "empty" | "failure";
  overrides?: Record<string, unknown>;
};

function readerClient({ nextAuctionId = 3n, fail, error = rpcError(), blockFailure = false,
  eventMode = "scoped", overrides = {} }: ReaderOptions = {}) {
  const auction = auctionDetailFixture.auction;
  const readContract = vi.fn(async (request: ContractRequest) => {
    const { functionName, args = [] } = request;
    if (fail?.(request)) throw error;
    if (Object.hasOwn(overrides, functionName)) return overrides[functionName];
    const id = typeof args[0] === "bigint" ? args[0] : 1n;
    switch (functionName) {
      case "nextAuctionId": return nextAuctionId;
      case "getAuction": return { ...auction, seller: wallet, tokenId: id,
        startPrice: BigInt(auction.startPrice), startTime: BigInt(auction.startTime),
        initialEndTime: BigInt(auction.initialEndTime), endTime: BigInt(auction.endTime),
        highestBid: BigInt(auction.highestBid), participantCount: 2n, bidCount: 2n, state: 2 };
      case "getAuctionFeeRecipient":
      case "feeRecipient": return wallet;
      case "capOf": return id * 1000n + 200n;
      case "refundableAmount": return args[1] === wallet ? id * 1000n + 100n : 0n;
      case "entitlementOf": return id * 50n;
      case "refundClaimed":
      case "claimed": return false;
      case "sellerCredits": return 123n;
      case "protocolFeeCredits": return 456n;
      case "getParticipants": return [wallet, testAddresses.secondBidder];
      case "settlements": return { finalized: true };
      case "distributions": return { opened: true, totalAssigned: 100n, totalClaimed: 0n };
      default: throw new Error(`Unexpected synthetic contract read: ${functionName}`);
    }
  });
  const getContractEvents = vi.fn(async ({ eventName, args }: EventRequest) => {
    if (eventMode === "failure") throw error;
    if (eventMode === "empty") return [];
    if (eventName !== "AuctionCreated" || (eventMode === "general" ? Boolean(args) : !args?.seller)) return [];
    return [1n, 2n].filter((id) => id < nextAuctionId)
      .map((auctionId) => ({ args: { auctionId }, blockNumber: 40n + auctionId, logIndex: 0 }));
  });
  const getBlock = vi.fn(async (_request?: unknown) => {
    if (blockFailure) throw error;
    return { number: 42n, timestamp: 1780007300n };
  });
  const client = { readContract, getContractEvents, getBlock } as unknown as PublicClient;
  mocks.createPublicClient.mockReturnValue(client);
  return { client, readContract, getContractEvents, getBlock };
}

async function request(walletParam: string | null = wallet, limit: string | null = "10") {
  const url = new URL("https://bidback.example.invalid/api/wallet-activity");
  if (walletParam !== null) url.searchParams.set("wallet", walletParam);
  if (limit !== null) url.searchParams.set("limit", limit);
  const response = await GET(new Request(url));
  const body = await response.json();
  expectSafe(body);
  return { response, body: body as WalletActivityApiResponse & { error?: string } };
}

function expectedAuctionItem(id: string) {
  return {
    auctionId: id, href: `/auctions/${id}`, state: 2, stateLabel: "FINALIZED", lifecycleLabel: "Finalized",
    endTime: "1780007200", roles: ["seller", "bidder", "fee-recipient"],
    reason: "2 auction-specific wallet actions are currently available.", partial: false,
    actions: [
      { kind: "claimRefund", label: "Claim refund", description: "A refundable wallet cap is currently available for this auction.",
        amount: (BigInt(id) * 1000n + 100n).toString(), priority: 20 },
      { kind: "claimReward", label: "Claim redistribution",
        description: "A positive conditional redistribution entitlement is currently claimable. It is separate from any refund and is not guaranteed in advance.",
        amount: (BigInt(id) * 50n).toString(), priority: 30 }
    ]
  };
}

function expectedNominalBody() {
  const auctionActions = [expectedAuctionItem("1"), expectedAuctionItem("2")];
  const description = "This is a global wallet credit held by EscrowVault. It is not attributed to a single auction in this view.";
  const globalActions = [
    { kind: "withdrawSellerProceeds", label: "Withdraw proceeds", description, amount: "123", priority: 10,
      targetAuctionId: "2", href: "/auctions/2" },
    { kind: "withdrawProtocolFees", label: "Withdraw protocol fees", description, amount: "456", priority: 20,
      targetAuctionId: "2", href: "/auctions/2" }
  ];
  const nextActions = [
    ...auctionActions.flatMap((item) => item.actions.map((action) => ({ ...action, auctionId: item.auctionId,
      label: `${action.label} — Auction #${item.auctionId}`, href: item.href }))),
    ...globalActions.map((action) => ({ ...action, auctionId: action.targetAuctionId }))
  ].sort((a, b) => a.priority - b.priority);
  return {
    chainId: deployment.chainId, auctionHouse: deployment.contracts.auctionHouse, wallet, count: 2,
    discovery: { strategy: "event-scoped", limit: 10, requestedLimit: 10, returnedIds: 2 },
    activity: {
      wallet, walletConnected: true, createdAuctions: 2, activeBids: 0, wonAuctions: 0, lostAuctions: 2,
      claimableNfts: 0, claimableRefunds: 2, claimableRewards: 2, withdrawableSellerProceeds: 1,
      withdrawableProtocolFees: 1, totalRefundableAmount: "3200", totalRewardEntitlement: "150",
      sellerProceedsAvailable: "123", protocolFeesAvailable: "456", hasActivity: true, nextActions, warnings: [],
      actionQueue: { auctionActions, globalActions, watching: [], history: [], availableActionCount: 6,
        relatedAuctionCount: 2, partial: false, warnings: [] }
    }
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(undefined);
  mocks.readFile.mockResolvedValue(JSON.stringify(deployment));
  mocks.auctionsByIds.mockImplementation(realReader.readAuctionsByIds);
  readerClient();
});

describe("wallet activity GET public diagnostics", () => {
  it("uses real viem shortMessage, details and nested cause diagnostics", () => {
    const httpError = rpcError();
    expect(httpError).toBeInstanceOf(HttpRequestError);
    expect(httpError.message).toContain(fakeRpcUrl);
    expect(httpError.details).toContain(fakeRpcUrl);
    const shortError = failures[1].create() as BaseError;
    expect(shortError.shortMessage).toContain(fakeRpcUrl);
    expect(shortError.cause).toBeInstanceOf(HttpRequestError);
    const nested = failures[3].create() as Error;
    expect((nested.cause as BaseError).cause).toBeInstanceOf(HttpRequestError);
    expect((failures[4].create() as BaseError).details).toContain(fakeRpcUrl);
    expect((failures[6].create() as Error).message).toBe(internalWarning);
  });

  it.each([null, "", "not-a-wallet", fakeRpcUrl])("keeps invalid wallet %s as controlled HTTP 400", async (invalid) => {
    const { response, body } = await request(invalid);
    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "A valid wallet address is required." });
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
  });

  for (const stage of ["deployment", "client setup", "nextAuctionId", "reference block", "auction read"] as const) {
    it.each(failures)(`returns static HTTP 503 after ${stage}: $label`, async ({ create }) => {
      const error = create();
      if (stage === "deployment") mocks.readFile.mockRejectedValueOnce(error);
      else if (stage === "client setup") mocks.createPublicClient.mockImplementationOnce(() => { throw error; });
      else readerClient({ error, blockFailure: stage === "reference block",
        fail: stage === "reference block" ? undefined
          : ({ functionName }) => functionName === (stage === "auction read" ? "getAuction" : "nextAuctionId") });
      const { response, body } = await request();
      expect(response.status).toBe(503);
      expect(body).toEqual({ error: publicErrors.global });
    });
  }

  it("preserves the complete nominal JSON schema, positions, credits and discovery reads", async () => {
    const f = readerClient();
    const { response, body } = await request();
    expect(response.status).toBe(200);
    expect(body).toEqual(expectedNominalBody());
    expect(mocks.auctionsByIds).toHaveBeenCalledWith([2n, 1n], {
      client: f.client, deployment, includeNftMetadata: false
    });
    expect(f.getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
    expect(f.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "getAuction", args: [2n], blockNumber: 42n }));
    for (const functionName of ["capOf", "refundableAmount", "refundClaimed", "entitlementOf", "claimed"]) {
      for (const id of [1n, 2n]) expect(f.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName, args: [id, wallet] }));
    }
    expect(f.getContractEvents.mock.calls.map(([entry]) => [entry.eventName, entry.args])).toEqual([
      ["AuctionCreated", { seller: wallet }], ["BidPlaced", { bidder: wallet }],
      ["AuctionFinalized", { winner: wallet }], ["NFTClaimed", { claimant: wallet }]
    ]);
  });

  for (const [functionName, warning, unavailableKey, availableKey, availableValue, missingAction] of [
    ["sellerCredits", publicErrors.seller, "sellerProceedsAvailable", "protocolFeesAvailable", "456", "withdrawSellerProceeds"],
    ["protocolFeeCredits", publicErrors.protocol, "protocolFeesAvailable", "sellerProceedsAvailable", "123", "withdrawProtocolFees"]
  ] as const) {
    it.each(failures)(`keeps partial HTTP 200 and healthy data after ${functionName}: $label`, async ({ create }) => {
      readerClient({ fail: (entry) => entry.functionName === functionName, error: create() });
      const { response, body } = await request();
      expect(response.status).toBe(200);
      expect(body.discovery).toEqual(expectedNominalBody().discovery);
      expect(body.count).toBe(2);
      expect(body.activity.warnings).toEqual([warning]);
      expect(body.activity.actionQueue.warnings).toEqual([warning]);
      expect(body.activity.actionQueue.partial).toBe(true);
      expect(body.activity[unavailableKey]).toBe("0");
      expect(body.activity[availableKey]).toBe(availableValue);
      expect(body.activity.actionQueue.auctionActions).toEqual(expectedNominalBody().activity.actionQueue.auctionActions);
      expect(body.activity.actionQueue.globalActions).toEqual(expectedNominalBody().activity.actionQueue.globalActions.filter((action) => action.kind !== missingAction));
      expect(body.activity).toMatchObject({ claimableRefunds: 2, claimableRewards: 2, totalRefundableAmount: "3200", totalRewardEntitlement: "150" });
      expect(body.activity.actionQueue.availableActionCount).toBe(5);
    });
  }

  it.each(failures)("keeps a failed position separate from a healthy auction: $label", async ({ create }) => {
    readerClient({ error: create(), fail: ({ functionName, args }) => functionName === "capOf" && args?.[0] === 1n });
    const { response, body } = await request();
    expect(response.status).toBe(200);
    expect(body.count).toBe(2);
    expect(body.activity.warnings).toEqual([`Auction #1: ${publicErrors.position}`]);
    expect(body.activity.actionQueue.warnings).toEqual(body.activity.warnings);
    expect(body.activity.actionQueue.partial).toBe(true);
    expect(body.activity.actionQueue.auctionActions).toEqual([expectedAuctionItem("2")]);
    expect(body.activity.actionQueue.watching).toEqual([{
      auctionId: "1", href: "/auctions/1", state: 2, stateLabel: "FINALIZED", lifecycleLabel: "Finalized",
      endTime: "1780007200", roles: ["seller"], partial: true, partialReason: publicErrors.position, actions: [],
      reason: "Wallet position data is incomplete. Review the auction detail before treating this activity as settled."
    }]);
    expect(body.activity).toMatchObject({ lostAuctions: 1, claimableRefunds: 1, claimableRewards: 1,
      totalRefundableAmount: "2100", totalRewardEntitlement: "100", sellerProceedsAvailable: "123", protocolFeesAvailable: "456" });
    expect(body.activity.actionQueue.globalActions).toEqual(expectedNominalBody().activity.actionQueue.globalActions);
  });

  it("keeps the legacy fee-recipient fallback working without exposing the first failed read", async () => {
    const f = readerClient({ fail: ({ functionName }) => functionName === "getAuctionFeeRecipient" });
    const { response, body } = await request();
    expect(response.status).toBe(200);
    expect(body).toEqual(expectedNominalBody());
    expect(f.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "feeRecipient" }));
  });

  it("uses a safe position error when both fee-recipient reads fail", async () => {
    readerClient({ fail: ({ functionName }) => ["getAuctionFeeRecipient", "feeRecipient"].includes(functionName) });
    const { response, body } = await request();
    expect(response.status).toBe(200);
    expect(body.activity.warnings).toEqual([`Auction #2: ${publicErrors.position}`, `Auction #1: ${publicErrors.position}`]);
    expect(body.activity.actionQueue.watching.every((item) => item.partialReason === publicErrors.position)).toBe(true);
    expect(body.activity.sellerProceedsAvailable).toBe("123");
    expect(body.activity.protocolFeesAvailable).toBe("456");
  });
});

describe("real wallet event discovery through HTTP composition", () => {
  it.each(failures)("retains bounded IDs, strategy, limits and safe composed warnings: $label", async ({ create }) => {
    const f = readerClient({ nextAuctionId: 6n, eventMode: "failure", error: create() });
    const { response, body } = await request(wallet, "2");
    const warning = `${publicErrors.discovery} Results are limited to 2 newest auction IDs out of 5 known auctions.`;
    expect(response.status).toBe(200);
    expect(body.discovery).toEqual({ strategy: "bounded-fallback", limit: 2, requestedLimit: 2, returnedIds: 2, warning });
    expect(mocks.auctionsByIds).toHaveBeenCalledWith([5n, 4n], { client: f.client, deployment, includeNftMetadata: false });
    expect(body.count).toBe(2);
    expect(body.activity.actionQueue.auctionActions.map((item) => item.auctionId)).toEqual(["4", "5"]);
    expect(body.activity.warnings).toEqual([warning]);
    expect(body.activity.actionQueue.warnings).toEqual([warning]);
    expect(body.activity.actionQueue.partial).toBe(true);
    expect(body.activity).toMatchObject({ claimableRefunds: 2, claimableRewards: 2,
      totalRefundableAmount: "9200", totalRewardEntitlement: "450", sellerProceedsAvailable: "123", protocolFeesAvailable: "456" });
  });

  it.each([
    { eventMode: "general" as const, strategy: "general-event-window", prefix: "No wallet-scoped AuctionHouse events were found. Scanning a bounded newest-first AuctionCreated window for roles such as fee recipient snapshots." },
    { eventMode: "empty" as const, strategy: "bounded-fallback", prefix: "No AuctionCreated logs were returned. Used bounded nextAuctionId fallback." }
  ])("preserves the safe $strategy business warning", async ({ eventMode, strategy, prefix }) => {
    readerClient({ eventMode, nextAuctionId: 3n });
    const { response, body } = await request(wallet, "1");
    const warning = `${prefix} Results are limited to 1 newest auction IDs out of 2 known auctions.`;
    expect(response.status).toBe(200);
    expect(body.discovery).toEqual({ strategy, limit: 1, requestedLimit: 1, returnedIds: 1, warning });
    expect(body.activity.warnings).toEqual([warning]);
    expect(body.activity.actionQueue.auctionActions.map((item) => item.auctionId)).toEqual(["2"]);
  });

  it("preserves the wallet-scoped limit warning", async () => {
    const { response, body } = await request(wallet, "1");
    expect(response.status).toBe(200);
    expect(body.discovery).toEqual({ strategy: "event-scoped", limit: 1, requestedLimit: 1, returnedIds: 1,
      warning: "Wallet-scoped event results are limited to 1 newest matching auction IDs." });
    expect(body.activity.warnings).toEqual([body.discovery.warning]);
    expect(body.activity.actionQueue.partial).toBe(true);
  });

  it.each([
    { input: "9999", limit: 500, requestedLimit: 9999 },
    { input: "bad-limit", limit: 100, requestedLimit: 100 },
    { input: null, limit: 100, requestedLimit: 100 }
  ])("preserves discovery normalization for $input", async ({ input, limit, requestedLimit }) => {
    const { response, body } = await request(wallet, input);
    expect(response.status).toBe(200);
    expect(body.discovery).toEqual({ strategy: "event-scoped", limit, requestedLimit, returnedIds: 2 });
    expect(body.activity.actionQueue.partial).toBe(false);
  });

  it("preserves empty activity and global credits without event or auction reads", async () => {
    const f = readerClient({ nextAuctionId: 1n });
    const { response, body } = await request();
    expect(response.status).toBe(200);
    expect(body.discovery).toEqual({ strategy: "event-scoped", limit: 10, requestedLimit: 10, returnedIds: 0 });
    expect(body.count).toBe(0);
    expect(body.activity.actionQueue).toMatchObject({ auctionActions: [], watching: [], history: [],
      partial: false, warnings: [], availableActionCount: 2, relatedAuctionCount: 0 });
    expect(body.activity).toMatchObject({ sellerProceedsAvailable: "123", protocolFeesAvailable: "456", hasActivity: true });
    expect(f.getContractEvents).not.toHaveBeenCalled();
    expect(f.getBlock).not.toHaveBeenCalled();
  });
});

describe("extra composition coverage using actual G-1 optional auction reads", () => {
  // The route normally requests base auctions only. This test-only adapter adds
  // real block-pinned optional reads to prove their sanitized output composes safely.
  function includeOptionalReads() {
    mocks.auctionsByIds.mockImplementation((ids: bigint[], options: Parameters<typeof realReader.readAuctionsByIds>[1]) =>
      realReader.readAuctionsByIds(ids, { ...options, includeSettlementReadiness: true }));
  }

  it.each([
    ["getParticipants", "refunds", "Unable to read participant refunds."],
    ["distributions", "redistribution", "Unable to read redistribution settlement."],
    ["sellerCredits", "sellerWalletCredit", "Unable to read seller wallet credit."]
  ] as const)("keeps block-pinned %s diagnostics safe while route positions and credits remain healthy", async (functionName, group, warning) => {
    includeOptionalReads();
    const f = readerClient({ error: failures[1].create(), fail: (entry) => entry.functionName === functionName && entry.blockNumber === 42n });
    const { response, body } = await request();
    expect(response.status).toBe(200);
    const baseAuctions = await mocks.auctionsByIds.mock.results[0].value as Awaited<ReturnType<typeof realReader.readAuctionsByIds>>;
    expectSafe(baseAuctions);
    for (const auction of baseAuctions) {
      expect(auction.settlementReadiness?.status).toBe("partial");
      expect(auction.settlementReadiness?.[group]).toEqual({ status: "unavailable" });
      expect(auction.settlementReadiness?.warnings).toEqual([warning]);
    }
    expect(f.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName, blockNumber: 42n }));
    expect(body).toEqual(expectedNominalBody());
  });

  it("preserves a genuine internal business warning without trusting identical external exception text", async () => {
    includeOptionalReads();
    readerClient({ overrides: { settlements: { finalized: false } } });
    const { response, body } = await request();
    expect(response.status).toBe(200);
    const baseAuctions = await mocks.auctionsByIds.mock.results[0].value as Awaited<ReturnType<typeof realReader.readAuctionsByIds>>;
    expectSafe(baseAuctions);
    expect(baseAuctions[0].settlementReadiness?.warnings).toEqual([internalWarning]);
    expect(body).toEqual(expectedNominalBody());
  });
});
