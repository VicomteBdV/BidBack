import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuctionEconomicsPanel } from "@/components/AuctionEconomicsPanel";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { auctionDetailFixture, testAddresses } from "@/test/fixtures";

function finalizedAuction(): SerializedAuction {
  return {
    ...auctionDetailFixture.auction,
    state: 2,
    stateLabel: "FINALIZED",
    finalized: true,
    economics: {
      ...auctionDetailFixture.auction.economics!,
      settlement: {
        finalized: true,
        winner: testAddresses.secondBidder,
        distributionVault: testAddresses.distributionVault,
        finalPrice: "1200000000000000000",
        sellerProceeds: "1170000000000000000",
        feeAmount: "10000000000000000",
        distributionReserve: "20000000000000000"
      },
      distribution: {
        opened: true,
        totalAssigned: "15000000000000000",
        totalClaimed: "5000000000000000"
      },
      seller: {
        ...auctionDetailFixture.auction.economics!.seller,
        credit: "1170000000000000000",
        canWithdraw: true
      },
      feeRecipient: {
        ...auctionDetailFixture.auction.economics!.feeRecipient,
        credit: "10000000000000000",
        canWithdraw: true
      },
      primaryBidder: {
        ...auctionDetailFixture.auction.economics!.primaryBidder,
        refundableAmount: "1000000000000000000",
        rewardEntitlement: "15000000000000000"
      }
    }
  };
}

describe("AuctionEconomicsPanel", () => {
  it("renders pending settlement values and economic parameter snapshots for open auctions", () => {
    render(<AuctionEconomicsPanel auction={auctionDetailFixture.auction} />);

    expect(screen.getByRole("heading", { name: "Economic transparency / Settlement breakdown" })).toBeInTheDocument();
    expect(screen.getByText("Current highest bid")).toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    expect(screen.getByText("BidBack fee bps")).toBeInTheDocument();
    expect(screen.getByText("Redistribution bps")).toBeInTheDocument();
    expect(screen.getByText("Rewards are conditional and can be zero; this UI must not be read as a yield promise.")).toBeInTheDocument();
  });

  it("renders finalized settlement values when they are available", () => {
    render(<AuctionEconomicsPanel auction={finalizedAuction()} />);

    expect(screen.getByText("Final price")).toBeInTheDocument();
    expect(screen.getAllByText("1.2 ETH").length).toBeGreaterThan(0);
    expect(screen.getByText("Seller proceeds")).toBeInTheDocument();
    expect(screen.getAllByText("1.17 ETH").length).toBeGreaterThan(0);
    expect(screen.getByText("Protocol fees")).toBeInTheDocument();
    expect(screen.getAllByText("0.01 ETH").length).toBeGreaterThan(0);
    expect(screen.getByText("Distribution opened")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("shows unavailable fields without crashing when economics are missing", () => {
    render(<AuctionEconomicsPanel auction={{ ...auctionDetailFixture.auction, economics: undefined }} />);

    expect(screen.getByText(/Detailed economic reads are unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Unavailable fields:/)).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  });
});
