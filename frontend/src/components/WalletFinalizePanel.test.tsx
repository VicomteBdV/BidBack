import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeEventTopics, encodeFunctionData, type Address, type Hex } from "viem";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
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
  const blockHash = `0x${"a".repeat(64)}` as Hex;
  const transaction = { hash: txHash as Hex, from: testAddresses.primaryBidder as Address, to: testAddresses.auctionHouse as Address,
    input: encodeFunctionData({ abi: auctionHouseAbi, functionName: "finalizeAuction", args: [BigInt(auctionOverrides.auctionId ?? "1")] }),
    value: 0n, nonce: 5, chainId: 31337, blockHash, blockNumber: 42n, transactionIndex: 0 };
  const log = { address: transaction.to, topics: encodeEventTopics({ abi: auctionHouseAbi, eventName: "AuctionFinalized",
    args: { auctionId: BigInt(auctionOverrides.auctionId ?? "1"), winner: testAddresses.primaryBidder } }),
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [1n, 0n, 0n]),
    transactionHash: txHash as Hex, blockHash, blockNumber: 42n, transactionIndex: 0, logIndex: 0, removed: false };
  const receipt = { status: "success", transactionHash: txHash as Hex, from: transaction.from, to: transaction.to,
    blockHash, blockNumber: 42n, transactionIndex: 0, logs: [log] };
  const waitForTransactionReceipt = vi.fn(async (_options?: unknown) => receipt);
  const getTransaction = vi.fn(async () => transaction);
  const getChainId = vi.fn(async () => 31337);
  const writeContract = vi.fn(async () => txHash);
  vi.mocked(createPublicClient).mockReturnValue({
    getBlock,
    readContract,
    waitForTransactionReceipt, getTransaction, getChainId
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

  const auction = { ...auctionDetailFixture.auction, state: 1 as const, stateLabel: "ENDED", finalized: false,
    endTime: "1", chainTimestamp: "1", ...auctionOverrides };
  const view = render(<WalletFinalizePanel auction={auction} onFinalizeComplete={onFinalizeComplete} />);

  return { getBlock, readContract, writeContract, waitForTransactionReceipt, onFinalizeComplete, transaction, receipt, log, getTransaction, getChainId, view, auction };
}

async function submitFinalize() {
  const review = await screen.findByRole("button", { name: "Review finalization" });
  await waitFor(() => expect(review).toBeEnabled());
  fireEvent.click(review);
  fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
}

function installReplacement(f: ReturnType<typeof setupFinalize>, reason = "repriced", changes: Partial<typeof f.transaction> = {}) {
  const original = { ...f.transaction };
  const hash = `0x${"7".repeat(64)}` as Hex;
  Object.assign(f.transaction, { hash }, changes);
  Object.assign(f.receipt, { transactionHash: hash, to: f.transaction.to, from: f.transaction.from });
  f.log.transactionHash = hash;
  f.waitForTransactionReceipt.mockImplementation(async (options) => {
    (options as { onReplaced: (value: unknown) => void }).onReplaced({ reason, transaction: { ...f.transaction },
      replacedTransaction: original, transactionReceipt: { ...f.receipt } });
    return f.receipt;
  });
}

beforeEach(() => vi.clearAllMocks());

describe("WalletFinalizePanel", () => {
  it("does not confirm a mined cancellation with a successful receipt", async () => {
    const f = setupFinalize();
    installReplacement(f, "cancelled", { to: testAddresses.primaryBidder, input: "0x" });
    await submitFinalize();
    expect(await screen.findByText(/The transaction was cancelled on-chain/)).toBeInTheDocument();
    expect(screen.queryByText("Auction finalized.")).not.toBeInTheDocument();
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
  });
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
    const { writeContract, waitForTransactionReceipt, onFinalizeComplete, receipt } = setupFinalize();
    if (outcome === "rejected") writeContract.mockRejectedValue({ code: 4001 });
    if (outcome === "reverted") waitForTransactionReceipt.mockResolvedValue({ ...receipt, status: "reverted" });
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

describe("finalization confirmation integrity and recovery", () => {
  it.each(["repriced", "replaced"])("confirms equivalent content regardless of the %s reason", async (reason) => {
    const f = setupFinalize();
    installReplacement(f, reason);
    await submitFinalize();
    expect(await screen.findByText("Auction finalized.")).toBeInTheDocument();
    expect(f.getTransaction).toHaveBeenCalledWith({ hash: `0x${"7".repeat(64)}` });
    const status = screen.getByTestId("wallet-transaction-status");
    expect(status.querySelector('[title]')).toHaveAttribute("title", `0x${"7".repeat(64)}`);
    expect(status.textContent).toContain(txHash);
  });
  it("rejects a cancellation mislabeled repriced and allows a fresh review", async () => {
    const f = setupFinalize();
    installReplacement(f, "repriced", { to: testAddresses.primaryBidder, input: "0x" });
    await submitFinalize();
    await screen.findByText(/The transaction was cancelled on-chain/);
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Review finalization" })).toBeEnabled();
  });
  it("rejects an incompatible replacement argument", async () => {
    const f = setupFinalize();
    installReplacement(f, "repriced", { input: encodeFunctionData({ abi: auctionHouseAbi, functionName: "finalizeAuction", args: [2n] }) });
    await submitFinalize();
    await screen.findByText(/A different transaction was confirmed on-chain/);
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
  });
  it.each(["missing event", "wrong ID", "wrong emitter", "wrong hash", "wrong sender"])("never confirms %s", async (scenario) => {
    const f = setupFinalize();
    if (scenario === "missing event") f.receipt.logs = [];
    if (scenario === "wrong ID") f.log.topics = encodeEventTopics({ abi: auctionHouseAbi, eventName: "AuctionFinalized", args: { auctionId: 2n } });
    if (scenario === "wrong emitter") f.log.address = testAddresses.secondBidder;
    if (scenario === "wrong hash") f.receipt.transactionHash = `0x${"7".repeat(64)}`;
    if (scenario === "wrong sender") { f.transaction.from = testAddresses.secondBidder; f.receipt.from = testAddresses.secondBidder; }
    await submitFinalize();
    await screen.findByText("Confirmation not verified");
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Review finalization" })).toBeDisabled();
  });
  it.each(["wait", "transaction", "chain"])("can verify a real success after transient %s RPC failure without resubmission", async (rpc) => {
    const f = setupFinalize();
    if (rpc === "wait") f.waitForTransactionReceipt.mockRejectedValueOnce(new Error("Unavailable"));
    if (rpc === "transaction") f.getTransaction.mockRejectedValueOnce(new Error("Unavailable"));
    if (rpc === "chain") f.getChainId.mockRejectedValueOnce(new Error("Unavailable"));
    await submitFinalize();
    await screen.findByText("Confirmation not verified");
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
    expect(await screen.findByText("Auction finalized.")).toBeInTheDocument();
    expect(f.waitForTransactionReceipt).toHaveBeenLastCalledWith(expect.objectContaining({ timeout: 15000, retryCount: 1 }));
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    expect(f.onFinalizeComplete).toHaveBeenCalledTimes(1);
  });
  it("accepts no-bid finalization event and offers no duplicate submission", async () => {
    const f = setupFinalize();
    f.log.topics = encodeEventTopics({ abi: auctionHouseAbi, eventName: "AuctionFinalized", args: { auctionId: 1n,
      winner: "0x0000000000000000000000000000000000000000" } });
    f.log.data = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [0n, 0n, 0n]);
    await submitFinalize();
    await screen.findByText("Auction finalized.");
    expect(screen.getByRole("button", { name: "Review finalization" })).toBeDisabled();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
  it("refreshes data safely after a verified result whose refresh failed", async () => {
    const onRefresh = vi.fn(async () => undefined).mockRejectedValueOnce(new Error("Unavailable"));
    const f = setupFinalize(onRefresh);
    await submitFinalize();
    await screen.findByText(/Auction finalized, but displayed/);
    fireEvent.click(screen.getByRole("button", { name: "Refresh auction data" }));
    await screen.findByText("Auction finalized.");
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
});

it.each(["account", "chain", "connector", "auction"])("does not attribute an in-flight finalization to a changed %s and retains safe verification", async (changed) => {
  const f = setupFinalize();
  const originalAccount = vi.mocked(useAccount)();
  let release: (receipt: typeof f.receipt) => void = () => {};
  f.waitForTransactionReceipt.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  await submitFinalize();
  await waitFor(() => expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(1));
  const nextAccount = changed === "account" ? { ...originalAccount, address: testAddresses.secondBidder }
    : changed === "chain" ? { ...originalAccount, chainId: 1 }
      : changed === "connector" ? { ...originalAccount, connector: { ...connectorB, uid: "other-connector" } } : originalAccount;
  vi.mocked(useAccount).mockReturnValue(nextAccount as unknown as ReturnType<typeof useAccount>);
  f.view.rerender(<WalletFinalizePanel auction={changed === "auction" ? { ...f.auction, auctionId: "2" } : f.auction} onFinalizeComplete={f.onFinalizeComplete} />);
  release(f.receipt);
  await screen.findByText("Confirmation not verified");
  expect(f.onFinalizeComplete).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Verify transaction" })).toBeDisabled());
  vi.mocked(useAccount).mockReturnValue(originalAccount);
  f.view.rerender(<WalletFinalizePanel auction={f.auction} onFinalizeComplete={f.onFinalizeComplete} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Verify transaction" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
  await screen.findByText("Auction finalized.");
  expect(f.writeContract).toHaveBeenCalledTimes(1);
  expect(f.onFinalizeComplete).toHaveBeenCalledTimes(1);
});
