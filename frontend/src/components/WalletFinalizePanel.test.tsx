import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient } from "viem";
import { useAccount } from "wagmi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletFinalizePanel } from "@/components/WalletFinalizePanel";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { auctionDetailFixture, localDeploymentFixture, testAddresses } from "@/test/fixtures";

vi.mock("wagmi", () => ({ useAccount: vi.fn() }));
vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(),
    createWalletClient: vi.fn(),
    custom: vi.fn((provider: unknown) => provider)
  };
});

const txHash = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

function setupFinalize(
  onFinalizeComplete = vi.fn(async () => undefined),
  auctionOverrides: Partial<SerializedAuction> = {},
  latestBlockTimestamp = 1n
) {
  vi.mocked(useAccount).mockReturnValue({
    address: testAddresses.primaryBidder,
    chainId: 31337,
    isConnected: true
  } as unknown as ReturnType<typeof useAccount>);
  const getBlock = vi.fn(async () => ({ timestamp: latestBlockTimestamp }));
  const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
  const writeContract = vi.fn(async () => txHash);
  vi.mocked(createPublicClient).mockReturnValue({
    getBlock,
    waitForTransactionReceipt
  } as unknown as ReturnType<typeof createPublicClient>);
  vi.mocked(createWalletClient).mockReturnValue({ writeContract } as unknown as ReturnType<typeof createWalletClient>);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(localDeploymentFixture), {
    status: 200,
    headers: { "content-type": "application/json" }
  })));
  Object.defineProperty(window, "ethereum", {
    configurable: true,
    value: { request: vi.fn(async () => "0x7a69") }
  });

  render(
    <WalletFinalizePanel
      auction={{
        ...auctionDetailFixture.auction,
        state: 1,
        stateLabel: "ENDED",
        finalized: false,
        endTime: "1",
        chainTimestamp: "1",
        ...auctionOverrides
      }}
      onFinalizeComplete={onFinalizeComplete}
    />
  );

  return { getBlock, writeContract, waitForTransactionReceipt, onFinalizeComplete };
}

beforeEach(() => vi.clearAllMocks());

describe("WalletFinalizePanel", () => {
  it("explains permissionless finalization and preserves the contract call", async () => {
    const { writeContract } = setupFinalize();
    const reviewButton = await screen.findByRole("button", { name: "Review finalization" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);

    expect(screen.getByText(/Any wallet may perform this permissionless action/)).toBeInTheDocument();
    expect(screen.getByText("No automatic payment or compensation")).toBeInTheDocument();
    expect(screen.getByText(/does not automatically send the NFT, refunds, redistribution, proceeds, or protocol fees/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "finalizeAuction",
      args: [1n]
    })));
    expect(screen.getByText("Auction finalized.")).toBeInTheDocument();
  });

  it("keeps finalization connection details collapsed by default", async () => {
    setupFinalize();
    await screen.findByRole("button", { name: "Review finalization" });
    const summary = screen.getByText("Finalization network and contract details");

    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("allows review and submission for ENDED auctions while the latest chain timestamp is before endTime", async () => {
    const { getBlock, writeContract, onFinalizeComplete } = setupFinalize(
      undefined,
      { chainTimestamp: "1000", endTime: "2000" },
      1_000n
    );
    const reviewButton = await screen.findByRole("button", { name: "Review finalization" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    expect(screen.queryByText("Auction is not expired yet.")).not.toBeInTheDocument();

    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      address: localDeploymentFixture.contracts.auctionHouse,
      functionName: "finalizeAuction",
      args: [1n]
    })));
    expect(await screen.findByText("Transaction confirmed")).toBeInTheDocument();
    expect(getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(onFinalizeComplete).toHaveBeenCalledTimes(1);
  });

  it("uses the latest block timestamp and blocks an unexpired OPEN auction before requesting a signature", async () => {
    const { getBlock, writeContract, waitForTransactionReceipt } = setupFinalize(
      undefined,
      {
        state: 0,
        stateLabel: "OPEN",
        chainTimestamp: "2000",
        endTime: "2000"
      },
      1_000n
    );
    const reviewButton = await screen.findByRole("button", { name: "Review finalization" });
    await waitFor(() => expect(reviewButton).toBeEnabled());

    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Auction is not expired yet.")).toBeInTheDocument();
    expect(getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
    expect(writeContract).not.toHaveBeenCalled();
    expect(waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it("keeps finalization confirmed when lifecycle refresh fails", async () => {
    setupFinalize(vi.fn(async () => { throw new Error("read model unavailable"); }));
    const reviewButton = await screen.findByRole("button", { name: "Review finalization" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Transaction confirmed")).toBeInTheDocument();
    expect(screen.getByText("Auction finalized, but displayed lifecycle and claim data could not be fully refreshed.")).toBeInTheDocument();
    expect(screen.queryByText("Transaction failed")).not.toBeInTheDocument();
  });
});
