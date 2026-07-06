import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuctionHistoryPanel } from "@/components/AuctionHistoryPanel";
import { auctionDetailFixture } from "@/test/fixtures";

function mockHistoryFetch(response: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(response), {
        status,
        headers: {
          "content-type": "application/json"
        }
      })
    )
  );
}

describe("AuctionHistoryPanel", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_BLOCK_EXPLORER_URL", "https://explorer.example");
  });

  it("renders bid history, transparency values, and explorer transaction links", async () => {
    mockHistoryFetch({
      chainId: auctionDetailFixture.chainId,
      auctionHouse: auctionDetailFixture.auctionHouse,
      auctionId: auctionDetailFixture.auction.auctionId,
      history: auctionDetailFixture.auction.history
    });

    render(<AuctionHistoryPanel auction={auctionDetailFixture.auction} />);

    expect(screen.getByRole("heading", { name: "Bid history / Auction transparency" })).toBeInTheDocument();
    expect(screen.getByText("1.2 ETH")).toBeInTheDocument();
    expect(screen.getByText("Visible configured refunds")).toBeInTheDocument();
    expect(await screen.findAllByText("Bid placed")).toHaveLength(2);
    expect(screen.getByTitle("0x1111111111111111111111111111111111111111111111111111111111111111")).toHaveAttribute(
      "href",
      "https://explorer.example/tx/0x1111111111111111111111111111111111111111111111111111111111111111"
    );
  });

  it("renders a clean empty state when no bids or logs are available", async () => {
    mockHistoryFetch({
      chainId: auctionDetailFixture.chainId,
      auctionHouse: auctionDetailFixture.auctionHouse,
      auctionId: auctionDetailFixture.auction.auctionId,
      history: {
        ...auctionDetailFixture.auction.history,
        source: "bid-records-only",
        bids: [],
        events: []
      }
    });

    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);

    expect(await screen.findByText("No bids have been recorded for this auction yet.")).toBeInTheDocument();
    expect(screen.getByText(/No matching logs were returned by the RPC/)).toBeInTheDocument();
  });

  it("keeps the panel usable when history cannot be loaded", async () => {
    mockHistoryFetch({ error: "RPC log range unavailable" }, 503);

    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);

    expect(await screen.findByText(/RPC log range unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Highest bid")).toBeInTheDocument();
    expect(screen.getByText("Seller proceeds")).toBeInTheDocument();
  });
});
