import React from "react";
import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Transaction pending")).toBeInTheDocument();
    expect(screen.getByText("Transaction submitted. Waiting for confirmation.")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "0x11111111...11111111" });
    expect(link).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${txHash}`);
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
  });
});
