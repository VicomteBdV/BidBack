import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuctionDetail } from "@/components/AuctionDetail";
import { auctionDetailFixture } from "@/test/fixtures";

vi.mock("@/components/AuctionDevActions", () => ({
  AuctionDevActions: () => (
    <section>
      <h2>Local dev actions</h2>
      <p>Local dev only</p>
    </section>
  )
}));

vi.mock("@/components/WalletBidPanel", () => ({
  WalletBidPanel: () => (
    <section>
      <h3>Wallet-signed bid</h3>
    </section>
  )
}));

vi.mock("@/components/WalletFinalizePanel", () => ({
  WalletFinalizePanel: () => (
    <section>
      <h3>Wallet-signed finalization</h3>
    </section>
  )
}));

vi.mock("@/components/WalletClaimPanel", () => ({
  WalletClaimPanel: () => (
    <section>
      <h3>Wallet-signed claims / withdrawals</h3>
    </section>
  )
}));

function mockAuctionDetailFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/auctions/1/history")) {
        return new Response(
          JSON.stringify({
            chainId: auctionDetailFixture.chainId,
            auctionHouse: auctionDetailFixture.auctionHouse,
            auctionId: auctionDetailFixture.auction.auctionId,
            history: auctionDetailFixture.auction.history
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url.includes("/api/auctions/1")) {
        return new Response(JSON.stringify(auctionDetailFixture), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: {
          "content-type": "application/json"
        }
      });
    })
  );
}

describe("AuctionDetail", () => {
  it("renders the consolidated detail page sections", async () => {
    mockAuctionDetailFetch();

    render(<AuctionDetail auctionId="1" />);

    expect(await screen.findByRole("heading", { name: "BidBack Demo NFT #1", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wallet-signed actions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local dev actions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Auction lifecycle" })).toBeInTheDocument();
    const lifecycleTimeline = screen.getByRole("list", { name: "Auction lifecycle progression" });
    expect(lifecycleTimeline).toHaveTextContent("Listed");
    expect(lifecycleTimeline).toHaveTextContent("Bidding");
    expect(lifecycleTimeline).toHaveTextContent("Auction ended");
    expect(lifecycleTimeline).toHaveTextContent("Finalization");
    expect(lifecycleTimeline).toHaveTextContent("Claims");
    expect(lifecycleTimeline).toHaveTextContent("Settlement");
    expect(screen.getByLabelText("Finalization: Current")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("heading", { name: "Economic transparency / Settlement breakdown" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bid history / Auction transparency" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Rules, contracts, and verification details"));
    expect(screen.getByRole("heading", { name: "Auction rules snapshot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Technical details" })).toBeInTheDocument();
    expect(screen.getAllByText("BidBack Demo NFT #1").length).toBeGreaterThan(0);
    expect(screen.getByText("BidBack Demo Collection (BID)")).toBeInTheDocument();
  });

  it("keeps read-only panels visible when a refresh fails", async () => {
    let detailReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("/history")) {
          return new Response(JSON.stringify({ history: auctionDetailFixture.auction.history }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }

        detailReads += 1;
        if (detailReads === 1) {
          return new Response(JSON.stringify(auctionDetailFixture), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ error: "RPC refresh unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        });
      })
    );

    render(<AuctionDetail auctionId="1" />);
    expect(await screen.findByRole("heading", { name: "BidBack Demo NFT #1", level: 1 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh auction" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Auction refresh failed");
    expect(screen.getByRole("heading", { name: "Economic transparency / Settlement breakdown" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bid history / Auction transparency" })).toBeInTheDocument();
  });
});
