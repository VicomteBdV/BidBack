import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";

vi.mock("@/components/WalletButton", () => ({
  WalletButton: () => <div><button>Connect wallet</button><p>No compatible browser wallet was detected. You can continue browsing read-only.</p><p>Wallet connection is optional for the read-only deployment view.</p></div>
}));

function viewport(wide: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}

describe("AppShell navigation disclosure", () => {
  it("collapses only the mobile navigation and keeps environment and wallet messages expanded", async () => {
    viewport(false);
    render(<AppShell><h1>Read-only marketplace</h1></AppShell>);
    const summary = screen.getByLabelText("Navigation menu");
    const disclosure = summary.parentElement!;

    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByText(/Test assets only. No real value/)).toBeVisible();
    expect(screen.getByText(/No compatible browser wallet was detected/)).toBeVisible();
    expect(screen.getByText(/Wallet connection is optional/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");

    fireEvent.click(summary);
    await waitFor(() => expect(disclosure).toHaveAttribute("open"));
    expect(within(disclosure).getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Create auction" })).toHaveAttribute("href", "/create");

    fireEvent.click(summary);
    await waitFor(() => expect(disclosure).not.toHaveAttribute("open"));
    expect(screen.getByText(/No compatible browser wallet was detected/)).toBeVisible();
    expect(screen.getByText(/Test assets only. No real value/)).toBeVisible();
  });

  it("expands the same single navigation set for desktop", () => {
    viewport(true);
    render(<AppShell>Read-only marketplace</AppShell>);
    expect(screen.getByLabelText("Navigation menu").parentElement).toHaveAttribute("open");
    expect(screen.getAllByRole("navigation", { name: "Primary navigation" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /Marketplace/ })).toHaveLength(1);
  });
});
