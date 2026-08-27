import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BidBackIntro } from "@/components/BidBackIntro";

describe("BidBackIntro", () => {
  it("presents the marketplace proposition and controlled-testnet safeguards", () => {
    render(<BidBackIntro />);

    expect(screen.getByRole("heading", { name: "The auction matters, even when you do not win." })).toBeInTheDocument();
    expect(screen.getByText(/Browse live NFT auctions with refundable losing caps/)).toBeInTheDocument();
    expect(screen.getByText(/redistribution is conditional and never guaranteed/)).toBeInTheDocument();
    expect(screen.getByText(/Test assets only/)).toBeInTheDocument();
    expect(screen.getByText(/Gas fees are separate and/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Participation and test checklist →" })).toHaveAttribute(
      "href",
      "https://github.com/VicomteBdV/BidBack/blob/main/docs/BASE_SEPOLIA_SMOKE_TEST.md"
    );
  });
});
