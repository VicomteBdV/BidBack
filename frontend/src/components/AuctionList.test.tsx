import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAccount } from "wagmi";
import { describe, expect, it, vi } from "vitest";
import { AuctionList } from "@/components/AuctionList";
import type { AuctionsApiResponse, SerializedAuction } from "@/lib/auctionTypes";
import { testAddresses } from "@/test/fixtures";

vi.mock("wagmi", () => ({
  useAccount: vi.fn()
}));

function mockAccount(account: { address?: `0x${string}`; chainId?: number; isConnected: boolean }) {
  vi.mocked(useAccount).mockReturnValue(account as unknown as ReturnType<typeof useAccount>);
}

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

function auctionsResponse(auctions: SerializedAuction[], overrides: Partial<AuctionsApiResponse> = {}): AuctionsApiResponse {
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
    auctions,
    ...overrides
  };
}

function auctionLinks() {
  return screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/auctions/"));
}

describe("AuctionList", () => {
  it("renders readable lifecycle status, NFT previews, and result counters", async () => {
    mockAccount({ isConnected: false });
    mockAuctionListFetch(
      auctionsResponse([
        auctionFixture({
          auctionId: "2",
          highestBidder: testAddresses.primaryBidder,
          highestBid: "1000000000000000000",
          nftMetadata: {
            contractAddress: testAddresses.localNft,
            tokenId: "1",
            collectionName: "BidBack Demo Collection",
            collectionSymbol: "BID",
            metadataName: "Demo NFT #2",
            imageUrl: "https://images.example/2.png",
            status: "loaded"
          }
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
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ready to finalize").length).toBeGreaterThan(0);
    expect(screen.getByText("Finalize auction")).toBeInTheDocument();
    expect(screen.getByText("Demo NFT #2")).toBeInTheDocument();
    expect(screen.getByText("Metadata not loaded")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2 loaded auctions/)).toBeInTheDocument();
  });

  it("filters by Open, Ready to finalize, and Finalized status", async () => {
    mockAccount({ isConnected: false });
    mockAuctionListFetch(
      auctionsResponse([
        auctionFixture({ auctionId: "1", endTime: "1" }),
        auctionFixture({ auctionId: "2", endTime: "9999999999" }),
        auctionFixture({ auctionId: "3", state: 2, stateLabel: "FINALIZED", finalized: true })
      ])
    );

    render(<AuctionList />);

    expect(await screen.findByText("Auction #3")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "open" }
    });

    expect(screen.getByText("Auction #2")).toBeInTheDocument();
    expect(screen.queryByText("Auction #1")).not.toBeInTheDocument();
    expect(screen.queryByText("Auction #3")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "readyToFinalize" }
    });

    expect(screen.getByText("Auction #1")).toBeInTheDocument();
    expect(screen.queryByText("Auction #2")).not.toBeInTheDocument();
    expect(screen.queryByText("Auction #3")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "finalized" }
    });

    expect(screen.getByText("Auction #3")).toBeInTheDocument();
    expect(screen.queryByText("Auction #1")).not.toBeInTheDocument();
    expect(screen.queryByText("Auction #2")).not.toBeInTheDocument();
  });

  it("searches by auction ID, metadata name, and contract address", async () => {
    mockAccount({ isConnected: false });
    const customNft = "0x0000000000000000000000000000000000009999" as const;

    mockAuctionListFetch(
      auctionsResponse([
        auctionFixture({ auctionId: "1" }),
        auctionFixture({
          auctionId: "7",
          nft: customNft,
          tokenId: "42",
          nftMetadata: {
            contractAddress: customNft,
            tokenId: "42",
            metadataName: "Golden Browse NFT",
            collectionName: "Browse Collection",
            collectionSymbol: "BRW",
            status: "loaded"
          }
        })
      ])
    );

    render(<AuctionList />);

    expect(await screen.findByText("Auction #7")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), {
      target: { value: "golden" }
    });

    expect(screen.getByText("Auction #7")).toBeInTheDocument();
    expect(screen.queryByText("Auction #1")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), {
      target: { value: "auction #1" }
    });

    expect(screen.getByText("Auction #1")).toBeInTheDocument();
    expect(screen.queryByText("Auction #7")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), {
      target: { value: "0000009999" }
    });

    expect(screen.getByText("Auction #7")).toBeInTheDocument();
    expect(screen.queryByText("Auction #1")).not.toBeInTheDocument();
  });

  it("sorts newest first and ending soon", async () => {
    mockAccount({ isConnected: false });
    mockAuctionListFetch(
      auctionsResponse([
        auctionFixture({ auctionId: "1", endTime: "9999999999", highestBid: "100" }),
        auctionFixture({ auctionId: "2", endTime: "8888888888", highestBid: "300" }),
        auctionFixture({ auctionId: "3", endTime: "7777777777", highestBid: "200" })
      ])
    );

    render(<AuctionList />);

    expect(await screen.findByText("Auction #3")).toBeInTheDocument();
    expect(auctionLinks()[0]).toHaveTextContent("Auction #3");

    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), {
      target: { value: "endingSoon" }
    });

    expect(auctionLinks()[0]).toHaveTextContent("Auction #3");

    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), {
      target: { value: "highestBid" }
    });

    expect(auctionLinks()[0]).toHaveTextContent("Auction #2");
  });

  it("shows contextual empty states for no auctions and no matching filters", async () => {
    mockAccount({ isConnected: false });
    mockAuctionListFetch(auctionsResponse([]));

    const firstRender = render(<AuctionList />);

    expect(await screen.findByText(/No auctions found yet/)).toBeInTheDocument();

    firstRender.unmount();
    mockAuctionListFetch(auctionsResponse([auctionFixture()]));
    render(<AuctionList />);

    expect(await screen.findByText("Auction #1")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), {
      target: { value: "does not exist" }
    });

    expect(screen.getByText(/No auctions match the current search/)).toBeInTheDocument();
  });

  it("allows wallet-scoped filters when a wallet is connected", async () => {
    mockAccount({ address: testAddresses.primaryBidder, chainId: 31337, isConnected: true });
    mockAuctionListFetch(
      auctionsResponse([
        auctionFixture({ auctionId: "1", seller: testAddresses.seller }),
        auctionFixture({ auctionId: "2", seller: testAddresses.primaryBidder }),
        auctionFixture({ auctionId: "3", highestBidder: testAddresses.primaryBidder })
      ])
    );

    render(<AuctionList />);

    expect(await screen.findByText("Auction #3")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "createdByWallet" }
    });

    expect(screen.getByText("Auction #2")).toBeInTheDocument();
    expect(screen.queryByText("Auction #1")).not.toBeInTheDocument();
    expect(screen.queryByText("Auction #3")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "involvingWallet" }
    });

    expect(screen.getByText("Auction #2")).toBeInTheDocument();
    expect(screen.getByText("Auction #3")).toBeInTheDocument();
    expect(screen.queryByText("Auction #1")).not.toBeInTheDocument();
  });

  it("refetches with the selected limit", async () => {
    mockAccount({ isConnected: false });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(auctionsResponse([])), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AuctionList />);

    expect(await screen.findByText(/No auctions found yet/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Limit" }), {
      target: { value: "50" }
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith("/api/auctions?limit=50", { cache: "no-store" });
    });
  });
});
