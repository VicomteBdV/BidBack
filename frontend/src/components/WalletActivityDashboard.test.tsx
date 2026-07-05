import React from "react";
import { render, screen } from "@testing-library/react";
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

    const actionLink = await screen.findByRole("link", { name: /Claim NFT from Auction #1/ });

    expect(actionLink).toHaveAttribute("href", "/auctions/1");
    expect(screen.getByText("Won")).toBeInTheDocument();
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
    mockAccount({ address: testAddresses.primaryBidder, chainId: 1, isConnected: true });
    mockActivityFetch(activityResponse([], testAddresses.primaryBidder));

    render(<WalletActivityDashboard />);

    expect(await screen.findByText(/No activity found for this wallet/)).toBeInTheDocument();
    expect(screen.getByText(/Wallet connected, but not on the target chain/)).toBeInTheDocument();
  });
});
