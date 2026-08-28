import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WalletTransactionStatus } from "@/components/WalletTransactionStatus";

const txHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

describe("WalletTransactionStatus", () => {
  it("renders pending feedback with an explorer link when configured", () => {
    render(
      <WalletTransactionStatus
        title="Bid"
        status={{
          phase: "pending",
          message: "Transaction submitted. Waiting for confirmation.",
          txHash
        }}
        explorerUrl="https://sepolia.basescan.org"
      />
    );

    expect(screen.getByText("Bid")).toBeInTheDocument();
    expect(screen.getByText("Pending confirmation")).toBeInTheDocument();
    expect(screen.getByText("Transaction submitted. Waiting for confirmation.")).toBeInTheDocument();

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    const link = screen.getByRole("link", { name: /Open bid transaction 0x11111111...11111111/ });
    expect(link).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${txHash}`);
    expect(link).toHaveAttribute("title", txHash);
  });

  it("renders a transaction hash without link when no explorer is configured", () => {
    render(
      <WalletTransactionStatus
        title="Claim"
        status={{
          phase: "confirmed",
          message: "Transaction confirmed.",
          txHash
        }}
        explorerUrl=""
      />
    );

    expect(screen.getByText("Transaction confirmed")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("0x11111111...11111111")).toBeInTheDocument();
  });

  it("renders rejected feedback without a transaction hash", () => {
    render(
      <WalletTransactionStatus
        status={{
          phase: "rejected",
          message: "Transaction rejected in wallet."
        }}
      />
    );

    expect(screen.getByText("Transaction rejected")).toBeInTheDocument();
    expect(screen.getByText("Transaction rejected in wallet.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it("announces read-model reconciliation separately from on-chain confirmation", () => {
    render(
      <WalletTransactionStatus
        status={{
          phase: "refreshing",
          message: "Transaction confirmed on-chain. Refreshing the displayed action state.",
          txHash
        }}
      />
    );

    expect(screen.getByText("Refreshing action state")).toBeInTheDocument();
    expect(screen.getByText(/confirmed on-chain/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("keeps an uncertain submitted transaction out of failed state and retains its evidence", () => {
    render(
      <WalletTransactionStatus
        title="Bid"
        status={{
          phase: "confirmation-unknown",
          message: "The transaction was submitted, but its on-chain result could not be verified.",
          nextAction: "Check the explorer before deciding whether to retry.",
          technicalDetail: "RPC timeout",
          txHash
        }}
        explorerUrl="https://sepolia.basescan.org"
      />
    );

    expect(screen.getByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText("Transaction failed")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    expect(screen.getByText("RPC timeout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open bid transaction/ })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/tx/${txHash}`
    );
  });
});
