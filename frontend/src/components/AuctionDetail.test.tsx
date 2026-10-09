import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuctionDetail } from "@/components/AuctionDetail";
import type { AuctionDetailApiResponse, SerializedAuction } from "@/lib/auctionTypes";
import { auctionDetailFixture, settledReadinessFixture, testAddresses } from "@/test/fixtures";

vi.mock("@/components/AuctionDevActions", () => ({
  AuctionDevActions: () => (
    <section>
      <h2>Local dev actions</h2>
      <p>Local dev only</p>
    </section>
  )
}));

const bidPanel = vi.hoisted(() => ({
  refresh: null as null | (() => Promise<void>),
  expectedChainId: null as number | null,
  expectedAuctionHouse: null as `0x${string}` | null
}));

vi.mock("@/components/WalletBidPanel", () => ({
  WalletBidPanel: ({
    onBidComplete,
    expectedChainId,
    expectedAuctionHouse
  }: {
    onBidComplete: () => Promise<void>;
    expectedChainId: number;
    expectedAuctionHouse: `0x${string}`;
  }) => {
    bidPanel.refresh = onBidComplete;
    bidPanel.expectedChainId = expectedChainId;
    bidPanel.expectedAuctionHouse = expectedAuctionHouse;
    return (
    <section>
      <h3>Wallet-signed bid</h3>
    </section>
  );
  }
}));

const finalizePanel = vi.hoisted(() => ({
  expectedChainId: null as number | null,
  expectedAuctionHouse: null as `0x${string}` | null,
  auction: null as SerializedAuction | null,
  refresh: null as null | (() => Promise<void>)
}));
vi.mock("@/components/WalletFinalizePanel", () => ({
  WalletFinalizePanel: (props: { expectedChainId: number; expectedAuctionHouse: `0x${string}`; auction: SerializedAuction; onFinalizeComplete: () => Promise<void> }) => {
    finalizePanel.expectedChainId = props.expectedChainId;
    finalizePanel.expectedAuctionHouse = props.expectedAuctionHouse;
    finalizePanel.auction = props.auction;
    finalizePanel.refresh = props.onFinalizeComplete;
    return (
    <section>
      <h3>Wallet-signed finalization</h3>
    </section>
  );
  }
}));

const claimPanel = vi.hoisted(() => ({
  expectedChainId: null as number | null,
  expectedAuctionHouse: null as `0x${string}` | null,
  auction: null as SerializedAuction | null,
  refresh: null as null | (() => Promise<void>)
}));
vi.mock("@/components/WalletClaimPanel", () => ({
  WalletClaimPanel: (props: { expectedChainId: number; expectedAuctionHouse: `0x${string}`; auction: SerializedAuction; onActionComplete: () => Promise<void> }) => {
    claimPanel.expectedChainId = props.expectedChainId;
    claimPanel.expectedAuctionHouse = props.expectedAuctionHouse;
    claimPanel.auction = props.auction;
    claimPanel.refresh = props.onActionComplete;
    return (
    <section>
      <h3>Wallet-signed claims / withdrawals</h3>
    </section>
  );
  }
}));

function mockAuctionDetailFetch(auction: SerializedAuction = auctionDetailFixture.auction,
  context: Pick<AuctionDetailApiResponse, "chainId" | "auctionHouse"> = auctionDetailFixture) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/auctions/1/history")) {
        return new Response(
          JSON.stringify({
            chainId: context.chainId,
            auctionHouse: context.auctionHouse,
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
        return new Response(JSON.stringify({ ...auctionDetailFixture, ...context, auction }), {
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
  it("reports a failed post-bid refresh to the wallet panel while preserving the auction", async () => {
    mockAuctionDetailFetch({ ...auctionDetailFixture.auction, state: 0, finalized: false,
      endTime: "9999999999", chainTimestamp: "1" });
    render(<AuctionDetail auctionId="1" />);
    await screen.findByRole("heading", { name: "Wallet-signed bid" });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "RPC unavailable" }), { status: 503 }));
    await act(async () => { await expect(bidPanel.refresh!()).rejects.toThrow("RPC unavailable"); });
    expect(screen.getByText("Auction refresh failed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "BidBack Demo NFT #1", level: 1 })).toBeInTheDocument();
  });
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
    expect(screen.getByRole("heading", { name: "Wallet-signed finalization" })).toBeInTheDocument();
    expect(finalizePanel.expectedChainId).toBe(auctionDetailFixture.chainId);
    expect(finalizePanel.expectedAuctionHouse).toBe(auctionDetailFixture.auctionHouse);
    expect(finalizePanel.auction).toMatchObject({ auctionId: auctionDetailFixture.auction.auctionId,
      seller: auctionDetailFixture.auction.seller, nft: auctionDetailFixture.auction.nft,
      tokenId: auctionDetailFixture.auction.tokenId, startPrice: auctionDetailFixture.auction.startPrice,
      startTime: auctionDetailFixture.auction.startTime, initialEndTime: auctionDetailFixture.auction.initialEndTime });
    expect(screen.queryByRole("heading", { name: "Wallet-signed bid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wallet-signed claims / withdrawals" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Economic transparency / Settlement breakdown" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bid history / Auction transparency" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Rules, contracts, and verification details"));
    expect(screen.getByRole("heading", { name: "Auction rules snapshot" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Technical details" })).toBeInTheDocument();
    expect(screen.getAllByText("BidBack Demo NFT #1").length).toBeGreaterThan(0);
    expect(screen.getByText("BidBack Demo Collection (BID)")).toBeInTheDocument();
  });

  it("passes refreshed displayed chain, house and same-ID lot fields to Finalize together", async () => {
    mockAuctionDetailFetch();
    render(<AuctionDetail auctionId="1" />);
    await screen.findByRole("heading", { name: "Wallet-signed finalization" });
    const refreshed = { ...auctionDetailFixture.auction, seller: testAddresses.secondBidder,
      tokenId: "9007199254740993", startPrice: "9007199254740995" };
    mockAuctionDetailFetch(refreshed, { chainId: 1, auctionHouse: testAddresses.localNft });
    await act(async () => { await finalizePanel.refresh!(); });
    expect(finalizePanel.expectedChainId).toBe(1);
    expect(finalizePanel.expectedAuctionHouse).toBe(testAddresses.localNft);
    expect(finalizePanel.auction).toMatchObject(refreshed);
  });

  it("selects the finalized action family without hiding its claims and withdrawals panel", async () => {
    mockAuctionDetailFetch({
      ...auctionDetailFixture.auction,
      state: 2,
      stateLabel: "FINALIZED",
      finalized: true,
      nftClaimed: false
    });

    render(<AuctionDetail auctionId="1" />);

    expect(await screen.findByRole("heading", { name: "Wallet-signed claims / withdrawals" })).toBeInTheDocument();
    expect(claimPanel.expectedChainId).toBe(auctionDetailFixture.chainId);
    expect(claimPanel.expectedAuctionHouse).toBe(auctionDetailFixture.auctionHouse);
    expect(claimPanel.auction).toMatchObject({ auctionId: auctionDetailFixture.auction.auctionId,
      seller: auctionDetailFixture.auction.seller, nft: auctionDetailFixture.auction.nft,
      tokenId: auctionDetailFixture.auction.tokenId, startPrice: auctionDetailFixture.auction.startPrice,
      startTime: auctionDetailFixture.auction.startTime, initialEndTime: auctionDetailFixture.auction.initialEndTime });
    expect(screen.queryByRole("heading", { name: "Wallet-signed bid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wallet-signed finalization" })).not.toBeInTheDocument();
  });

  it("passes refreshed displayed chain, house and same-ID lot fields to Claim together", async () => {
    const finalized = { ...auctionDetailFixture.auction, state: 2 as const, finalized: true, nftClaimed: false };
    mockAuctionDetailFetch(finalized);
    render(<AuctionDetail auctionId="1" />);
    await screen.findByRole("heading", { name: "Wallet-signed claims / withdrawals" });
    const refreshed = { ...finalized, seller: testAddresses.secondBidder, nft: testAddresses.secondBidder,
      tokenId: "9007199254740993", startPrice: "9007199254740995",
      startTime: "1800000000", initialEndTime: "1800000100" };
    mockAuctionDetailFetch(refreshed, { chainId: 1, auctionHouse: testAddresses.localNft });
    await act(async () => { await claimPanel.refresh!(); });
    expect(claimPanel.expectedChainId).toBe(1);
    expect(claimPanel.expectedAuctionHouse).toBe(testAddresses.localNft);
    expect(claimPanel.auction).toMatchObject(refreshed);
  });

  it("selects bidding for an open auction", async () => {
    mockAuctionDetailFetch({
      ...auctionDetailFixture.auction,
      state: 0,
      stateLabel: "OPEN",
      finalized: false,
      endTime: "9999999999"
    });

    render(<AuctionDetail auctionId="1" />);

    expect(await screen.findByRole("heading", { name: "Wallet-signed bid" })).toBeInTheDocument();
    expect(bidPanel.expectedChainId).toBe(auctionDetailFixture.chainId);
    expect(bidPanel.expectedAuctionHouse).toBe(auctionDetailFixture.auctionHouse);
    expect(screen.queryByRole("heading", { name: "Wallet-signed finalization" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wallet-signed claims / withdrawals" })).not.toBeInTheDocument();
  });

  it("keeps wallet claims accessible when economics are unavailable", async () => {
    mockAuctionDetailFetch({
      ...auctionDetailFixture.auction,
      state: 2,
      stateLabel: "FINALIZED",
      finalized: true,
      nftClaimed: true,
      economics: undefined
    });

    render(<AuctionDetail auctionId="1" />);

    expect(await screen.findByRole("heading", { name: "Wallet-signed claims / withdrawals" })).toBeInTheDocument();
    expect(screen.queryByText("Settled")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wallet-signed bid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wallet-signed finalization" })).not.toBeInTheDocument();

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
  it("keeps direct wallet reads accessible even with a proven Settled snapshot", async () => {
    mockAuctionDetailFetch({ ...auctionDetailFixture.auction, state: 2, finalized: true, nftClaimed: true,
      economics: undefined, settlementReadiness: settledReadinessFixture });
    render(<AuctionDetail auctionId="1" />);
    expect(await screen.findByRole("heading", { name: "Wallet-signed claims / withdrawals" })).toBeInTheDocument();
    expect(screen.getAllByText("Settled").length).toBeGreaterThan(0);
    expect(screen.getByText(/They do not establish which auction/)).toBeInTheDocument();
  });

});
