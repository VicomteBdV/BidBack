import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WalletActionQueueSection } from "@/components/WalletActionQueueSection";
import type { WalletAuctionQueueItem, WalletGlobalActionItem } from "@/lib/walletActionQueue";

function queueItem(overrides: Partial<WalletAuctionQueueItem> = {}): WalletAuctionQueueItem {
  return {
    auctionId: "1",
    href: "/auctions/1",
    state: 2,
    stateLabel: "FINALIZED",
    lifecycleLabel: "Finalized",
    endTime: "2000",
    roles: ["bidder"],
    reason: "Two auction-specific wallet actions are currently available.",
    partial: false,
    actions: [
      {
        kind: "claimRefund",
        label: "Claim refund",
        description: "A refundable wallet cap is currently available for this auction.",
        amount: "1000000000000000000",
        priority: 20
      },
      {
        kind: "claimReward",
        label: "Claim reward",
        description: "A positive redistribution entitlement is currently claimable.",
        amount: "10000000000000000",
        priority: 30
      }
    ],
    ...overrides
  };
}

const globalAction: WalletGlobalActionItem = {
  kind: "withdrawSellerProceeds",
  label: "Withdraw seller proceeds",
  description: "This is a global wallet credit held by EscrowVault.",
  priority: 10,
  amount: "2000000000000000000",
  targetAuctionId: "1",
  href: "/auctions/1"
};

function renderSection(
  items: WalletAuctionQueueItem[],
  globalActions: WalletGlobalActionItem[] = [],
  initialLimit?: number
) {
  return render(
    <WalletActionQueueSection
      title="Action required"
      description="Immediate wallet actions."
      items={items}
      globalActions={globalActions}
      emptyTitle="No immediate action"
      emptyMessage="Nothing is currently available."
      initialLimit={initialLimit}
    />
  );
}

describe("WalletActionQueueSection", () => {
  it("renders an accessible empty state", () => {
    renderSection([]);

    expect(screen.getByRole("heading", { name: "Action required" })).toBeInTheDocument();
    expect(screen.getByText("No immediate action")).toBeInTheDocument();
    expect(screen.getByText("Nothing is currently available.")).toBeInTheDocument();
  });

  it("keeps multiple actions grouped in one auction card with native links", () => {
    renderSection([queueItem({ roles: ["bidder", "winner"] })]);

    expect(screen.getAllByText("Auction #1")).toHaveLength(1);
    expect(screen.getByText("Bidder")).toBeInTheDocument();
    expect(screen.getByText("Winner")).toBeInTheDocument();
    expect(screen.getByText(/Two auction-specific wallet actions/)).toBeInTheDocument();
    const refundLink = screen.getByRole("link", { name: "Claim refund" });
    const rewardLink = screen.getByRole("link", { name: "Claim reward" });
    expect(refundLink).toHaveAttribute("href", "/auctions/1");
    expect(rewardLink).toHaveAttribute("href", "/auctions/1");
    refundLink.focus();
    expect(refundLink).toHaveFocus();
  });

  it("renders global wallet credits distinctly from auction actions", () => {
    renderSection([], [globalAction]);

    expect(screen.getByText("Global wallet credit")).toBeInTheDocument();
    expect(screen.getByText("Withdraw seller proceeds")).toBeInTheDocument();
    expect(screen.getByText("2 ETH")).toBeInTheDocument();
    expect(screen.getByText(/provided only as a navigation target/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open withdrawal panel" })).toHaveAttribute("href", "/auctions/1");
  });

  it("does not invent an amount when an auction action has none", () => {
    renderSection([
      queueItem({
        actions: [
          {
            kind: "finalize",
            label: "Finalize auction",
            description: "The auction end time has passed.",
            priority: 40
          }
        ]
      })
    ]);

    expect(screen.getByRole("link", { name: "Finalize auction" })).toBeInTheDocument();
    expect(screen.queryByText("0 ETH")).not.toBeInTheDocument();
  });

  it("surfaces partial wallet reads without hiding the auction", () => {
    renderSection([
      queueItem({
        partial: true,
        partialReason: "RPC timeout",
        actions: []
      })
    ]);

    expect(screen.getByText("Partial wallet data")).toBeInTheDocument();
    expect(screen.getByText("RPC timeout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View auction" })).toHaveAttribute("href", "/auctions/1");
  });

  it("reveals bounded history with a native show-more button", () => {
    const items = Array.from({ length: 7 }, (_, index) =>
      queueItem({
        auctionId: String(index + 1),
        href: `/auctions/${index + 1}`,
        actions: [],
        reason: "Settled auction."
      })
    );
    renderSection(items, [], 5);

    expect(screen.queryByText("Auction #6")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getByText("Auction #6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });
});
