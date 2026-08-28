import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient } from "viem";
import { useAccount } from "wagmi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletBidPanel } from "@/components/WalletBidPanel";
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

const txHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

function setupBid({
  currentCap = 0n,
  receipt = { status: "success" },
  writeError,
  onBidComplete = vi.fn(async () => undefined)
}: {
  currentCap?: bigint;
  receipt?: { status: string } | Error;
  writeError?: unknown;
  onBidComplete?: () => Promise<void>;
} = {}) {
  vi.mocked(useAccount).mockReturnValue({
    address: testAddresses.primaryBidder,
    chainId: 31337,
    isConnected: true
  } as unknown as ReturnType<typeof useAccount>);

  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "minimumNextBid") return 1_200_000_000_000_000_000n;
    if (functionName === "capOf") return currentCap;
    throw new Error(`Unexpected read: ${functionName}`);
  });
  const waitForTransactionReceipt = vi.fn(async () => {
    if (receipt instanceof Error) throw receipt;
    return receipt;
  });
  const writeContract = vi.fn(async () => {
    if (writeError) throw writeError;
    return txHash;
  });

  vi.mocked(createPublicClient).mockReturnValue({
    readContract,
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
    <WalletBidPanel
      auction={{ ...auctionDetailFixture.auction, state: 0, finalized: false, endTime: "9999999999" }}
      onBidComplete={onBidComplete}
    />
  );

  return { readContract, writeContract, waitForTransactionReceipt, onBidComplete };
}

beforeEach(() => vi.clearAllMocks());

describe("WalletBidPanel", () => {
  it("distinguishes a first bid and sends the unchanged total cap and value", async () => {
    const { readContract, writeContract } = setupBid();
    const reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);

    expect(screen.getByRole("heading", { name: "Place bid" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review place bid" })).toBeInTheDocument();
    expect(screen.getAllByText("1.2 ETH").length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "placeBid",
      args: [1n, 1_200_000_000_000_000_000n],
      value: 1_200_000_000_000_000_000n
    })));
    expect(readContract.mock.calls.filter(([request]) => request.functionName === "minimumNextBid").length).toBeGreaterThanOrEqual(2);
    expect(readContract.mock.calls.filter(([request]) => request.functionName === "capOf").length).toBeGreaterThanOrEqual(2);
  });

  it("distinguishes a step-up and presents the total cap separately from the delta", async () => {
    const { writeContract } = setupBid({ currentCap: 1_000_000_000_000_000_000n });
    const reviewButton = await screen.findByRole("button", { name: "Review increase" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);

    expect(screen.getByRole("heading", { name: "Increase bid" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review increase bid" })).toBeInTheDocument();
    expect(screen.getByText("Your new total cap").nextElementSibling).toHaveTextContent("1.2 ETH");
    expect(screen.getByText("ETH sent in this transaction").nextElementSibling).toHaveTextContent("0.2 ETH");
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      args: [1n, 1_200_000_000_000_000_000n],
      value: 200_000_000_000_000_000n
    })));
  });

  it("keeps a successful receipt confirmed when the parent refresh fails", async () => {
    setupBid({ onBidComplete: vi.fn(async () => { throw new Error("refresh unavailable"); }) });
    const reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Transaction confirmed")).toBeInTheDocument();
    expect(screen.getByText(/Displayed data could not be fully refreshed/)).toBeInTheDocument();
    expect(screen.queryByText("Transaction failed")).not.toBeInTheDocument();
  });

  it("never confirms a reverted receipt or an unverifiable submitted hash", async () => {
    const first = setupBid({ receipt: { status: "reverted" } });
    let reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    expect(await screen.findByText("The transaction was included on-chain but reverted.")).toBeInTheDocument();
    expect(screen.queryByText("Transaction confirmed")).not.toBeInTheDocument();
    expect(first.waitForTransactionReceipt).toHaveBeenCalled();

    vi.clearAllMocks();
    cleanup();
    setupBid({ receipt: new Error("RPC timeout after submission") });
    reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText("Transaction failed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    expect(screen.getByText("0x11111111...11111111")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
  });

  it("keeps the review available for retry after a rejected signature", async () => {
    setupBid({ writeError: { code: 4001, message: "User rejected the request." } });
    const reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Transaction rejected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeEnabled();
  });
});
