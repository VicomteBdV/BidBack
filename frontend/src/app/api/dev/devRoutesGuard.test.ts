import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createAuctionPost } from "@/app/api/dev/create-auction/route";
import { POST as placeBidPost } from "@/app/api/dev/place-bid/route";
import { POST as finalizePost } from "@/app/api/dev/finalize/route";
import { POST as claimNftPost } from "@/app/api/dev/claim-nft/route";
import { POST as claimRefundPost } from "@/app/api/dev/claim-refund/route";
import { POST as claimRewardPost } from "@/app/api/dev/claim-reward/route";
import { POST as withdrawSellerPost } from "@/app/api/dev/withdraw-seller-proceeds/route";
import { POST as withdrawFeesPost } from "@/app/api/dev/withdraw-protocol-fees/route";
import { GET as localCreateContextGet } from "@/app/api/local-create-context/route";
import { createLocalDevAuction, readLocalCreateAuctionContext } from "@/lib/server/auctionCreator";
import {
  claimDemoNft,
  claimDemoRefund,
  claimDemoReward,
  finalizeDemoAuction,
  placeDemoBid,
  withdrawDemoProtocolFees,
  withdrawDemoSellerProceeds
} from "@/lib/server/auctionWriter";

vi.mock("@/lib/server/auctionCreator", () => ({
  createLocalDevAuction: vi.fn(),
  readLocalCreateAuctionContext: vi.fn()
}));

vi.mock("@/lib/server/auctionWriter", () => ({
  placeDemoBid: vi.fn(),
  finalizeDemoAuction: vi.fn(),
  claimDemoNft: vi.fn(),
  claimDemoRefund: vi.fn(),
  claimDemoReward: vi.fn(),
  withdrawDemoSellerProceeds: vi.fn(),
  withdrawDemoProtocolFees: vi.fn()
}));

type DevRoute = {
  name: string;
  post: (request: Request) => Promise<Response>;
  body: Record<string, unknown>;
};

const routes: DevRoute[] = [
  {
    name: "create-auction",
    post: createAuctionPost,
    body: {
      nftContract: "0x0000000000000000000000000000000000001007",
      tokenId: "2",
      startPriceEth: "1",
      durationSeconds: "7200"
    }
  },
  { name: "place-bid", post: placeBidPost, body: { auctionId: "1", bidderRole: "primary" } },
  { name: "finalize", post: finalizePost, body: { auctionId: "1" } },
  { name: "claim-nft", post: claimNftPost, body: { auctionId: "1" } },
  { name: "claim-refund", post: claimRefundPost, body: { auctionId: "1", bidderRole: "primary" } },
  { name: "claim-reward", post: claimRewardPost, body: { auctionId: "1", bidderRole: "primary" } },
  { name: "withdraw-seller-proceeds", post: withdrawSellerPost, body: { auctionId: "1" } },
  { name: "withdraw-protocol-fees", post: withdrawFeesPost, body: { auctionId: "1" } }
];

const writerMocks = [
  createLocalDevAuction,
  placeDemoBid,
  finalizeDemoAuction,
  claimDemoNft,
  claimDemoRefund,
  claimDemoReward,
  withdrawDemoSellerProceeds,
  withdrawDemoProtocolFees
];

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/dev/test", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

const endpoints = [
  ...routes.map((route, index) => ({
    name: route.name,
    call: () => route.post(jsonRequest(route.body)),
    mock: writerMocks[index]
  })),
  { name: "local-create-context", call: () => localCreateContextGet(), mock: readLocalCreateAuctionContext }
];

function expectNoLocalActionCalled() {
  for (const mock of [...writerMocks, readLocalCreateAuctionContext]) {
    expect(mock).not.toHaveBeenCalled();
  }
}

async function expectUnavailable(call: () => Promise<Response>) {
  const response = await call();
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "Not available." });
  expectNoLocalActionCalled();
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "31337");
  vi.stubEnv("BIDBACK_CHAIN_ID", "31337");
  vi.stubEnv("ENABLE_LOCAL_DEV_ACTIONS", "true");
  vi.stubEnv("ANVIL_RPC_URL", "http://127.0.0.1:8545");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: "0x7a69" })));
  vi.mocked(readLocalCreateAuctionContext).mockResolvedValue({
    chainId: 31337,
    auctionHouse: "0x0000000000000000000000000000000000001001",
    nftVault: "0x0000000000000000000000000000000000001002",
    localNft: "0x0000000000000000000000000000000000001007",
    paramsController: "0x0000000000000000000000000000000000001005",
    minAuctionDuration: "60", paused: false, defaultTokenId: "2", defaultDuration: "7200"
  });
});

afterEach(() => vi.unstubAllEnvs());

describe.each([
  ["84532", "84532"], ["84532", "31337"], ["31337", "84532"],
  ["84532", undefined], [undefined, "84532"],
  ["1", "31337"], ["31337", "1"],
  ["invalid", "31337"], ["31337", "invalid"],
  [undefined, "31337"], ["31337", undefined], ["", "31337"], ["31337", ""]
])("local endpoint exclusion for public/server targets %s / %s", (publicId, serverId) => {
  it.each(endpoints)("refuses $name before any RPC, writer or local reader", async ({ call }) => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", publicId);
    vi.stubEnv("BIDBACK_CHAIN_ID", serverId);
    // The flag is true and the supplied RPC would report Anvil if called.
    await expectUnavailable(call);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("local endpoint guard failures", () => {
  it.each(endpoints)("refuses $name without exact opt-in", async ({ call }) => {
    for (const flag of [undefined, "false", "TRUE", "1", "true "]) {
      vi.stubEnv("ENABLE_LOCAL_DEV_ACTIONS", flag);
      await expectUnavailable(call);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(endpoints)("refuses $name without an Anvil RPC", async ({ call }) => {
    vi.stubEnv("ANVIL_RPC_URL", undefined);
    await expectUnavailable(call);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(endpoints)("refuses $name on a non-Anvil or malformed RPC result", async ({ call }) => {
    for (const result of ["0x14a34", "0x1", "0x7a69junk", 31337, null, undefined]) {
      vi.mocked(fetch).mockResolvedValueOnce(Response.json({ result }));
      await expectUnavailable(call);
    }
  });

  it.each(endpoints)("sanitizes RPC failures for $name", async ({ call }) => {
    const internal = "synthetic-private-rpc-detail";
    vi.mocked(fetch).mockRejectedValueOnce(new Error(internal));
    await expectUnavailable(call);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(internal, { status: 503 }));
    await expectUnavailable(call);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(internal));
    await expectUnavailable(call);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: { message: internal } }));
    await expectUnavailable(call);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(null));
    await expectUnavailable(call);
  });

  it("does not read a transaction body or log environment secrets for a public target", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "84532");
    vi.stubEnv("ANVIL_DEV_SELLER_PRIVATE_KEY", "synthetic-not-a-key");
    const log = vi.spyOn(console, "log");
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    for (const route of routes) {
      const request = jsonRequest(route.body);
      const readBody = vi.spyOn(request, "json");
      await expectUnavailable(() => route.post(request));
      expect(readBody).not.toHaveBeenCalled();
    }
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("coherent local Anvil endpoints", () => {
  it.each(endpoints)("allows $name after checking Anvil", async ({ call, mock }) => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBe(JSON.stringify({
      jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1
    }));
    expect(vi.mocked(fetch).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(mock).mock.invocationCallOrder[0]);
  });
});
