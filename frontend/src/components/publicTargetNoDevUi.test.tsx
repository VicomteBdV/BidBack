import { readFileSync } from "node:fs";
import path from "node:path";
import React, { type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateAuctionPage from "@/app/create/page";
import AuctionPage from "@/app/auctions/[auctionId]/page";

vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/CreateAuctionForm", () => ({ CreateAuctionForm: () => <div data-testid="local-create" /> }));
vi.mock("@/components/WalletCreateAuctionForm", () => ({ WalletCreateAuctionForm: () => <div data-testid="wallet-create" /> }));
vi.mock("@/components/AuctionDetail", () => ({
  AuctionDetail: ({ localDevActionsEnabled }: { localDevActionsEnabled: boolean }) =>
    <div data-testid="auction-detail" data-local-dev={String(localDevActionsEnabled)} />
}));

// The repository Vitest setup uses classic JSX; Next pages use automatic JSX in builds.
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllEnvs());

describe("public target local-dev separation", () => {
  it.each([
    ["84532", "84532"], ["84532", "31337"], ["31337", "84532"],
    ["84532", undefined], [undefined, "84532"]
  ])("omits local UI for public/server targets %s / %s with the flag enabled", async (publicId, serverId) => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", publicId);
    vi.stubEnv("BIDBACK_CHAIN_ID", serverId);
    vi.stubEnv("ENABLE_LOCAL_DEV_ACTIONS", "true");
    render(<CreateAuctionPage />);
    render(await AuctionPage({ params: Promise.resolve({ auctionId: "1" }) }));
    expect(screen.queryByTestId("local-create")).not.toBeInTheDocument();
    expect(screen.getByTestId("wallet-create")).toBeInTheDocument();
    expect(screen.getByTestId("auction-detail")).toHaveAttribute("data-local-dev", "false");
  });

  it("retains local UI and wallet creation for coherent Anvil", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "31337");
    vi.stubEnv("BIDBACK_CHAIN_ID", "31337");
    vi.stubEnv("ENABLE_LOCAL_DEV_ACTIONS", "true");
    render(<CreateAuctionPage />);
    render(await AuctionPage({ params: Promise.resolve({ auctionId: "1" }) }));
    expect(screen.getByTestId("local-create")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-create")).toBeInTheDocument();
    expect(screen.getByTestId("auction-detail")).toHaveAttribute("data-local-dev", "true");
  });

  it("gates both local-dev surfaces through the server-provided boundary", () => {
    const createPage = readFileSync(path.resolve(process.cwd(), "src/app/create/page.tsx"), "utf8");
    const auctionPage = readFileSync(
      path.resolve(process.cwd(), "src/app/auctions/[auctionId]/page.tsx"),
      "utf8"
    );
    const auctionDetail = readFileSync(
      path.resolve(process.cwd(), "src/components/AuctionDetail.tsx"),
      "utf8"
    );

    expect(createPage).toContain("isLocalDevUiEnabled()");
    expect(createPage).toMatch(/localDevActionsEnabled\s*\?\s*<CreateAuctionForm/);
    expect(auctionPage).toContain("localDevActionsEnabled={localDevActionsEnabled}");
    expect(auctionDetail).toMatch(/localDevActionsEnabled\s*\?\s*\(/);
  });

  it("keeps wallet-signed surfaces rendered independently", () => {
    const createPage = readFileSync(path.resolve(process.cwd(), "src/app/create/page.tsx"), "utf8");
    const auctionDetail = readFileSync(
      path.resolve(process.cwd(), "src/components/AuctionDetail.tsx"),
      "utf8"
    );

    expect(createPage).toContain("<WalletCreateAuctionForm />");
    expect(auctionDetail).toContain("<WalletBidPanel");
    expect(auctionDetail).toContain("<WalletFinalizePanel");
    expect(auctionDetail).toContain("<WalletClaimPanel");
  });
});
