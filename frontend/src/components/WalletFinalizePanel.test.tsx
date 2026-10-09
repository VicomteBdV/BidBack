import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeEventTopics, encodeFunctionData, type Address, type Hex } from "viem";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { useAccount } from "wagmi";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { WalletFinalizePanel } from "@/components/WalletFinalizePanel";
import type { SerializedAuction } from "@/lib/auctionTypes";
import type { Deployment } from "@/lib/deployment";
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
const auctionEndTime = BigInt(auctionDetailFixture.auction.endTime);
const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

const providerA = { request: vi.fn() };
const providerB = { request: vi.fn(async ({ method }: { method: string }): Promise<unknown> =>
  method === "eth_accounts" ? [vi.mocked(useAccount)().address] : "0x7a69") };
const connectorB = { uid: "wallet-b", name: "Wallet B", getProvider: vi.fn(async () => providerB) };

function setupFinalize(
  onFinalizeComplete = vi.fn(async () => undefined),
  auctionOverrides: Partial<SerializedAuction> = {},
  latestBlockTimestamp = auctionEndTime,
  loadedDeployment: Deployment = localDeploymentFixture
) {
  vi.mocked(useAccount).mockReturnValue({
    address: testAddresses.primaryBidder,
    chainId: 31337,
    isConnected: true, connector: connectorB
  } as unknown as ReturnType<typeof useAccount>);
  const blockHash = `0x${"a".repeat(64)}` as Hex;
  const getBlock = vi.fn(async (_options?: unknown) => ({ timestamp: latestBlockTimestamp, number: 42n, hash: blockHash }));
  const displayed = { ...auctionDetailFixture.auction, state: 1 as const, stateLabel: "ENDED", finalized: false,
    chainTimestamp: auctionEndTime.toString(), ...auctionOverrides };
  const liveAuction = { seller: displayed.seller, nft: displayed.nft, tokenId: BigInt(displayed.tokenId),
    startPrice: BigInt(displayed.startPrice), startTime: BigInt(displayed.startTime), initialEndTime: BigInt(displayed.initialEndTime),
    endTime: BigInt(displayed.endTime), extensionsUsed: displayed.extensionsUsed, state: displayed.state,
    highestBidder: displayed.highestBidder, highestBid: BigInt(displayed.highestBid), participantCount: BigInt(displayed.participantCount),
    bidCount: BigInt(displayed.bidCount), nftClaimed: displayed.nftClaimed };
  const readContract = vi.fn(async () => ({ ...liveAuction }));
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
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(loadedDeployment), {
    status: 200,
    headers: { "content-type": "application/json" }
  })));
  providerA.request.mockReset();
  providerB.request.mockReset();
  providerB.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [vi.mocked(useAccount)().address] : "0x7a69");
  Object.defineProperty(window, "ethereum", { configurable: true, value: providerA });

  const auction = displayed;
  const view = render(<WalletFinalizePanel expectedChainId={31337} expectedAuctionHouse={testAddresses.auctionHouse} auction={auction} onFinalizeComplete={onFinalizeComplete} />);

  return { getBlock, readContract, writeContract, waitForTransactionReceipt, onFinalizeComplete, transaction, receipt, log, getTransaction, getChainId, view, auction, liveAuction };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => { resolve = release; });
  return { promise, resolve };
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
      { chainTimestamp: auctionEndTime.toString(), endTime: (auctionEndTime + 1_000n).toString() },
      auctionEndTime
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
        chainTimestamp: (auctionEndTime + 1_000n).toString(),
        endTime: (auctionEndTime + 1_000n).toString()
      },
      auctionEndTime
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
    { state: 0, endTime: auctionEndTime + 1_000n, reason: "Auction is not expired yet." },
    { state: 2, endTime: auctionEndTime, reason: "Auction is already finalized." }
  ])("detects concurrent state $state / deadline changes before signature", async ({ state, endTime, reason }) => {
    const { readContract, writeContract, onFinalizeComplete, liveAuction } = setupFinalize();
    readContract.mockResolvedValue({ ...liveAuction, state: state as 0 | 1 | 2, endTime });
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
    expect(await screen.findByText(/On-chain auction data is temporarily unavailable or incomplete/)).toBeInTheDocument();
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
    const f = setupFinalize(undefined, { highestBidder: zeroAddress, highestBid: "0", participantCount: "0", bidCount: "0" });
    f.log.topics = encodeEventTopics({ abi: auctionHouseAbi, eventName: "AuctionFinalized", args: { auctionId: 1n,
      winner: zeroAddress } });
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
  f.view.rerender(<WalletFinalizePanel expectedChainId={31337} expectedAuctionHouse={testAddresses.auctionHouse} auction={changed === "auction" ? { ...f.auction, auctionId: "2" } : f.auction} onFinalizeComplete={f.onFinalizeComplete} />);
  release(f.receipt);
  await screen.findByText("Confirmation not verified");
  expect(f.onFinalizeComplete).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Verify transaction" }))[changed === "auction" ? "toBeEnabled" : "toBeDisabled"]());
  vi.mocked(useAccount).mockReturnValue(originalAccount);
  f.view.rerender(<WalletFinalizePanel expectedChainId={31337} expectedAuctionHouse={testAddresses.auctionHouse} auction={f.auction} onFinalizeComplete={f.onFinalizeComplete} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Verify transaction" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
  await screen.findByText("Auction finalized.");
  expect(f.writeContract).toHaveBeenCalledTimes(1);
  expect(f.onFinalizeComplete).toHaveBeenCalledTimes(1);
});

describe("displayed finalization identity", () => {
  it.each(["seller", "nft", "tokenId", "startPrice", "startTime", "initialEndTime"] as const)("refuses reused-ID auction with different %s before any signature", async (field) => {
    const f = setupFinalize();
    const change = field === "seller" || field === "nft" ? testAddresses.primaryBidder : f.liveAuction[field] + 1n;
    f.readContract.mockResolvedValue({ ...f.liveAuction, [field]: change });
    await submitFinalize();
    await screen.findByText(/The displayed auction details no longer match/);
    expect(f.writeContract).not.toHaveBeenCalled();
    expect(f.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh auction details" }));
    await waitFor(() => expect(f.onFinalizeComplete).toHaveBeenCalledTimes(1));
    expect(f.writeContract).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Continue in wallet" })).not.toBeInTheDocument();
  });
  it.each(["displayed chain", "displayed house", "manifest house"])("rejects mismatched %s", async (changed) => {
    const f = setupFinalize();
    if (changed === "manifest house") vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...localDeploymentFixture,
      contracts: { ...localDeploymentFixture.contracts, auctionHouse: testAddresses.localNft } }), { status: 200 }));
    else f.view.rerender(<WalletFinalizePanel auction={f.auction} expectedChainId={changed === "displayed chain" ? 1 : 31337}
      expectedAuctionHouse={changed === "displayed house" ? testAddresses.localNft : testAddresses.auctionHouse} onFinalizeComplete={f.onFinalizeComplete} />);
    await submitFinalize();
    await screen.findByText(/The displayed auction details no longer match/);
    expect(f.writeContract).not.toHaveBeenCalled();
  });
  it.each(["0x1", "0x7a69junk"])("does not accept selected provider chain %s", async (chain) => {
    const f = setupFinalize();
    providerB.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [testAddresses.primaryBidder] : chain);
    await submitFinalize();
    await screen.findByText(/Wallet connected, but not on the target chain/);
    expect(f.writeContract).not.toHaveBeenCalled();
  });
  it("refuses a loaded AuctionHouse different from the displayed house before any auction read", async () => {
    const f = setupFinalize(undefined, {}, auctionEndTime, { ...localDeploymentFixture,
      contracts: { ...localDeploymentFixture.contracts, auctionHouse: testAddresses.localNft } });
    await submitFinalize();
    await screen.findByText(/The displayed auction details no longer match/);
    expect(f.writeContract).not.toHaveBeenCalled();
    expect(f.readContract).not.toHaveBeenCalled();
    expect(f.getBlock).not.toHaveBeenCalled();
  });
  it("accepts a freshly reread manifest with the same addresses and changed generation metadata", async () => {
    const f = setupFinalize();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ...localDeploymentFixture,
      generatedAt: "2026-10-08T12:00:00.000Z", source: "refreshed" }), { status: 200 }));
    await submitFinalize();
    await screen.findByText("Auction finalized.");
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["unknown", "missing", "malformed"])("safely refuses %s auction data", async (invalid) => {
    const f = setupFinalize();
    const tuple = invalid === "unknown" ? { ...f.liveAuction, seller: `0x${"0".repeat(40)}` }
      : invalid === "missing" ? { ...f.liveAuction, startTime: undefined } : { ...f.liveAuction, tokenId: "1" };
    f.readContract.mockResolvedValue(tuple as typeof f.liveAuction);
    await submitFinalize();
    await screen.findByText(/On-chain auction data is temporarily unavailable or incomplete/);
    expect(screen.queryByText(/details no longer match/)).not.toBeInTheDocument();
    expect(f.writeContract).not.toHaveBeenCalled();
  });
  it("allows mutable bid and participant changes while pinning all finalization reads", async () => {
    const f = setupFinalize(undefined, {}, auctionEndTime + 2_000n);
    f.readContract.mockResolvedValue({ ...f.liveAuction, endTime: auctionEndTime + 1_000n, extensionsUsed: 1, highestBid: f.liveAuction.highestBid + 999n,
      highestBidder: testAddresses.secondBidder, participantCount: 10n, bidCount: 20n });
    await submitFinalize();
    await screen.findByText("Auction finalized.");
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    expect(f.readContract).toHaveBeenCalledWith(expect.objectContaining({ blockNumber: 42n }));
    expect(f.getBlock).toHaveBeenNthCalledWith(1, { blockTag: "latest" });
    expect(f.getBlock).toHaveBeenNthCalledWith(2, { blockNumber: 42n });
  });
  it.each(["hash", "number", "missing hash"])("refuses inconsistent reference %s before signing", async (change) => {
    const f = setupFinalize();
    f.getBlock.mockResolvedValueOnce({ timestamp: auctionEndTime, number: 42n, hash: `0x${"a".repeat(64)}` });
    f.getBlock.mockResolvedValue({ timestamp: auctionEndTime, number: change === "number" ? 41n : 42n,
      hash: change === "missing hash" ? null : `0x${"b".repeat(64)}` } as Awaited<ReturnType<typeof f.getBlock>>);
    await submitFinalize();
    await screen.findByText(/On-chain auction data is temporarily unavailable or incomplete/);
    expect(f.writeContract).not.toHaveBeenCalled();
  });
  it.each(["account", "chain", "connection", "connector", "connector instance", "auction ID", "same-ID lot", "displayed chain", "displayed house"]
    .flatMap((change) => [{ change, returns: false }, { change, returns: true }]))("refuses stale preflight after $change changes, return=$returns", async ({ change, returns }) => {
    const f = setupFinalize(); const original = vi.mocked(useAccount)();
    const read = deferred<typeof f.liveAuction>();
    f.readContract.mockImplementationOnce(() => read.promise);
    await submitFinalize();
    await waitFor(() => expect(f.readContract).toHaveBeenCalledTimes(1));
    const next = change === "account" ? { ...original, address: testAddresses.secondBidder }
      : change === "chain" ? { ...original, chainId: 1 }
        : change === "connection" ? { ...original, isConnected: false }
          : change === "connector" ? { ...original, connector: { ...connectorB, uid: "changed" } }
            : change === "connector instance" ? { ...original, connector: { ...connectorB } } : original;
    vi.mocked(useAccount).mockReturnValue(next as ReturnType<typeof useAccount>);
    f.view.rerender(<WalletFinalizePanel auction={change === "same-ID lot" ? { ...f.auction, tokenId: "2" }
      : change === "auction ID" ? { ...f.auction, auctionId: "2" } : f.auction}
      expectedChainId={change === "displayed chain" ? 1 : 31337} expectedAuctionHouse={change === "displayed house" ? testAddresses.localNft : testAddresses.auctionHouse}
      onFinalizeComplete={f.onFinalizeComplete} />);
    if (returns) {
      vi.mocked(useAccount).mockReturnValue(original);
      f.view.rerender(<WalletFinalizePanel auction={f.auction} expectedChainId={31337}
        expectedAuctionHouse={testAddresses.auctionHouse} onFinalizeComplete={f.onFinalizeComplete} />);
    }
    await act(async () => { read.resolve(f.liveAuction); });
    await screen.findByText(/The displayed auction details no longer match/);
    expect(f.writeContract).not.toHaveBeenCalled();
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
  });
  it("refuses a deployment change during preflight, including vault-only change", async () => {
    const f = setupFinalize();
    let release: (value: typeof f.liveAuction) => void = () => {};
    f.readContract.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await submitFinalize(); await waitFor(() => expect(f.readContract).toHaveBeenCalledTimes(1));
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...localDeploymentFixture,
      contracts: { ...localDeploymentFixture.contracts, escrowVault: testAddresses.localNft } }), { status: 200 }));
    await act(async () => { release(f.liveAuction); });
    await screen.findByText(/The displayed auction details no longer match/);
    expect(f.writeContract).not.toHaveBeenCalled();
  });
  it("does not dispatch a preflight completed after the panel unmounts", async () => {
    const f = setupFinalize();
    let release: (value: typeof f.liveAuction) => void = () => {};
    f.readContract.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await submitFinalize(); await waitFor(() => expect(f.readContract).toHaveBeenCalledTimes(1));
    f.view.unmount(); await act(async () => { release(f.liveAuction); });
    expect(f.writeContract).not.toHaveBeenCalled();
  });
  it.each(["fresh deployment", "final chain"])("checks the context again after the final %s await, even after return", async (boundary) => {
    const f = setupFinalize();
    const manifest = deferred<Response>();
    const chain = deferred<string>();
    if (boundary === "fresh deployment") {
      vi.mocked(fetch).mockImplementationOnce(() => manifest.promise);
    } else {
      let chainChecks = 0;
      providerB.request.mockImplementation(async ({ method }) => {
        if (method === "eth_accounts") return [testAddresses.primaryBidder];
        chainChecks += 1;
        return chainChecks === 2 ? chain.promise : "0x7a69";
      });
    }
    await submitFinalize();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    if (boundary === "final chain") await waitFor(() => expect(providerB.request.mock.calls
      .filter(([request]) => request.method === "eth_chainId")).toHaveLength(2));
    f.view.rerender(<WalletFinalizePanel auction={{ ...f.auction, tokenId: "2" }} expectedChainId={31337}
      expectedAuctionHouse={testAddresses.auctionHouse} onFinalizeComplete={f.onFinalizeComplete} />);
    f.view.rerender(<WalletFinalizePanel auction={f.auction} expectedChainId={31337}
      expectedAuctionHouse={testAddresses.auctionHouse} onFinalizeComplete={f.onFinalizeComplete} />);
    await act(async () => {
      if (boundary === "fresh deployment") manifest.resolve(new Response(JSON.stringify(localDeploymentFixture), { status: 200 }));
      else chain.resolve("0x7a69");
    });
    await screen.findByText(/The displayed auction details no longer match/);
    expect(f.writeContract).not.toHaveBeenCalled();
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["unavailable", "malformed"])("fails closed when the fresh dispatch manifest is %s", async (failure) => {
    const f = setupFinalize();
    if (failure === "unavailable") vi.mocked(fetch).mockRejectedValueOnce(new Error("RPC unavailable"));
    else vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ...localDeploymentFixture, contracts: {} }), { status: 200 }));
    await submitFinalize();
    await screen.findByText(/On-chain auction data is temporarily unavailable or incomplete/);
    expect(screen.queryByText(/details no longer match/)).not.toBeInTheDocument();
    expect(f.writeContract).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]).toEqual(["/deployments/31337.json", { cache: "no-store" }]);
  });
  it("rechecks the selected provider chain after the manifest read and before signing", async () => {
    const f = setupFinalize();
    let chainChecks = 0;
    providerB.request.mockImplementation(async ({ method }) => {
      if (method === "eth_accounts") return [testAddresses.primaryBidder];
      chainChecks += 1;
      return chainChecks === 1 ? "0x7a69" : "0x1";
    });
    await submitFinalize();
    await screen.findByText(/Wallet connected, but not on the target chain/);
    expect(f.writeContract).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps exact large integer identity and accepts case-insensitive addresses", async () => {
    const f = setupFinalize(undefined, { auctionId: "9007199254740993", tokenId: "9007199254740995",
      startPrice: "9007199254740997", seller: `0x${"A".repeat(40)}`, nft: `0x${"B".repeat(40)}` });
    f.readContract.mockResolvedValue({ ...f.liveAuction, seller: f.liveAuction.seller.toLowerCase() as Address,
      nft: f.liveAuction.nft.toLowerCase() as Address });
    await submitFinalize();
    await screen.findByText("Auction finalized.");
    expect(f.writeContract).toHaveBeenCalledWith(expect.objectContaining({ args: [9007199254740993n] }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("requires a new review after refreshing from lot A to the reused-ID lot B", async () => {
    const onRefresh = vi.fn(async () => {
      f.view.rerender(<WalletFinalizePanel auction={{ ...f.auction, tokenId: "2" }} expectedChainId={31337}
        expectedAuctionHouse={testAddresses.auctionHouse} onFinalizeComplete={onRefresh} />);
    });
    const f = setupFinalize(onRefresh);
    f.readContract.mockResolvedValue({ ...f.liveAuction, tokenId: 2n });
    await submitFinalize();
    await screen.findByText(/The displayed auction details no longer match/);
    expect(f.writeContract).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh auction details" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Continue in wallet" })).not.toBeInTheDocument();
    expect(f.writeContract).not.toHaveBeenCalled();
    await submitFinalize();
    await screen.findByText("Auction finalized.");
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
  it("retains pending submitted evidence when the same ID now displays another lot", async () => {
    const f = setupFinalize();
    const receipt = deferred<typeof f.receipt>();
    f.waitForTransactionReceipt.mockImplementationOnce(() => receipt.promise);
    await submitFinalize();
    await waitFor(() => expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(1));
    f.view.rerender(<WalletFinalizePanel auction={{ ...f.auction, seller: testAddresses.secondBidder }} expectedChainId={31337}
      expectedAuctionHouse={testAddresses.auctionHouse} onFinalizeComplete={f.onFinalizeComplete} />);
    await act(async () => { receipt.resolve(f.receipt); });
    await screen.findByText("Confirmation not verified");
    expect(screen.getByTestId("wallet-transaction-status").querySelector("[title]")).toHaveAttribute("title", txHash);
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
    await screen.findByText("Previously submitted auction #1 finalized.");
    expect(screen.queryByText("Auction finalized.")).not.toBeInTheDocument();
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
  it("preserves original and replacement hashes when verifying a previously reviewed lot", async () => {
    const f = setupFinalize();
    installReplacement(f);
    const replacementWait = f.waitForTransactionReceipt.getMockImplementation()!;
    f.waitForTransactionReceipt.mockImplementationOnce(async (options) => {
      await replacementWait(options);
      throw new Error("Receipt temporarily unavailable");
    });
    await submitFinalize();
    await screen.findByText("Confirmation not verified");
    f.waitForTransactionReceipt.mockResolvedValue(f.receipt);
    f.view.rerender(<WalletFinalizePanel auction={{ ...f.auction, tokenId: "2" }} expectedChainId={31337}
      expectedAuctionHouse={testAddresses.auctionHouse} onFinalizeComplete={f.onFinalizeComplete} />);
    expect(screen.getByTestId("wallet-transaction-status").textContent).toContain(txHash);
    fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
    await screen.findByText("Previously submitted auction #1 finalized.");
    const status = screen.getByTestId("wallet-transaction-status");
    expect(status.querySelector("[title]")).toHaveAttribute("title", `0x${"7".repeat(64)}`);
    expect(status.textContent).toContain(txHash);
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
  it("updates a replacement hash observed while confirmation was pending on another displayed lot", async () => {
    const f = setupFinalize();
    installReplacement(f);
    const replacementWait = f.waitForTransactionReceipt.getMockImplementation()!;
    const receipt = deferred<typeof f.receipt>();
    f.waitForTransactionReceipt.mockImplementationOnce(async (options) => {
      await receipt.promise;
      return replacementWait(options);
    });
    await submitFinalize();
    await waitFor(() => expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(1));
    f.view.rerender(<WalletFinalizePanel auction={{ ...f.auction, tokenId: "2" }} expectedChainId={31337}
      expectedAuctionHouse={testAddresses.auctionHouse} onFinalizeComplete={f.onFinalizeComplete} />);
    await act(async () => { receipt.resolve(f.receipt); });
    await screen.findByText("Confirmation not verified");
    const status = screen.getByTestId("wallet-transaction-status");
    await waitFor(() => expect(status.querySelector("[title]")).toHaveAttribute("title", `0x${"7".repeat(64)}`));
    expect(status.textContent).toContain(txHash);
    expect(screen.queryByText("Auction finalized.")).not.toBeInTheDocument();
    expect(f.onFinalizeComplete).not.toHaveBeenCalled();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
  it("keeps unknown submitted evidence and verifies the original lot under a different same-ID lot", async () => {
    const f = setupFinalize();
    f.waitForTransactionReceipt.mockRejectedValueOnce(new Error("unavailable"));
    await submitFinalize(); await screen.findByText("Confirmation not verified");
    f.view.rerender(<WalletFinalizePanel auction={{ ...f.auction, tokenId: "2" }} expectedChainId={31337}
      expectedAuctionHouse={testAddresses.auctionHouse} onFinalizeComplete={f.onFinalizeComplete} />);
    expect(screen.getByText(/Transaction for the previously reviewed auction #1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify transaction" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
    await screen.findByText("Previously submitted auction #1 finalized.");
    expect(screen.queryByText("Auction finalized.")).not.toBeInTheDocument();
    expect(f.onFinalizeComplete).not.toHaveBeenCalled(); expect(f.writeContract).toHaveBeenCalledTimes(1);
    expect(f.getTransaction).toHaveBeenLastCalledWith({ hash: txHash });
  });
});
