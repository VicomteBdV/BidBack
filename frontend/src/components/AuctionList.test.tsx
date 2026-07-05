import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuctionList } from "@/components/AuctionList";
import type { AuctionsApiResponse, SerializedAuction } from "@/lib/auctionTypes";
import { testAddresses } from "@/test/fixtures";

function auctionFixture(overrides: Partial<SerializedAuction> = {}): SerializedAuction {
  return {
    auctionId: "1",
    seller: testAddresses.seller,
    nft: testAddresses.localNft,
    tokenId: "1",
    startPrice: "1000000000000000000",
    startTime: "1000",
    initialEndTime: "9999999999",
    endTime: "9999999999",
    extensionsUsed: 0,
    state: 0,
    stateLabel: "OPEN",
    highestBidder: "0x0000000000000000000000000000000000000000",
    highestBid: "0",
    participantCount: "0",
    bidCount: "0",
    nftClaimed: false,
    finalized: false,
    ...overrides
  };
}

function mockAuctionListFetch(response: AuctionsApiResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    )
  );
}

function auctionsResponse(auctions: SerializedAuction[]): AuctionsApiResponse {
  return {
    chainId: 31337,
    auctionHouse: testAddresses.auctionHouse,
    nextAuctionId: String(auctions.length + 1),
    count: auctions.length,
    discovery: {
      strategy: "events",
      limit: 25,
      requestedLimit: 25
    },
    auctions
  };
}

describe("AuctionList", () => {
  it("renders readable lifecycle status for open and expired auctions", async () => {
    mockAuctionListFetch(
      auctionsResponse([
        auctionFixture({
          auctionId: "2",
          highestBidder: testAddresses.primaryBidder,
          highestBid: "1000000000000000000"
        }),
        auctionFixture({
          auctionId: "1",
          endTime: "1",
          highestBidder: testAddresses.secondBidder,
          highestBid: "1200000000000000000"
        })
      ])
    );

    render(<AuctionList />);

    expect(await screen.findByText("Auction #2")).toBeInTheDocument();
    expect(screen.getByText("Auction #1")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Ready to finalize")).toBeInTheDocument();
    expect(screen.getByText("Finalize auction")).toBeInTheDocument();
  });

  it("renders a clear empty state", async () => {
    mockAuctionListFetch(auctionsResponse([]));

    render(<AuctionList />);

    expect(await screen.findByText(/No auctions found yet/)).toBeInTheDocument();
  });
});
