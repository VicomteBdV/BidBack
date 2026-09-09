import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuctionLifecyclePanel } from "@/components/AuctionLifecyclePanel";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { auctionDetailFixture, settledReadinessFixture } from "@/test/fixtures";

const baseAuction = auctionDetailFixture.auction as unknown as SerializedAuction;

describe("AuctionLifecyclePanel", () => {
  it("marks bidding as current while later milestones remain upcoming", () => {
    render(
      <AuctionLifecyclePanel
        auction={{ ...baseAuction, state: 0, stateLabel: "OPEN", finalized: false, endTime: "9999999999" }}
      />
    );

    expect(screen.getByLabelText("Listed: Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Bidding: Current")).toHaveAttribute("aria-current", "step");
    expect(screen.getByLabelText("Finalization: Upcoming")).toBeInTheDocument();
    expect(screen.getByLabelText("Settlement: Upcoming")).toBeInTheDocument();
  });

  it("makes finalization current after the end time and before settlement", () => {
    render(
      <AuctionLifecyclePanel
        auction={{ ...baseAuction, state: 1, stateLabel: "ENDED", finalized: false, endTime: "1" }}
      />
    );

    expect(screen.getByLabelText("Bidding: Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Auction ended: Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Finalization: Current")).toHaveAttribute("aria-current", "step");
    expect(screen.getAllByText("Finalize auction").length).toBeGreaterThan(0);
  });

  it("moves the current milestone to claims once the auction is finalized", () => {
    render(
      <AuctionLifecyclePanel
        auction={{ ...baseAuction, state: 2, stateLabel: "FINALIZED", finalized: true, nftClaimed: false }}
      />
    );

    expect(screen.getByLabelText("Finalization: Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Claims: Current")).toHaveAttribute("aria-current", "step");
    expect(screen.getByLabelText("Settlement: Upcoming")).toBeInTheDocument();
  });

  it("marks all six milestones completed with no current step once settled", () => {
    const { container } = render(
      <AuctionLifecyclePanel
        auction={{
          ...baseAuction,
          state: 2,
          stateLabel: "FINALIZED",
          finalized: true,
          nftClaimed: true,
          economics: undefined,
          settlementReadiness: settledReadinessFixture
        }}
      />
    );

    expect(screen.getByLabelText("Listed: Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Bidding: Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Auction ended: Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Finalization: Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Claims: Completed")).toBeInTheDocument();
    expect(screen.getByLabelText("Settlement: Completed")).toBeInTheDocument();
    expect(container.querySelector('[aria-current="step"]')).not.toBeInTheDocument();
    expect(screen.getByText("Settled")).toBeInTheDocument();
    expect(screen.getByText("No pending action detected")).toBeInTheDocument();
  });
  it("leaves settlement upcoming when economic reads are unavailable", () => {
    render(<AuctionLifecyclePanel auction={{ ...baseAuction, state: 2, finalized: true, nftClaimed: true,
      economics: undefined, settlementReadiness: undefined }} />);
    expect(screen.getByLabelText("Claims: Current")).toHaveAttribute("aria-current", "step");
    expect(screen.getByLabelText("Settlement: Upcoming")).toBeInTheDocument();
    expect(screen.queryByText("Settled")).not.toBeInTheDocument();
    expect(screen.getByText(/Settlement reads are incomplete or unavailable/)).toBeInTheDocument();
  });

});
