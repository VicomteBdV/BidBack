import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient } from "viem";
import { useAccount } from "wagmi";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { WalletFinalizePanel } from "@/components/WalletFinalizePanel";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { auctionDetailFixture, localDeploymentFixture, testAddresses } from "@/test/fixtures";

vi.mock("wagmi", () => ({ useAccount: vi.fn(), useConfig: vi.fn(() => ({})) }));
vi.mock("wagmi/actions", () => ({ getAccount: () => useAccount() }));
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

const providerA = { request: vi.fn() };
const providerB = { request: vi.fn(async ({ method }: { method: string }) =>
  method === "eth_accounts" ? [vi.mocked(useAccount)().address] : "0x7a69") };
const connectorB = { uid: "wallet-b", name: "Wallet B", getProvider: vi.fn(async () => providerB) };

function setupFinalize(
  onFinalizeComplete = vi.fn(async () => undefined),
  auctionOverrides: Partial<SerializedAuction> = {},
  latestBlockTimestamp = 1n
) {
  vi.mocked(useAccount).mockReturnValue({
    address: testAddresses.primaryBidder,
    chainId: 31337,
    isConnected: true, connector: connectorB
  } as unknown as ReturnType<typeof useAccount>);
  const getBlock = vi.fn(async () => ({ timestamp: latestBlockTimestamp, number: 42n }));
  const readContract = vi.fn(async () => ({ state: 1, ...auctionOverrides,
    endTime: BigInt(auctionOverrides.endTime ?? "1") }));
  const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
  const writeContract = vi.fn(async () => txHash);
  vi.mocked(createPublicClient).mockReturnValue({
    getBlock,
    readContract,
    waitForTransactionReceipt
  } as unknown as ReturnType<typeof createPublicClient>);
  vi.mocked(createWalletClient).mockImplementation((options) => ({
    writeContract: async (...args: unknown[]) => {
      const result = await (writeContract as (...args: unknown[]) => Promise<unknown>)(...args);
      await (options.transport as unknown as { request: (args: unknown) => Promise<unknown> }).request({
        method: "eth_sendTransaction", params: [{ from: vi.mocked(useAccount)().address }]
      });
      return result;
    }
  }) as unknown as ReturnType<typeof createWalletClient>);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(localDeploymentFixture), {
    status: 200,
    headers: { "content-type": "application/json" }
  })));
  providerA.request.mockReset();
  providerB.request.mockReset();
  providerB.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [vi.mocked(useAccount)().address] : "0x7a69");
  Object.defineProperty(window, "ethereum", { configurable: true, value: providerA });

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

  return { getBlock, readContract, writeContract, waitForTransactionReceipt, onFinalizeComplete };
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
    await waitFor(() => expect(providerB.request).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" })));
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
  it.each([
    { state: 0, endTime: 3000n, reason: "Auction is not expired yet." },
    { state: 2, endTime: 1000n, reason: "Auction is already finalized." }
  ])("detects concurrent state $state / deadline changes before signature", async ({ state, endTime, reason }) => {
    const { readContract, writeContract, onFinalizeComplete } = setupFinalize(undefined, {}, 2000n);
    readContract.mockResolvedValue({ state, endTime });
    const review = await screen.findByRole("button", { name: "Review finalization" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "getAuction", args: [1n], blockNumber: 42n }));
    expect(writeContract).not.toHaveBeenCalled();
    expect(onFinalizeComplete).toHaveBeenCalledTimes(1);
  });

  it("does not request a signature when the live auction read fails", async () => {
    const { readContract, writeContract } = setupFinalize();
    readContract.mockRejectedValue(new Error("Live auction unavailable"));
    const review = await screen.findByRole("button", { name: "Review finalization" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    expect(await screen.findByText("Live auction unavailable")).toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it.each(["rejected", "reverted", "unknown"])("preserves a %s transaction outcome after preflight", async (outcome) => {
    const { writeContract, waitForTransactionReceipt, onFinalizeComplete } = setupFinalize();
    if (outcome === "rejected") writeContract.mockRejectedValue({ code: 4001 });
    if (outcome === "reverted") waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    if (outcome === "unknown") waitForTransactionReceipt.mockRejectedValue(new Error("Receipt unavailable"));
    const review = await screen.findByRole("button", { name: "Review finalization" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    const message = outcome === "rejected" ? "Transaction rejected in wallet."
      : outcome === "reverted" ? "The transaction was included on-chain but reverted."
      : "The transaction was submitted, but its on-chain result could not be verified.";
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("Auction finalized.")).not.toBeInTheDocument();
    expect(onFinalizeComplete).not.toHaveBeenCalled();
  });

});

// Every component scenario uses B, while the legacy global points at unrelated A.
afterEach(() => {
  expect(providerA.request).not.toHaveBeenCalled();
});
