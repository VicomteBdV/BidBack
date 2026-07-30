import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StateNotice } from "@/components/ui/StateNotice";

describe("StateNotice", () => {
  it("announces non-critical loading feedback politely", () => {
    render(<StateNotice tone="loading" title="Loading auctions">Reading the configured RPC.</StateNotice>);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading auctions");
    expect(status).toHaveTextContent("Loading");
  });

  it("uses an alert for an actionable error and keeps a native action", () => {
    const retry = vi.fn();

    render(
      <StateNotice tone="error" title="Unable to load" action={<button type="button" onClick={retry}>Try again</button>}>
        RPC unavailable.
      </StateNotice>
    );

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
