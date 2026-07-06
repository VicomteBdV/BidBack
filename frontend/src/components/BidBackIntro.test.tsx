import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BidBackIntro } from "@/components/BidBackIntro";

describe("BidBackIntro", () => {
  it("explains the MVP auction flow and testnet constraints", () => {
    render(<BidBackIntro />);

    expect(screen.getByRole("heading", { name: "NFT auctions with conditional redistribution" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it works" })).toBeInTheDocument();
    expect(screen.getByText(/Seller lists an existing ERC-721 NFT/)).toBeInTheDocument();
    expect(screen.getByText(/Outbid bidders can claim refunds separately from rewards/)).toBeInTheDocument();
    expect(screen.getByText(/Eligible losing bidders may claim rewards only if redistribution conditions are met/)).toBeInTheDocument();
    expect(screen.getByText("No guaranteed reward")).toBeInTheDocument();
    expect(screen.getByText("Not lending, derivatives, or gambling")).toBeInTheDocument();
    expect(screen.getByText("Use test assets only")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Smoke test checklist" })).toHaveAttribute(
      "href",
      "https://github.com/VicomteBdV/BidBack/blob/main/docs/BASE_SEPOLIA_SMOKE_TEST.md"
    );
  });
});
