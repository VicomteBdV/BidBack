import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoRow } from "@/components/ui/InfoRow";
import { SectionCard } from "@/components/ui/SectionCard";

describe("shared UI components", () => {
  it("renders a section card with badges, actions, and content", () => {
    render(
      <SectionCard title="Shared section" badges={<span>Read-only</span>} actions={<button type="button">Refresh</button>}>
        <p>Section body</p>
      </SectionCard>
    );

    expect(screen.getByRole("heading", { name: "Shared section" })).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByText("Section body")).toBeInTheDocument();
  });

  it("renders compact info rows", () => {
    render(<InfoRow label="Highest bid" value="1 ETH" mono detail="Read-only value" />);

    expect(screen.getByText("Highest bid")).toBeInTheDocument();
    expect(screen.getByText("1 ETH")).toBeInTheDocument();
    expect(screen.getByText("Read-only value")).toBeInTheDocument();
  });

  it("renders empty states with optional titles", () => {
    render(<EmptyState title="Nothing to do">No immediate wallet action is currently available.</EmptyState>);

    expect(screen.getByText("Nothing to do")).toBeInTheDocument();
    expect(screen.getByText("No immediate wallet action is currently available.")).toBeInTheDocument();
  });
});
