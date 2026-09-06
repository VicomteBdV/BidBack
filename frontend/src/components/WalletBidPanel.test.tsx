import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient } from "viem";
import { useAccount } from "wagmi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletBidPanel } from "@/components/WalletBidPanel";
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

const txHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

function setupBid({
  currentCap = 0n,
  minimumNextBid = 1_200_000_000_000_000_000n,
  preflightCurrentCap,
  preflightMinimumNextBid,
  latestBlockTimestamp = 1n,
  auctionOverrides = {},
  receipt = { status: "success" },
  writeError,
  onBidComplete = vi.fn(async () => undefined)
}: {
  currentCap?: bigint;
  minimumNextBid?: bigint;
  preflightCurrentCap?: bigint;
  preflightMinimumNextBid?: bigint;
  latestBlockTimestamp?: bigint;
  auctionOverrides?: Partial<SerializedAuction>;
  receipt?: { status: string } | Error;
  writeError?: unknown;
  onBidComplete?: () => Promise<void>;
} = {}) {
  vi.mocked(useAccount).mockReturnValue({
    address: testAddresses.primaryBidder,
    chainId: 31337,
    isConnected: true
  } as unknown as ReturnType<typeof useAccount>);

  let minimumReadCount = 0;
  let capReadCount = 0;
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "minimumNextBid") {
      minimumReadCount += 1;
      return minimumReadCount === 1 ? minimumNextBid : preflightMinimumNextBid ?? minimumNextBid;
    }
    if (functionName === "capOf") {
      capReadCount += 1;
      return capReadCount === 1 ? currentCap : preflightCurrentCap ?? currentCap;
    }
    throw new Error(`Unexpected read: ${functionName}`);
  });
  const waitForTransactionReceipt = vi.fn(async () => {
    if (receipt instanceof Error) throw receipt;
    return receipt;
  });
  const getBlock = vi.fn(async () => ({ timestamp: latestBlockTimestamp }));
  const writeContract = vi.fn(async () => {
    if (writeError) throw writeError;
    return txHash;
  });

  vi.mocked(createPublicClient).mockReturnValue({
    getBlock,
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
      auction={{
        ...auctionDetailFixture.auction,
        state: 0,
        finalized: false,
        endTime: "9999999999",
        chainTimestamp: "1",
        ...auctionOverrides
      }}
      onBidComplete={onBidComplete}
    />
  );

  return { getBlock, readContract, writeContract, waitForTransactionReceipt, onBidComplete };
}

beforeEach(() => vi.clearAllMocks());

describe("WalletBidPanel", () => {
  it("distinguishes a first bid and sends the unchanged total cap and value", async () => {
    const { readContract, writeContract } = setupBid({ minimumNextBid: 1_000_000_000_000_000_000n });
    const reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    expect(screen.getByLabelText("Bid cap in ETH")).toHaveValue("1");
    expect(screen.queryByText("Wallet bid data loaded.")).not.toBeInTheDocument();
    fireEvent.click(reviewButton);

    expect(screen.getByRole("heading", { name: "Place bid" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review place bid" })).toBeInTheDocument();
    expect(screen.getByText("Entered total cap").nextElementSibling).toHaveTextContent("1 ETH");
    expect(screen.getByText("Your new total cap").nextElementSibling).toHaveTextContent("1 ETH");
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "placeBid",
      args: [1n, 1_000_000_000_000_000_000n],
      value: 1_000_000_000_000_000_000n
    })));
    expect(await screen.findByText("Bid placed with 1 ETH sent.")).toBeInTheDocument();
    expect(readContract.mock.calls.filter(([request]) => request.functionName === "minimumNextBid").length).toBeGreaterThanOrEqual(2);
    expect(readContract.mock.calls.filter(([request]) => request.functionName === "capOf").length).toBeGreaterThanOrEqual(2);
  });

  it("distinguishes a step-up and presents the total cap separately from the delta", async () => {
    const { writeContract } = setupBid({ currentCap: 1_000_000_000_000_000_000n });
    const reviewButton = await screen.findByRole("button", { name: "Review increase" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    expect(screen.getByLabelText("Additional amount in ETH")).toHaveValue("0.2");
    fireEvent.click(reviewButton);

    expect(screen.getByRole("heading", { name: "Increase bid" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review increase bid" })).toBeInTheDocument();
    expect(screen.getByText("Amount added").nextElementSibling).toHaveTextContent("0.2 ETH");
    expect(screen.getByText("Your new total cap").nextElementSibling).toHaveTextContent("1.2 ETH");
    expect(screen.getByText("ETH sent in this transaction").nextElementSibling).toHaveTextContent("0.2 ETH");
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      args: [1n, 1_200_000_000_000_000_000n],
      value: 200_000_000_000_000_000n
    })));
  });

  it("replaces a total-cap input with the correct delta when a fresh read enters step-up mode", async () => {
    const { writeContract } = setupBid({
      currentCap: 0n,
      minimumNextBid: 1_000_000_000_000_000_000n,
      preflightCurrentCap: 1_000_000_000_000_000_000n,
      preflightMinimumNextBid: 1_200_000_000_000_000_000n
    });
    const initialInput = await screen.findByLabelText("Bid cap in ETH");
    await waitFor(() => expect(initialInput).toHaveValue("1"));

    fireEvent.click(screen.getByRole("button", { name: "Refresh wallet bid data" }));

    const stepUpInput = await screen.findByLabelText("Additional amount in ETH");
    await waitFor(() => expect(stepUpInput).toHaveValue("0.2"));
    expect(screen.getByText("New total cap").nextElementSibling).toHaveTextContent("1.2 ETH");
    expect(stepUpInput).not.toHaveValue("1");
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("recalculates the step-up total from fresh preflight reads before signing", async () => {
    const { writeContract } = setupBid({
      currentCap: 1_000_000_000_000_000_000n,
      minimumNextBid: 1_200_000_000_000_000_000n,
      preflightCurrentCap: 1_100_000_000_000_000_000n,
      preflightMinimumNextBid: 1_300_000_000_000_000_000n
    });
    const reviewButton = await screen.findByRole("button", { name: "Review increase" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "placeBid",
      args: [1n, 1_300_000_000_000_000_000n],
      value: 200_000_000_000_000_000n
    })));
  });

  it("uses the latest block timestamp and blocks an expired bid before requesting a signature", async () => {
    const { getBlock, writeContract, waitForTransactionReceipt } = setupBid({
      latestBlockTimestamp: 2_000n,
      auctionOverrides: {
        chainTimestamp: "1000",
        endTime: "2000"
      }
    });
    const reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());

    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Auction has reached its end time. Refresh auction state or finalize it.")).toBeInTheDocument();
    expect(getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
    expect(writeContract).not.toHaveBeenCalled();
    expect(waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ["", "Bid increase is required."],
    ["0", "Bid increase must be greater than zero."],
    ["-0.1", "Bid increase must be greater than zero."],
    ["0.1", "New bid cap must meet the minimum required bid."]
  ])("blocks invalid step-up input %j", async (value, reason) => {
    const { writeContract } = setupBid({ currentCap: 1_000_000_000_000_000_000n });
    const input = await screen.findByLabelText("Additional amount in ETH");
    fireEvent.change(input, { target: { value } });

    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review increase" })).toBeDisabled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("keeps bid connection details collapsed by default", async () => {
    setupBid();
    await screen.findByRole("button", { name: "Review bid" });
    const summary = screen.getByText("Bid network and contract details");

    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("keeps a successful receipt confirmed when the parent refresh fails", async () => {
    setupBid({ onBidComplete: vi.fn(async () => { throw new Error("refresh unavailable"); }) });
    const reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Transaction confirmed")).toBeInTheDocument();
    expect(screen.getByText("Bid placed with 1.2 ETH sent, but displayed data could not be fully refreshed.")).toBeInTheDocument();
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
