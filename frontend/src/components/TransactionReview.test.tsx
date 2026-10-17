import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransactionReview } from "@/components/TransactionReview";

describe("TransactionReview", () => {
  it("keeps the confirmation count and material note expanded while a wallet action is busy", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    render(<TransactionReview title="Claim refund" description="Review your refundable cap."
      items={[{ label: "Refund available", value: "1 ETH" }]}
      confirmations="Currently expected: 1 wallet confirmation"
      note="Network gas is separate and is not refundable."
      primaryLabel="Continue in wallet" busy onConfirm={onConfirm} onBack={onBack} />);

    expect(screen.getByText("Currently expected: 1 wallet confirmation").closest("details")).toBeNull();
    expect(screen.getByText("Network gas is separate and is not refundable.").closest("details")).toBeNull();
    const confirm = screen.getByRole("button", { name: "Working..." });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("renders supplied authoritative values without deriving transaction data", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();

    render(
      <TransactionReview
        title="Increase bid"
        description="Review the supplied bid values."
        items={[
          { label: "Your new total cap", value: "1.5 ETH" },
          { label: "ETH sent in this transaction", value: "0.3 ETH" }
        ]}
        confirmations="Currently expected: 1 wallet confirmation"
        note="Network gas is separate."
        primaryLabel="Continue in wallet"
        onConfirm={onConfirm}
        onBack={onBack}
      />
    );

    expect(screen.getByRole("heading", { name: "Increase bid" })).toBeInTheDocument();
    expect(screen.getByText("1.5 ETH")).toBeInTheDocument();
    expect(screen.getByText("0.3 ETH")).toBeInTheDocument();
    expect(screen.getByText("Currently expected: 1 wallet confirmation")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
