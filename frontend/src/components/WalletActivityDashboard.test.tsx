import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useAccount } from "wagmi";
import { describe, expect, it, vi } from "vitest";
import { WalletActivityDashboard } from "@/components/WalletActivityDashboard";
import { buildWalletActivity, type WalletActivityApiResponse, type WalletActivityAuction, type WalletAuctionPosition } from "@/lib/walletActivity";
import { testAddresses } from "@/test/fixtures";

vi.mock("wagmi", () => ({
  useAccount: vi.fn()
}));

const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

function mockAccount(account: { address?: `0x${string}`; chainId?: number; isConnected: boolean }) {
  vi.mocked(useAccount).mockReturnValue(account as unknown as ReturnType<typeof useAccount>);
}

function baseAuction(overrides: Partial<WalletActivityAuction> = {}): WalletActivityAuction {
  return {
    auctionId: "1",
    seller: testAddresses.seller,
    nft: testAddresses.localNft,
    tokenId: "1",
    startPrice: "1000000000000000000",
    startTime: "1000",
    initialEndTime: "2000",
    endTime: "2000",
    extensionsUsed: 0,
    state: 0,
    stateLabel: "OPEN",
    highestBidder: zeroAddress,
    highestBid: "0",
    participantCount: "0",
    bidCount: "0",
    nftClaimed: false,
    finalized: false,
    ...overrides
  };
}

function walletPosition(overrides: Partial<WalletAuctionPosition> = {}): WalletAuctionPosition {
  return {
    cap: "0",
    refundableAmount: "0",
    refundClaimed: false,
    rewardEntitlement: "0",
    rewardClaimed: false,
    sellerCredit: "0",
    protocolFeeCredit: "0",
    auctionFeeRecipient: testAddresses.feeRecipient,
    isAuctionFeeRecipient: false,
    ...overrides
  };
}

function activityResponse(
  auctions: WalletActivityAuction[],
  wallet: `0x${string}` = testAddresses.secondBidder
): WalletActivityApiResponse {
  return {
    chainId: 31337,
    auctionHouse: testAddresses.auctionHouse,
    wallet,
    count: auctions.length,
    discovery: {
      strategy: "event-scoped",
      limit: 100,
      requestedLimit: 100,
      returnedIds: auctions.length
    },
    activity: buildWalletActivity(auctions, wallet, 2500)
  };
}

function mockActivityFetch(payload: WalletActivityApiResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    )
  );
}

describe("WalletActivityDashboard", () => {
  it("shows a wallet connection warning without blocking read-only mode", () => {
    mockAccount({ isConnected: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<WalletActivityDashboard />);

    expect(screen.getByText("My activity / My actions")).toBeInTheDocument();
    expect(screen.getByText(/Connect a wallet to see auctions and actions related to your address/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an empty activity state for a connected wallet with no related auctions", async () => {
    mockAccount({ address: testAddresses.primaryBidder, chainId: 31337, isConnected: true });
    mockActivityFetch(activityResponse([], testAddresses.primaryBidder));

    render(<WalletActivityDashboard />);

    expect(await screen.findByText(/No activity found for this wallet/)).toBeInTheDocument();
    expect(screen.getByText("Auctions created")).toBeInTheDocument();
    expect(screen.getByText("Wallet events")).toBeInTheDocument();
  });

  it("distinguishes an unavailable activity read from an empty wallet", async () => {
    mockAccount({ address: testAddresses.primaryBidder, chainId: 31337, isConnected: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "RPC activity read unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        })
      )
    );

    render(<WalletActivityDashboard />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Wallet activity could not be loaded");
    expect(screen.queryByText(/No activity found for this wallet/)).not.toBeInTheDocument();
  });

  it("shows next actions with links to auction detail pages", async () => {
    mockAccount({ address: testAddresses.secondBidder, chainId: 31337, isConnected: true });
    mockActivityFetch(
      activityResponse([
        baseAuction({
          state: 2,
          stateLabel: "FINALIZED",
          finalized: true,
          highestBidder: testAddresses.secondBidder,
          nftClaimed: false,
          walletPosition: walletPosition({ cap: "1200000000000000000" })
        })
      ])
    );

    render(<WalletActivityDashboard />);

    const actionLink = await screen.findByRole("link", { name: "Claim NFT" });

    expect(actionLink).toHaveAttribute("href", "/auctions/1");
    expect(screen.getByRole("heading", { name: "Action required" })).toBeInTheDocument();
    expect(screen.getByText("Auction #1")).toBeInTheDocument();
    expect(screen.getByText("Available actions").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Won")).toBeInTheDocument();
  });

  it("renders active related auctions in Watching without a required bid action", async () => {
    mockAccount({ address: testAddresses.primaryBidder, chainId: 31337, isConnected: true });
    mockActivityFetch(
      activityResponse(
        [
          baseAuction({
            initialEndTime: "3000",
            endTime: "3000",
            highestBidder: testAddresses.secondBidder,
            walletPosition: walletPosition({ cap: "1000000000000000000" })
          })
        ],
        testAddresses.primaryBidder
      )
    );

    render(<WalletActivityDashboard />);

    const watchingHeading = await screen.findByRole("heading", { name: "Watching" });
    expect(watchingHeading).toBeInTheDocument();
    expect(watchingHeading.closest("section")).toHaveTextContent("Auction #1");
    expect(screen.getByText(/not the current highest bidder/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Bid again/i })).not.toBeInTheDocument();
    expect(screen.getByText("Available actions").parentElement).toHaveTextContent("0");
    expect(screen.getByText("Auction-specific actions").parentElement).toHaveTextContent("0");
    expect(screen.queryByRole("link", { name: "Finalize auction" })).not.toBeInTheDocument();
  });

  it("renders a seller credit as a distinct global action", async () => {
    mockAccount({ address: testAddresses.seller, chainId: 31337, isConnected: true });
    const auctions = [
      baseAuction({
        state: 2,
        stateLabel: "FINALIZED",
        finalized: true,
        nftClaimed: true,
        highestBidder: testAddresses.secondBidder,
        walletPosition: walletPosition()
      })
    ];
    const payload = activityResponse(auctions, testAddresses.seller);
    payload.activity = buildWalletActivity(auctions, testAddresses.seller, 2500, {
      globalCredits: { sellerCredit: "2000000000000000000" }
    });
    mockActivityFetch(payload);

    render(<WalletActivityDashboard />);

    expect(await screen.findByText("Global wallet credit")).toBeInTheDocument();
    expect(screen.getByText("Withdraw seller proceeds")).toBeInTheDocument();
    expect(screen.getByText(/not attributed to a single auction/i)).toBeInTheDocument();
  });

  it("shows a bounded discovery warning", async () => {
    mockAccount({ address: testAddresses.primaryBidder, chainId: 31337, isConnected: true });
    mockActivityFetch({
      ...activityResponse([], testAddresses.primaryBidder),
      discovery: {
        strategy: "bounded-fallback",
        limit: 100,
        requestedLimit: 100,
        returnedIds: 100,
        warning: "Wallet activity event scan failed; used bounded nextAuctionId fallback."
      }
    });

    render(<WalletActivityDashboard />);

    expect(await screen.findByText("Bounded fallback")).toBeInTheDocument();
    expect(screen.getByText(/used bounded nextAuctionId fallback/)).toBeInTheDocument();
  });

  it("shows a wrong-network warning while keeping the activity read-only", async () => {
    mockAccount({ address: testAddresses.secondBidder, chainId: 1, isConnected: true });
    mockActivityFetch(
      activityResponse([
        baseAuction({
          state: 2,
          stateLabel: "FINALIZED",
          finalized: true,
          highestBidder: testAddresses.secondBidder,
          nftClaimed: false,
          walletPosition: walletPosition({ cap: "1200000000000000000" })
        })
      ])
    );

    render(<WalletActivityDashboard />);

    expect(await screen.findByRole("link", { name: "Claim NFT" })).toHaveAttribute("href", "/auctions/1");
    expect(screen.getByText(/Wallet connected, but not on the target chain/)).toBeInTheDocument();
  });

  it("shows recent history first and expands older entries", async () => {
    mockAccount({ address: testAddresses.primaryBidder, chainId: 31337, isConnected: true });
    const auctions = Array.from({ length: 7 }, (_, index) =>
      baseAuction({
        auctionId: String(index + 1),
        state: 2,
        stateLabel: "FINALIZED",
        finalized: true,
        endTime: String(2000 + index),
        highestBidder: testAddresses.secondBidder,
        nftClaimed: true,
        walletPosition: walletPosition({ cap: "1", refundClaimed: true })
      })
    );
    mockActivityFetch(activityResponse(auctions, testAddresses.primaryBidder));

    render(<WalletActivityDashboard />);

    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.getByText("Auction #7")).toBeInTheDocument();
    expect(screen.queryByText("Auction #2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getByText("Auction #2")).toBeInTheDocument();
    expect(screen.getAllByText("Auction #7")).toHaveLength(1);
  });
});
