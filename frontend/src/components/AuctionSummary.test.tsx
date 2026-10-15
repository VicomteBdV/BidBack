import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuctionSummary } from "@/components/AuctionSummary";
import { auctionDetailFixture } from "@/test/fixtures";

describe("AuctionSummary", () => {
  it("keeps the unique lot identity, complete artwork and unchanged action in a readable source sequence", () => {
    const auction = auctionDetailFixture.auction;
    const { container } = render(
      <AuctionSummary auction={auction} participation={<button>Review wallet action</button>} />
    );

    expect(screen.getAllByRole("heading", { name: "BidBack Demo NFT #1" })).toHaveLength(1);
    expect(screen.getByText("BidBack Demo Collection (BID)")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "NFT preview: BidBack Demo NFT #1" })).toHaveClass("object-contain");
    expect(screen.getByText("Current price")).toBeInTheDocument();
    expect(screen.getByText("Time status")).toBeInTheDocument();
    expect(screen.getByText("Next action")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review wallet action" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About the artwork" }).parentElement).toHaveTextContent(auction.nftMetadata!.description!);

    const scene = container.querySelector(".auction-participation-layout")!;
    const sequence = Array.from(scene.children);
    expect(within(sequence[0] as HTMLElement).getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(within(sequence[1] as HTMLElement).getByRole("img")).toBeInTheDocument();
    expect(within(sequence[2] as HTMLElement).getByText("Current price")).toBeInTheDocument();
    expect(within(sequence[3] as HTMLElement).getByRole("button", { name: "Review wallet action" })).toBeInTheDocument();
  });

  it("retains the real token and exact metadata failure without substituting conceptual art", () => {
    render(
      <AuctionSummary auction={{
        ...auctionDetailFixture.auction,
        nftMetadata: {
          contractAddress: auctionDetailFixture.auction.nft,
          tokenId: auctionDetailFixture.auction.tokenId,
          status: "fetch-failed",
          errorMessage: "Metadata endpoint unavailable"
        }
      }} />
    );

    expect(screen.getByRole("heading", { level: 1, name: `Token #${auctionDetailFixture.auction.tokenId}` })).toBeInTheDocument();
    expect(screen.getByText("Metadata fetch failed")).toBeInTheDocument();
    expect(screen.getByText("Metadata endpoint unavailable")).toBeInTheDocument();
    expect(screen.getByText("Artwork unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Conceptual artwork/)).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
