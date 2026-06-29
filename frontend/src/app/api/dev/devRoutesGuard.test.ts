import { describe, expect, it, vi } from "vitest";
import { POST as createAuctionPost } from "@/app/api/dev/create-auction/route";
import { POST as placeBidPost } from "@/app/api/dev/place-bid/route";
import { POST as finalizePost } from "@/app/api/dev/finalize/route";
import { POST as claimNftPost } from "@/app/api/dev/claim-nft/route";
import { POST as claimRefundPost } from "@/app/api/dev/claim-refund/route";
import { POST as claimRewardPost } from "@/app/api/dev/claim-reward/route";
import { POST as withdrawSellerPost } from "@/app/api/dev/withdraw-seller-proceeds/route";
import { POST as withdrawFeesPost } from "@/app/api/dev/withdraw-protocol-fees/route";
import { createLocalDevAuction } from "@/lib/server/auctionCreator";
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
  createLocalDevAuction: vi.fn()
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

function expectNoWriterCalled() {
  for (const writer of writerMocks) {
    expect(writer).not.toHaveBeenCalled();
  }
}

describe("/api/dev route guards", () => {
  it.each(routes)("refuses $name when ENABLE_LOCAL_DEV_ACTIONS is not true", async ({ post, body }) => {
    process.env.ENABLE_LOCAL_DEV_ACTIONS = "false";
    delete process.env.ANVIL_RPC_URL;

    const response = await post(jsonRequest(body));
    const payload = (await response.json()) as { status?: string; error?: string; localDevOnly?: boolean };

    expect(response.status).toBe(500);
    expect(payload.status).toBe("error");
    expect(payload.localDevOnly).toBe(true);
    expect(payload.error).toContain("Local dev actions are disabled");
    expectNoWriterCalled();
  });

  it.each(routes)("refuses $name when Anvil chainId is not 31337", async ({ post, body }) => {
    process.env.ENABLE_LOCAL_DEV_ACTIONS = "true";
    process.env.ANVIL_RPC_URL = "http://127.0.0.1:8545";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: "0x1"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
      )
    );

    const response = await post(jsonRequest(body));
    const payload = (await response.json()) as { status?: string; error?: string; localDevOnly?: boolean };

    expect(response.status).toBe(500);
    expect(payload.status).toBe("error");
    expect(payload.localDevOnly).toBe(true);
    expect(payload.error).toContain("Local dev actions require Anvil chainId 31337");
    expectNoWriterCalled();
  });
});