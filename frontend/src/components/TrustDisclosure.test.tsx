import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrustDisclosure } from "@/components/TrustDisclosure";

describe("TrustDisclosure", () => {
  it("keeps refund, gas, redistribution, and model-status safeguards explicit", () => {
    render(<TrustDisclosure />);

    expect(screen.getByRole("heading", { name: "Terms at a glance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Losing caps stay refundable" })).toBeInTheDocument();
    expect(screen.getByText("After finalization, a losing bidder can reclaim the locked cap in full.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gas is separate" })).toBeInTheDocument();
    expect(screen.getByText("Network transaction fees are separate and non-refundable.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Redistribution is conditional" })).toBeInTheDocument();
    expect(screen.getByText("Any separate redistribution can be zero and is never guaranteed.")).toBeInTheDocument();
    expect(screen.getByText(/Test assets only/)).toBeInTheDocument();
    expect(screen.getByText(/Unaudited contracts/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("About the current controlled-testnet rules"));
    expect(screen.getByText(/not an approved final Economic Model V1/)).toBeInTheDocument();
    expect(screen.getByText(/not lending, derivatives, or gambling/)).toBeInTheDocument();
  });
});
