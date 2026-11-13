import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuctionRulesSnapshot } from "@/components/AuctionRulesSnapshot";
import { amountRankFormulaFixture, auctionDetailFixture } from "@/test/fixtures";

describe("AuctionRulesSnapshot formula disclosure", () => {
  it("explains captured chronological weights, winner exclusion and whole-wei rounding", () => {
    render(<AuctionRulesSnapshot snapshot={{ ...auctionDetailFixture.auction.paramsSnapshot!, rankSoftness: "8" }} formula={amountRankFormulaFixture} />);
    expect(screen.getByRole("heading", { name: "Amount and chronological rank" })).toBeInTheDocument();
    expect(screen.getByText(/captured h is 8/)).toBeInTheDocument();
    expect(screen.getByText(/Rank counts all accepted bids/)).toBeInTheDocument();
    expect(screen.getByText(/winner's entire score is excluded/i)).toBeInTheDocument();
    expect(screen.getByText(/ties follow first participation order/i)).toBeInTheDocument();
    expect(screen.queryByText("Alpha weight")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy per-user cap parameter")).not.toBeInTheDocument();
    expect(screen.getByText(/do not independently verify deployed bytecode/)).toBeInTheDocument();
  });
  it("retains legacy fields while leaving unknown formula identification unavailable", () => {
    render(<AuctionRulesSnapshot snapshot={auctionDetailFixture.auction.paramsSnapshot} formula={{ ...amountRankFormulaFixture, status: "unavailable" }} />);
    expect(screen.getByText(/Active scoring formula unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Alpha weight")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Amount and chronological rank" })).not.toBeInTheDocument();
  });
  it("keeps unavailable snapshots and independent fee errors visible", () => {
    render(<AuctionRulesSnapshot error="Snapshot RPC failed." feeRecipientSnapshotError="Fee routing unavailable." />);
    expect(screen.getByText("Snapshot RPC failed.")).toBeInTheDocument();
    expect(screen.getByText("Fee routing unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("Alpha weight")).not.toBeInTheDocument();
  });
});
