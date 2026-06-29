import React from "react";
import { render, screen } from "@testing-library/react";
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
  it("renders the main detail page sections", async () => {
    mockAuctionDetailFetch();

    render(<AuctionDetail auctionId="1" />);

    expect(await screen.findByRole("heading", { name: "Auction overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Economic state" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local dev actions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wallet-signed actions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Technical details" })).toBeInTheDocument();
  });
});