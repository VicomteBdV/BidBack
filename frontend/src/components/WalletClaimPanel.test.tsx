import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeEventTopics, encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { useAccount } from "wagmi";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SerializedAuction } from "@/lib/auctionTypes";
import type { Deployment } from "@/lib/deployment";
import { WalletClaimPanel } from "@/components/WalletClaimPanel";
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

const txHash = "0x3333333333333333333333333333333333333333333333333333333333333333" as const;

const providerA = { request: vi.fn() };
const providerB = { request: vi.fn(async ({ method }: { method: string }): Promise<unknown> =>
  method === "eth_accounts" ? [vi.mocked(useAccount)().address] : "0x7a69") };
const connectorB = { uid: "wallet-b", name: "Wallet B", getProvider: vi.fn(async () => providerB) };

function setupClaims({
  refundableAmount = 1_000_000_000_000_000_000n,
  refundClaimed = false,
  rewardEntitlement = 100_000_000_000_000_000n,
  rewardClaimed = false,
  sellerCredit = 2_000_000_000_000_000_000n,
  protocolFeeCredit = 10_000_000_000_000_000n,
  onActionComplete = vi.fn(async () => undefined),
  auctionOverrides = {},
  failedReads = new Set<string>(),
  expectedChainId = 31337,
  expectedAuctionHouse = testAddresses.auctionHouse,
  loadedDeployment = localDeploymentFixture
}: {
  refundableAmount?: bigint;
  refundClaimed?: boolean;
  rewardEntitlement?: bigint;
  rewardClaimed?: boolean;
  sellerCredit?: bigint;
  protocolFeeCredit?: bigint;
  onActionComplete?: () => Promise<void>;
  auctionOverrides?: Partial<SerializedAuction>;
  failedReads?: Set<string>;
  expectedChainId?: number;
  expectedAuctionHouse?: Address;
  loadedDeployment?: Deployment;
} = {}) {
  const account = testAddresses.primaryBidder;
  vi.mocked(useAccount).mockReturnValue({ address: account, chainId: 31337, isConnected: true, connector: connectorB } as unknown as ReturnType<typeof useAccount>);

  const auction = { ...auctionDetailFixture.auction, state: 2 as const, stateLabel: "FINALIZED", finalized: true,
    nftClaimed: false, seller: account, highestBidder: account, auctionFeeRecipient: account, ...auctionOverrides };
  const liveAuction = { seller: auction.seller, nft: auction.nft, tokenId: BigInt(auction.tokenId),
    startPrice: BigInt(auction.startPrice), startTime: BigInt(auction.startTime), initialEndTime: BigInt(auction.initialEndTime),
    endTime: BigInt(auction.endTime), extensionsUsed: auction.extensionsUsed, state: 2,
    highestBidder: auction.highestBidder, highestBid: BigInt(auction.highestBid), participantCount: BigInt(auction.participantCount),
    bidCount: BigInt(auction.bidCount), nftClaimed: auction.nftClaimed };
  const readValues: Record<string, unknown> = { refundableAmount, refundClaimed, entitlementOf: rewardEntitlement,
    claimed: rewardClaimed, sellerCredits: sellerCredit, protocolFeeCredits: protocolFeeCredit };
  const readContract = vi.fn(async ({ functionName }: { functionName: string; blockNumber?: bigint; args?: readonly unknown[] }) => {
    if (failedReads.has(functionName)) throw new Error(`Unavailable: ${functionName}`);
    if (functionName === "getAuction") return liveAuction;
    if (functionName in readValues) return readValues[functionName];
    throw new Error(`Unexpected read: ${functionName}`);
  });
  const blockHash = `0x${"a".repeat(64)}` as Hex;
  const getBlock = vi.fn(async (_options?: unknown) => ({ number: 42n, hash: blockHash, timestamp: BigInt(auction.endTime) }));
  const transaction = { hash: txHash as Hex, from: account as Address, to: testAddresses.auctionHouse as Address, input: "0x" as Hex,
    value: 0n, nonce: 5, chainId: 31337, blockHash, blockNumber: 42n, transactionIndex: 0 };
  const log = { address: transaction.to, topics: [] as Hex[], data: "0x" as Hex,
    transactionHash: txHash as Hex, blockHash, blockNumber: 42n, transactionIndex: 0, logIndex: 0, removed: false };
  const receipt = { status: "success", transactionHash: txHash as Hex, from: account as Address, to: transaction.to,
    blockHash, blockNumber: 42n, transactionIndex: 0, logs: [log] };
  const waitForTransactionReceipt = vi.fn(async (_options?: unknown) => receipt);
  const getTransaction = vi.fn(async () => transaction);
  const getChainId = vi.fn(async () => 31337);
  const prepareAction = (request: { abi: Abi; address: `0x${string}`; functionName: string; args?: readonly bigint[] }) => {
    transaction.to = request.address;
    transaction.input = encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args });
    const events: Record<string, { abi: Abi; name: string; args: Record<string, bigint | string>; amount?: bigint }> = {
      claimNft: { abi: auctionHouseAbi, name: "NFTClaimed", args: { auctionId: request.args?.[0] ?? 1n, claimant: account } },
      claimRefund: { abi: escrowVaultAbi, name: "RefundClaimed", args: { auctionId: request.args?.[0] ?? 1n, bidder: account }, amount: refundableAmount },
      claim: { abi: distributionVaultAbi, name: "DistributionClaimed", args: { auctionId: request.args?.[0] ?? 1n, claimant: account }, amount: rewardEntitlement },
      withdrawSellerProceeds: { abi: escrowVaultAbi, name: "SellerProceedsWithdrawn", args: { seller: account }, amount: sellerCredit },
      withdrawProtocolFees: { abi: escrowVaultAbi, name: "ProtocolFeesWithdrawn", args: { recipient: account }, amount: protocolFeeCredit }
    };
    const event = events[request.functionName];
    log.address = request.address;
    log.topics = encodeEventTopics({ abi: event.abi, eventName: event.name, args: event.args }) as Hex[];
    log.data = event.amount === undefined ? "0x" : encodeAbiParameters([{ type: "uint256" }], [event.amount]);
    receipt.to = request.address;
  };
  const writeContract = vi.fn(async (request: { abi: Abi; address: `0x${string}`; functionName: string; args?: readonly bigint[] }) => {
    prepareAction(request); return txHash;
  });
  vi.mocked(createPublicClient).mockReturnValue({ readContract, getBlock, waitForTransactionReceipt, getTransaction, getChainId } as unknown as ReturnType<typeof createPublicClient>);
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

  const view = render(<WalletClaimPanel auction={auction} expectedChainId={expectedChainId} expectedAuctionHouse={expectedAuctionHouse} onActionComplete={onActionComplete} />);

  return { writeContract, onActionComplete, readContract, getBlock, liveAuction, readValues, failedReads, waitForTransactionReceipt, getTransaction, getChainId, transaction, receipt, log, prepareAction, view, auction };
}

beforeEach(() => vi.clearAllMocks());

describe("WalletClaimPanel", () => {
  it.each([
    ["claim nft", "claimNft", [1n]],
    ["claim refund", "claimRefund", [1n]],
    ["claim redistribution", "claim", [1n]],
    ["withdraw proceeds", "withdrawSellerProceeds", undefined],
    ["withdraw protocol fees", "withdrawProtocolFees", undefined]
  ])("dispatches %s through connected B with unchanged arguments", async (label, functionName, args) => {
    const { writeContract } = setupClaims();
    const review = await screen.findByRole("button", { name: `Review ${label}` });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await waitFor(() => expect(providerB.request).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" })));
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName }));
    expect((writeContract.mock.calls[0] as unknown as [{ args?: unknown }])[0].args).toEqual(args);
    expect(providerA.request).not.toHaveBeenCalled();
  });

  it("keeps all simultaneously eligible finalized actions visible and marks global credits", async () => {
    setupClaims();
    await screen.findByText("Global seller proceeds credit");

    for (const name of [
      "Review claim nft",
      "Review claim refund",
      "Review claim redistribution",
      "Review withdraw proceeds",
      "Review withdraw protocol fees"
    ]) {
      await waitFor(() => expect(screen.getByRole("button", { name })).toBeEnabled());
    }
    expect(screen.getByRole("button", { name: "Review claim refund" })).toHaveClass("transaction-secondary-action");
    expect(screen.queryByText("Wallet claim data loaded.")).not.toBeInTheDocument();
    expect(screen.getAllByText(/global credit/i).length).toBeGreaterThanOrEqual(2);
  });

  it("shows zero available and offers no new signature after refund and redistribution claims", async () => {
    const { writeContract } = setupClaims({ refundClaimed: true, rewardClaimed: true });

    await screen.findByText("Refund already claimed.");
    expect(screen.getByText("Refund available").nextElementSibling).toHaveTextContent("0 ETH");
    expect(screen.getByText("Redistribution available").nextElementSibling).toHaveTextContent("0 ETH");
    expect(screen.getByRole("button", { name: "Review claim refund" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review claim redistribution" })).toBeDisabled();
    expect(screen.getByText("Redistribution already claimed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue in wallet" })).not.toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Claim network, contract, and recorded amount details"));
    expect(screen.getByText("Recorded refundable amount").nextElementSibling).toHaveTextContent("1 ETH");
    expect(screen.getByText("Recorded redistribution entitlement").nextElementSibling).toHaveTextContent("0.1 ETH");
  });

  it("keeps claim diagnostics collapsed by default", async () => {
    setupClaims();
    await screen.findByText("Global seller proceeds credit");
    const summary = screen.getByText("Claim network, contract, and recorded amount details");

    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("keeps refund and redistribution separate and preserves their contract calls", async () => {
    const { writeContract } = setupClaims();
    await screen.findByText("Global seller proceeds credit");
    const refundButton = screen.getByRole("button", { name: "Review claim refund" });
    await waitFor(() => expect(refundButton).toBeEnabled());
    fireEvent.click(refundButton);

    expect(screen.getByRole("heading", { name: "Claim refund" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review claim refund" })).toBeInTheDocument();
    expect(screen.getByText(/A refund returns refundable cap. It is separate from conditional redistribution/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "claimRefund",
      args: [1n]
    })));
    expect(await screen.findByText("Refund claimed.")).toBeInTheDocument();
    expect(screen.queryByText(/Action state refreshed/)).not.toBeInTheDocument();
  });

  it("treats zero redistribution as a non-error state and offers no claim signature", async () => {
    const { writeContract } = setupClaims({ rewardEntitlement: 0n });
    const button = await screen.findByRole("button", { name: "Review claim redistribution" });

    await screen.findByText("No redistribution is currently claimable.");
    expect(screen.getByRole("heading", { name: "Claim redistribution" })).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Review claim redistribution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue in wallet" })).not.toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("keeps a successful claim confirmed when the read-model refresh fails", async () => {
    const { writeContract } = setupClaims({ onActionComplete: vi.fn(async () => { throw new Error("refresh unavailable"); }) });
    await screen.findByText("Global seller proceeds credit");
    const redistributionButton = screen.getByRole("button", { name: "Review claim redistribution" });
    await waitFor(() => expect(redistributionButton).toBeEnabled());
    fireEvent.click(redistributionButton);
    expect(screen.getByRole("heading", { name: "Review claim redistribution" })).toBeInTheDocument();
    expect(screen.getByText(/Redistribution is conditional, can be zero/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Transaction confirmed")).toBeInTheDocument();
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "claim", args: [1n] }));
    expect(screen.getByText(/Displayed action data could not be fully refreshed/)).toBeInTheDocument();
    expect(screen.queryByText("Transaction failed")).not.toBeInTheDocument();
  });
  it.each([
    { label: "already claimed", live: { nftClaimed: true }, reason: "NFT already claimed." },
    { label: "wrong beneficiary", live: { highestBidder: testAddresses.secondBidder }, reason: "Connected wallet is not the NFT claimant. Expected winner." },
    { label: "not finalized", live: { state: 1 }, reason: "Auction is not finalized." }
  ])("blocks an NFT signature when the live auction is $label", async ({ live, reason }) => {
    const { liveAuction, writeContract, readContract, onActionComplete } = setupClaims();
    const review = await screen.findByRole("button", { name: "Review claim nft" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    Object.assign(liveAuction, live);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "getAuction", args: [1n] }));
    expect(writeContract).not.toHaveBeenCalled();
    expect(onActionComplete).toHaveBeenCalledTimes(1);
  });

  it("allows the seller to claim the NFT after a no-bid finalization", async () => {
    const { writeContract } = setupClaims({ auctionOverrides: {
      highestBidder: "0x0000000000000000000000000000000000000000", highestBid: "0", participantCount: "0", economics: undefined
    }, refundableAmount: 0n, rewardEntitlement: 0n });
    const review = await screen.findByRole("button", { name: "Review claim nft" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    expect(await screen.findByText("NFT claimed.")).toBeInTheDocument();
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "claimNft", args: [1n] }));
  });

  it("keeps a direct refund accessible when redistribution reads fail and global economics are absent", async () => {
    setupClaims({ failedReads: new Set(["entitlementOf"]), auctionOverrides: { economics: undefined } });
    expect(await screen.findByText(/Some wallet claim data is unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Redistribution available").nextElementSibling).toHaveTextContent("Unavailable");
    expect(screen.getByRole("button", { name: "Review claim redistribution" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review claim refund" })).toBeEnabled();
  });

  it("replaces stale claim values with unavailable after a failed refresh", async () => {
    const { failedReads } = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: "Review claim refund" })).toBeEnabled());
    failedReads.add("refundableAmount");
    failedReads.add("refundClaimed");
    fireEvent.click(screen.getByRole("button", { name: "Refresh wallet claim data" }));
    expect(await screen.findByText(/Some wallet claim data is unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Refund available").nextElementSibling).toHaveTextContent("Unavailable");
    expect(screen.queryByText("No refund available.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review claim refund" })).toBeDisabled();
  });

  it.each(["getAuction", "network"])("blocks NFT preflight when %s is unavailable or wrong", async (failure) => {
    const { failedReads, writeContract } = setupClaims();
    const review = await screen.findByRole("button", { name: "Review claim nft" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    if (failure === "network") {
      providerB.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [testAddresses.primaryBidder] : "0x1");
    } else failedReads.add(failure);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    expect(await screen.findByText(failure === "getAuction" ? /On-chain auction data is temporarily unavailable/ : "Transaction failed")).toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("explains global credit in the proceeds review without auction attribution", async () => {
    setupClaims();
    const review = await screen.findByRole("button", { name: "Review withdraw proceeds" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    expect(screen.getByText("Wallet-level / global credit")).toBeInTheDocument();
    expect(screen.getByText(/not attributed solely to this lot/)).toBeInTheDocument();
  });

  it.each(["rejected", "reverted", "unknown"])("preserves a %s NFT transaction outcome after preflight", async (outcome) => {
    const { writeContract, waitForTransactionReceipt, onActionComplete, receipt } = setupClaims();
    if (outcome === "rejected") writeContract.mockRejectedValue({ code: 4001 });
    if (outcome === "reverted") waitForTransactionReceipt.mockResolvedValue({ ...receipt, status: "reverted" });
    if (outcome === "unknown") waitForTransactionReceipt.mockRejectedValue(new Error("Receipt unavailable"));
    const review = await screen.findByRole("button", { name: "Review claim nft" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    const message = outcome === "rejected" ? "Transaction rejected in wallet."
      : outcome === "reverted" ? "The transaction was included on-chain but reverted."
      : "The transaction was submitted, but its on-chain result could not be verified.";
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("NFT claimed.")).not.toBeInTheDocument();
    expect(onActionComplete).not.toHaveBeenCalled();
  });

});

// Every component scenario uses B, while the legacy global points at unrelated A.
afterEach(() => {
  expect(providerA.request).not.toHaveBeenCalled();
});

const claimActions = [
  { label: "claim nft", success: "NFT claimed." },
  { label: "claim refund", success: "Refund claimed." },
  { label: "claim redistribution", success: "Redistribution claimed." },
  { label: "withdraw proceeds", success: "Proceeds withdrawn." },
  { label: "withdraw protocol fees", success: "Protocol fees withdrawn." }
];
async function submitClaim(label: string) {
  const review = await screen.findByRole("button", { name: `Review ${label}` });
  await waitFor(() => expect(review).toBeEnabled());
  fireEvent.click(review);
  fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
}

function claimReplacement(f: ReturnType<typeof setupClaims>, reason: string, change: Partial<typeof f.transaction>) {
  f.waitForTransactionReceipt.mockImplementation(async (options) => {
    const original = { ...f.transaction };
    const hash = `0x${"7".repeat(64)}` as Hex;
    Object.assign(f.transaction, { hash }, change);
    Object.assign(f.receipt, { transactionHash: hash, to: f.transaction.to, from: f.transaction.from });
    f.log.transactionHash = hash;
    (options as { onReplaced: (value: unknown) => void }).onReplaced({ reason,
      transaction: { ...f.transaction }, replacedTransaction: original, transactionReceipt: { ...f.receipt } });
    return f.receipt;
  });
}

describe.each(claimActions)("$label integrity", ({ label, success }) => {
  it.each(["rejected", "reverted", "cancelled", "fake repriced", "incompatible target", "incompatible function", "event missing", "event emitter", "wrong hash", "wrong sender"])("does not announce success for %s", async (scenario) => {
    const f = setupClaims();
    if (scenario === "rejected") f.writeContract.mockRejectedValue({ code: 4001 });
    if (scenario === "reverted") f.waitForTransactionReceipt.mockImplementation(async () => ({ ...f.receipt, status: "reverted" }));
    if (scenario === "cancelled" || scenario === "fake repriced") claimReplacement(f,
      scenario === "cancelled" ? "cancelled" : "repriced", { to: testAddresses.primaryBidder, input: "0x" });
    if (scenario === "incompatible target") claimReplacement(f, "repriced", { to: testAddresses.secondBidder });
    if (scenario === "incompatible function") claimReplacement(f, "repriced", { input: "0x12345678" });
    if (["event missing", "event emitter", "wrong hash", "wrong sender"].includes(scenario)) {
      f.waitForTransactionReceipt.mockImplementation(async () => {
        if (scenario === "event missing") f.receipt.logs = [];
        if (scenario === "event emitter") f.log.address = testAddresses.secondBidder;
        if (scenario === "wrong hash") f.receipt.transactionHash = `0x${"7".repeat(64)}`;
        if (scenario === "wrong sender") { f.transaction.from = testAddresses.secondBidder; f.receipt.from = testAddresses.secondBidder; }
        return f.receipt;
      });
    }
    await submitClaim(label);
    const phase = scenario === "rejected" ? "Transaction rejected"
      : scenario.startsWith("event") || scenario.startsWith("wrong") ? "Confirmation not verified" : "Transaction failed";
    await screen.findByText(phase);
    expect(screen.queryByText(success)).not.toBeInTheDocument();
    expect(f.onActionComplete).not.toHaveBeenCalled();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    if (scenario === "rejected") expect(screen.getByTestId("wallet-transaction-status").querySelector('[title]')).toBeNull();
  });
  it("confirms a compatible repricing on its effective hash", async () => {
    const f = setupClaims();
    claimReplacement(f, "repriced", {});
    await submitClaim(label);
    await screen.findByText(success);
    expect(f.onActionComplete).toHaveBeenCalledTimes(1);
    expect(f.getTransaction).toHaveBeenCalledWith({ hash: `0x${"7".repeat(64)}` });
    const status = screen.getByTestId("wallet-transaction-status");
    expect(status.querySelector('[title]')).toHaveAttribute("title", `0x${"7".repeat(64)}`);
    expect(status.textContent).toContain(txHash);
  });
  it("keeps favorable data refresh separate from unknown transaction proof and recovers without another signature", async () => {
    const f = setupClaims();
    f.waitForTransactionReceipt.mockRejectedValueOnce(new Error("RPC unavailable"));
    await submitClaim(label);
    await screen.findByText("Confirmation not verified");
    expect(f.onActionComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh wallet claim data" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh wallet claim data" })).toBeEnabled());
    expect(screen.getByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Review ${label}` })).toBeDisabled();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
    await screen.findByText(success);
    expect(f.onActionComplete).toHaveBeenCalledTimes(1);
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
  it("retains proof of success when the UI refresh fails", async () => {
    const f = setupClaims({ onActionComplete: vi.fn(async () => { throw new Error("UI unavailable"); }) });
    await submitClaim(label);
    expect(await screen.findByText("Transaction confirmed")).toBeInTheDocument();
    expect(screen.getByText(`${success} Displayed action data could not be fully refreshed.`)).toBeInTheDocument();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
});

it.each(claimActions.filter(({ label }) => label.startsWith("claim")))("a proven $label cannot request a duplicate signature while displayed data is stale", async ({ label, success }) => {
  const f = setupClaims();
  await submitClaim(label);
  await screen.findByText(success);
  expect(screen.getByRole("button", { name: `Review ${label}` })).toBeDisabled();
  expect(f.writeContract).toHaveBeenCalledTimes(1);
});

it.each(["account", "chain", "connector", "auction"])("retains immutable refund proof across a changed %s without attributing completion to it", async (changed) => {
  const f = setupClaims();
  const originalAccount = vi.mocked(useAccount)();
  let release: (receipt: typeof f.receipt) => void = () => {};
  f.waitForTransactionReceipt.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  await submitClaim("claim refund");
  await waitFor(() => expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(1));
  const nextAccount = changed === "account" ? { ...originalAccount, address: testAddresses.secondBidder }
    : changed === "chain" ? { ...originalAccount, chainId: 1 }
      : changed === "connector" ? { ...originalAccount, connector: { ...connectorB, uid: "other-connector" } } : originalAccount;
  vi.mocked(useAccount).mockReturnValue(nextAccount as unknown as ReturnType<typeof useAccount>);
  f.view.rerender(<WalletClaimPanel expectedChainId={31337} expectedAuctionHouse={testAddresses.auctionHouse} auction={changed === "auction" ? { ...f.auction, auctionId: "2" } : f.auction} onActionComplete={f.onActionComplete} />);
  release(f.receipt);
  await screen.findByText("Confirmation not verified");
  expect(f.onActionComplete).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Verify transaction" }))[changed === "auction" ? "toBeEnabled" : "toBeDisabled"]());
  vi.mocked(useAccount).mockReturnValue(originalAccount);
  f.view.rerender(<WalletClaimPanel expectedChainId={31337} expectedAuctionHouse={testAddresses.auctionHouse} auction={f.auction} onActionComplete={f.onActionComplete} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Verify transaction" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
  await screen.findByText("Refund claimed.");
  expect(f.writeContract).toHaveBeenCalledTimes(1);
  expect(f.onActionComplete).toHaveBeenCalledTimes(1);
});

it("refreshes the UI after a proved claim without changing its transaction result or signing again", async () => {
  const onRefresh = vi.fn(async () => undefined).mockRejectedValueOnce(new Error("Unavailable"));
  const f = setupClaims({ onActionComplete: onRefresh });
  await submitClaim("claim refund");
  await screen.findByText("Refund claimed. Displayed action data could not be fully refreshed.");
  fireEvent.click(screen.getByRole("button", { name: "Refresh auction and wallet claim data" }));
  await screen.findByText("Refund claimed.");
  expect(onRefresh).toHaveBeenCalledTimes(2);
  expect(f.writeContract).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Refresh auction and wallet claim data" })).not.toBeInTheDocument();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function rerenderClaims(f: ReturnType<typeof setupClaims>, auction = f.auction,
  expectedChainId = 31337, expectedAuctionHouse: Address = testAddresses.auctionHouse) {
  f.view.rerender(<WalletClaimPanel auction={auction} expectedChainId={expectedChainId}
    expectedAuctionHouse={expectedAuctionHouse} onActionComplete={f.onActionComplete} />);
}

function manifestResponse(value: unknown = localDeploymentFixture) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

async function expectNoSignature(f: ReturnType<typeof setupClaims>, explanation: RegExp = /The displayed auction details no longer match/) {
  expect((await screen.findAllByText(explanation)).length).toBeGreaterThan(0);
  expect(f.writeContract).not.toHaveBeenCalled();
  expect(providerB.request.mock.calls.some(([request]) => request.method === "eth_sendTransaction")).toBe(false);
  expect(f.onActionComplete).not.toHaveBeenCalled();
}

const auctionClaims = claimActions.filter(({ label }) => label.startsWith("claim"));
const unavailableData = /On-chain auction data is temporarily unavailable or incomplete/;
const immutableMismatches = [
  { field: "seller", value: testAddresses.secondBidder },
  { field: "nft", value: testAddresses.secondBidder },
  { field: "tokenId", value: 9007199254740993n },
  { field: "startPrice", value: 9007199254740995n },
  { field: "startTime", value: 1n },
  { field: "initialEndTime", value: 18446744073709551615n }
];

describe.each(auctionClaims)("$label displayed-lot identity", ({ label, success }) => {
  it.each(immutableMismatches)("refuses a reused ID with different $field before reading eligibility", async ({ field, value }) => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    f.readContract.mockClear();
    Object.assign(f.liveAuction, { [field]: value });
    await submitClaim(label);
    await expectNoSignature(f);
    expect(f.readContract).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Continue in wallet" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh auction details" })).toBeEnabled();
    expect(screen.getByText(/The displayed auction details no longer match/)).toHaveAttribute("role", "status");
  });

  it.each(["seller", "nft", "tokenId", "startPrice", "startTime", "initialEndTime", "endTime", "extensionsUsed",
    "state", "highestBidder", "highestBid", "participantCount", "bidCount", "nftClaimed"])("requires the complete live tuple including %s", async (field) => {
    const f = setupClaims();
    delete (f.liveAuction as Record<string, unknown>)[field];
    await submitClaim(label);
    await expectNoSignature(f, unavailableData);
    expect(screen.queryByText(/details no longer match/)).not.toBeInTheDocument();
  });

  it.each(["unknown ID", "malformed integer", "malformed address", "RPC failure", "block missing", "block RPC failure"])
    ("fails closed on %s without claiming that another lot replaced it", async (failure) => {
      const f = setupClaims();
      if (failure === "unknown ID") Object.assign(f.liveAuction, { seller: `0x${"0".repeat(40)}`, nft: `0x${"0".repeat(40)}` });
      if (failure === "malformed integer") Object.assign(f.liveAuction, { tokenId: "1" });
      if (failure === "malformed address") Object.assign(f.liveAuction, { seller: "0x1234" });
      if (failure === "RPC failure") f.failedReads.add("getAuction");
      if (failure === "block missing") f.getBlock.mockResolvedValue({ number: 42n } as Awaited<ReturnType<typeof f.getBlock>>);
      if (failure === "block RPC failure") f.getBlock.mockRejectedValue(new Error("RPC unavailable"));
      await submitClaim(label);
      await expectNoSignature(f, unavailableData);
      expect(screen.queryByText(/details no longer match/)).not.toBeInTheDocument();
    });

  it.each(["displayed chain", "displayed house", "malformed displayed field", "loaded house"])
    ("rejects %s before on-chain identity reads", async (failure) => {
      const f = setupClaims(failure === "displayed chain" ? { expectedChainId: 1 }
        : failure === "displayed house" ? { expectedAuctionHouse: testAddresses.localNft }
          : failure === "loaded house" ? { loadedDeployment: { ...localDeploymentFixture,
            contracts: { ...localDeploymentFixture.contracts, auctionHouse: testAddresses.localNft } } } : {});
      await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
      if (failure === "malformed displayed field") {
        rerenderClaims(f, { ...f.auction, tokenId: "bad" });
        await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
      }
      f.readContract.mockClear();
      await submitClaim(label);
      await expectNoSignature(f);
      expect(f.getBlock).not.toHaveBeenCalled();
      expect(f.readContract).not.toHaveBeenCalled();
    });

  it("uses exact large integers and case-insensitive addresses without pinning mutable auction fields", async () => {
    const f = setupClaims({ auctionOverrides: { auctionId: "9007199254740993", tokenId: "9007199254740995",
      startPrice: "9007199254740997", seller: `0x${"A".repeat(40)}`, nft: `0x${"B".repeat(40)}` } });
    Object.assign(f.liveAuction, { seller: f.liveAuction.seller.toLowerCase(), nft: f.liveAuction.nft.toLowerCase(),
      endTime: f.liveAuction.endTime + 100n, extensionsUsed: 1, highestBid: f.liveAuction.highestBid + 100n,
      participantCount: 99n, bidCount: 100n });
    await submitClaim(label);
    await screen.findByText(success);
    expect(f.writeContract).toHaveBeenCalledWith(expect.objectContaining({ args: [9007199254740993n] }));
    expect(f.getBlock).toHaveBeenNthCalledWith(1, { blockTag: "latest" });
    expect(f.getBlock).toHaveBeenNthCalledWith(2, { blockNumber: 42n });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]).toEqual(["/deployments/31337.json", { cache: "no-store" }]);
  });

  it.each(["hash", "number", "timestamp", "missing hash", "RPC failure"])("rejects a changed reference block %s before dispatch", async (failure) => {
    const f = setupClaims();
    const originalBlock = await f.getBlock();
    f.getBlock.mockClear();
    f.getBlock.mockResolvedValueOnce(originalBlock);
    if (failure === "RPC failure") f.getBlock.mockRejectedValue(new Error("Reset"));
    else f.getBlock.mockResolvedValue({ ...originalBlock, number: failure === "number" ? 41n : 42n,
      timestamp: failure === "timestamp" ? originalBlock.timestamp + 1n : originalBlock.timestamp,
      hash: failure === "missing hash" ? null : `0x${"b".repeat(64)}` } as Awaited<ReturnType<typeof f.getBlock>>);
    await submitClaim(label);
    await expectNoSignature(f, unavailableData);
  });

  it.each(["account", "chain", "connection", "connector", "connector instance", "auction ID", "same-ID lot", "displayed chain", "displayed house"]
    .flatMap((change) => [{ change, returns: false }, { change, returns: true }]))
    ("invalidates an asynchronous identity preflight after $change, return=$returns", async ({ change, returns }) => {
      const f = setupClaims();
      await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
      const original = vi.mocked(useAccount)();
      const read = deferred<typeof f.liveAuction>();
      const originalRead = f.readContract.getMockImplementation()!;
      f.readContract.mockImplementation(async (request) => request.functionName === "getAuction" ? read.promise : originalRead(request));
      await submitClaim(label);
      await waitFor(() => expect(f.readContract.mock.calls.some(([request]) => request.functionName === "getAuction")).toBe(true));
      const next = change === "account" ? { ...original, address: testAddresses.secondBidder }
        : change === "chain" ? { ...original, chainId: 1 }
          : change === "connection" ? { ...original, isConnected: false }
            : change === "connector" ? { ...original, connector: { ...connectorB, uid: "changed" } }
              : change === "connector instance" ? { ...original, connector: { ...connectorB } } : original;
      vi.mocked(useAccount).mockReturnValue(next as ReturnType<typeof useAccount>);
      rerenderClaims(f, change === "same-ID lot" ? { ...f.auction, tokenId: "2" }
        : change === "auction ID" ? { ...f.auction, auctionId: "2" } : f.auction,
      change === "displayed chain" ? 1 : 31337, change === "displayed house" ? testAddresses.localNft : testAddresses.auctionHouse);
      if (returns) { vi.mocked(useAccount).mockReturnValue(original); rerenderClaims(f); }
      await act(async () => { read.resolve(f.liveAuction); });
      await expectNoSignature(f);
    });

  it.each(["reference recheck", "fresh deployment", "final chain"])("rechecks the action epoch after the final %s await including away/back", async (boundary) => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    const originalBlock = await f.getBlock();
    f.getBlock.mockClear();
    const block = deferred<typeof originalBlock>();
    const manifest = deferred<Response>();
    const chain = deferred<string>();
    if (boundary === "reference recheck") f.getBlock.mockResolvedValueOnce(originalBlock).mockImplementationOnce(() => block.promise);
    if (boundary === "fresh deployment") vi.mocked(fetch).mockImplementationOnce(() => manifest.promise);
    if (boundary === "final chain") {
      let chainChecks = 0;
      providerB.request.mockClear();
      providerB.request.mockImplementation(async ({ method }) => {
        if (method === "eth_accounts") return [testAddresses.primaryBidder];
        return ++chainChecks === 2 ? chain.promise : "0x7a69";
      });
    }
    await submitClaim(label);
    if (boundary === "reference recheck") await waitFor(() => expect(f.getBlock).toHaveBeenCalledTimes(2));
    else await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    if (boundary === "final chain") await waitFor(() => expect(providerB.request.mock.calls.filter(([request]) => request.method === "eth_chainId")).toHaveLength(2));
    rerenderClaims(f, { ...f.auction, tokenId: "2" });
    rerenderClaims(f);
    await act(async () => {
      if (boundary === "reference recheck") block.resolve(originalBlock);
      else if (boundary === "fresh deployment") manifest.resolve(manifestResponse());
      else chain.resolve("0x7a69");
    });
    await expectNoSignature(f);
  });

  it.each(["unavailable", "malformed", "house changed", "dispatch vault changed"])("fails closed when the fresh manifest is %s", async (failure) => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    if (failure === "unavailable") vi.mocked(fetch).mockRejectedValueOnce(new Error("RPC unavailable"));
    else {
      const vault = label === "claim redistribution" ? "distributionVault" : "escrowVault";
      const value = failure === "malformed" ? { ...localDeploymentFixture, contracts: {} }
        : { ...localDeploymentFixture, contracts: { ...localDeploymentFixture.contracts,
          [failure === "house changed" || label === "claim nft" ? "auctionHouse" : vault]: testAddresses.localNft } };
      vi.mocked(fetch).mockImplementationOnce(async () => manifestResponse(value));
    }
    await submitClaim(label);
    await expectNoSignature(f, ["unavailable", "malformed"].includes(failure) ? unavailableData : undefined);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["wrong", "malformed", "unavailable"])("rechecks the actual selected provider chain (%s) immediately before dispatch", async (failure) => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    let chainChecks = 0;
    providerB.request.mockImplementation(async ({ method }) => {
      if (method === "eth_accounts") return [testAddresses.primaryBidder];
      if (++chainChecks === 1) return "0x7a69";
      if (failure === "unavailable") throw new Error("RPC unavailable");
      return failure === "malformed" ? "31337" : "0x1";
    });
    await submitClaim(label);
    await expectNoSignature(f, failure === "unavailable" ? /Wallet-signed claims require your wallet to access the target RPC/ : /Wallet connected, but not on the target chain/);
  });

  it.each(["provider resolution", "initial chain"])("guards an away/back change during %s before reading auction identity", async (boundary) => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    const provider = deferred<typeof providerB>();
    const chain = deferred<string>();
    let waiting = false;
    if (boundary === "provider resolution") connectorB.getProvider.mockImplementationOnce(() => { waiting = true; return provider.promise; });
    else providerB.request.mockImplementation(async ({ method }) => {
      if (method === "eth_accounts") return [testAddresses.primaryBidder];
      if (!waiting) { waiting = true; return chain.promise; }
      return "0x7a69";
    });
    await submitClaim(label);
    await waitFor(() => expect(waiting).toBe(true));
    rerenderClaims(f, { ...f.auction, tokenId: "2" });
    rerenderClaims(f);
    await act(async () => {
      if (boundary === "provider resolution") provider.resolve(providerB);
      else chain.resolve("0x7a69");
    });
    await expectNoSignature(f);
    expect(f.readContract.mock.calls.some(([request]) => request.functionName === "getAuction")).toBe(false);
  });

  it("never dispatches after an asynchronous preflight finishes on an unmounted panel", async () => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    const read = deferred<typeof f.liveAuction>();
    const originalRead = f.readContract.getMockImplementation()!;
    f.readContract.mockImplementation(async (request) => request.functionName === "getAuction" ? read.promise : originalRead(request));
    await submitClaim(label);
    await waitFor(() => expect(f.getBlock).toHaveBeenCalledTimes(1));
    f.view.unmount();
    await act(async () => { read.resolve(f.liveAuction); });
    expect(f.writeContract).not.toHaveBeenCalled();
  });
});

describe.each([
  { label: "claim refund", amount: "refundableAmount", flag: "refundClaimed", reason: "Refund already claimed." },
  { label: "claim redistribution", amount: "entitlementOf", flag: "claimed", reason: "Reward already claimed." }
])("$label coherent eligibility", ({ label, amount, flag, reason }) => {
  it("reads identity and both eligibility values at one reference block", async () => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    f.readContract.mockClear();
    await submitClaim(label);
    await screen.findByText("Transaction confirmed");
    for (const functionName of ["getAuction", amount, flag]) {
      expect(f.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName, blockNumber: 42n }));
    }
  });

  it.each(["not finalized", "already claimed", "zero amount", "amount RPC failure", "flag RPC failure", "bad amount", "bad flag"])
    ("preserves fail-closed eligibility for %s", async (failure) => {
      const f = setupClaims();
      await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
      if (failure === "not finalized") f.liveAuction.state = 1;
      if (failure === "already claimed") f.readValues[flag] = true;
      if (failure === "zero amount") f.readValues[amount] = 0n;
      if (failure === "amount RPC failure") f.failedReads.add(amount);
      if (failure === "flag RPC failure") f.failedReads.add(flag);
      if (failure === "bad amount") f.readValues[amount] = -1n;
      if (failure === "bad flag") f.readValues[flag] = "false";
      await submitClaim(label);
      await expectNoSignature(f, failure === "not finalized" ? /Auction is not finalized/ : failure === "already claimed" ? new RegExp(reason)
        : failure === "zero amount" ? /No (refund|reward) available/ : unavailableData);
    });

  it("invalidates an eligibility read across a same-ID lot change and return", async () => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    const eligibility = deferred<unknown>();
    const originalRead = f.readContract.getMockImplementation()!;
    f.readContract.mockImplementation(async (request) => request.functionName === amount && request.blockNumber === 42n
      ? eligibility.promise : originalRead(request));
    await submitClaim(label);
    await waitFor(() => expect(f.readContract.mock.calls.some(([request]) => request.functionName === amount && request.blockNumber === 42n)).toBe(true));
    rerenderClaims(f, { ...f.auction, tokenId: "2" });
    rerenderClaims(f);
    await act(async () => { eligibility.resolve(f.readValues[amount]); });
    await expectNoSignature(f);
  });
});

describe.each(claimActions.filter(({ label }) => label.startsWith("withdraw")))("$label independent global credit", ({ label, success }) => {
  it.each(["stale displayed chain", "stale displayed house", "malformed immutable", "live mismatch", "live RPC unavailable"])
    ("permits an eligible exit despite %s without an auction identity/block read", async (stale) => {
      const f = setupClaims(stale === "stale displayed chain" ? { expectedChainId: 1 }
        : stale === "stale displayed house" ? { expectedAuctionHouse: testAddresses.localNft } : {});
      await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
      if (stale === "malformed immutable") rerenderClaims(f, { ...f.auction, tokenId: "bad" });
      if (stale === "live mismatch") f.liveAuction.tokenId = 2n;
      if (stale === "live RPC unavailable") f.failedReads.add("getAuction");
      await submitClaim(label);
      await screen.findByText(success);
      expect(f.readContract.mock.calls.some(([request]) => request.functionName === "getAuction")).toBe(false);
      expect(f.getBlock).not.toHaveBeenCalled();
      expect(screen.getByText(/This withdrawal uses the submitting wallet's global credit/)).toBeInTheDocument();
      expect(screen.getByTestId("wallet-transaction-status")).toHaveTextContent("Wallet-level withdrawal");
      expect(f.writeContract).toHaveBeenCalledTimes(1);
    });

  it("ignores unrelated fresh house/distribution changes while retaining the current EscrowVault", async () => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    vi.mocked(fetch).mockImplementation(async () => manifestResponse({ ...localDeploymentFixture,
      contracts: { ...localDeploymentFixture.contracts, auctionHouse: testAddresses.localNft, distributionVault: testAddresses.localNft } }));
    await submitClaim(label);
    await screen.findByText(success);
    expect(f.writeContract).toHaveBeenCalledWith(expect.objectContaining({ address: testAddresses.escrowVault }));
    expect(f.getBlock).not.toHaveBeenCalled();
  });

  it("continues an eligible withdrawal across displayed lot changes without attributing a page refresh", async () => {
    const f = setupClaims();
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
    const creditName = label === "withdraw proceeds" ? "sellerCredits" : "protocolFeeCredits";
    const credit = deferred<unknown>();
    const originalRead = f.readContract.getMockImplementation()!;
    let held = false;
    f.readContract.mockImplementation(async (request) => {
      if (request.functionName === creditName && !held) { held = true; return credit.promise; }
      return originalRead(request);
    });
    await submitClaim(label);
    await waitFor(() => expect(held).toBe(true));
    rerenderClaims(f, { ...f.auction, tokenId: "2" }, 1, testAddresses.localNft);
    await act(async () => { credit.resolve(f.readValues[creditName]); });
    await screen.findByText(success);
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    expect(f.onActionComplete).not.toHaveBeenCalled();
    expect(screen.queryByText(/Previously reviewed auction/)).not.toBeInTheDocument();
  });

  it.each(["EscrowVault changed", "manifest unavailable", "wallet away/back", "no credit", "malformed credit"])
    ("keeps the global exit guard for %s", async (failure) => {
      const f = setupClaims();
      await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
      const creditName = label === "withdraw proceeds" ? "sellerCredits" : "protocolFeeCredits";
      if (failure === "EscrowVault changed") vi.mocked(fetch).mockImplementation(async () => manifestResponse({ ...localDeploymentFixture,
        contracts: { ...localDeploymentFixture.contracts, escrowVault: testAddresses.localNft } }));
      if (failure === "manifest unavailable") vi.mocked(fetch).mockRejectedValueOnce(new Error("Manifest unavailable"));
      if (failure === "no credit") f.readValues[creditName] = 0n;
      if (failure === "malformed credit") f.readValues[creditName] = "1";
      const credit = deferred<unknown>();
      let waitingForCredit = false;
      if (failure === "wallet away/back") {
        const originalRead = f.readContract.getMockImplementation()!;
        f.readContract.mockImplementation(async (request) => {
          if (request.functionName === creditName) { waitingForCredit = true; return credit.promise; }
          return originalRead(request);
        });
      }
      await submitClaim(label);
      if (failure === "wallet away/back") {
        await waitFor(() => expect(waitingForCredit).toBe(true));
        const original = vi.mocked(useAccount)();
        vi.mocked(useAccount).mockReturnValue({ ...original, address: testAddresses.secondBidder } as ReturnType<typeof useAccount>);
        rerenderClaims(f);
        vi.mocked(useAccount).mockReturnValue(original);
        rerenderClaims(f);
        await act(async () => { credit.resolve(f.readValues[creditName]); });
      }
      await expectNoSignature(f, failure === "no credit" ? /No (seller proceeds|protocol fees)/
        : ["manifest unavailable", "malformed credit"].includes(failure) ? unavailableData : undefined);
    });

  it.each(["invalid ID", "not finalized", "wrong beneficiary"])("retains the baseline page eligibility gate: %s", async (failure) => {
    const f = setupClaims({ auctionOverrides: failure === "invalid ID" ? { auctionId: "0" }
      : failure === "not finalized" ? { finalized: false } : label === "withdraw proceeds" ? { seller: testAddresses.secondBidder }
        : { auctionFeeRecipient: testAddresses.secondBidder } });
    await screen.findByText("Global seller proceeds credit");
    await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeDisabled());
    expect(f.writeContract).not.toHaveBeenCalled();
  });
});

it.each(auctionClaims)("clears completed $label from a different same-ID lot", async ({ label, success }) => {
  const f = setupClaims();
  await submitClaim(label);
  await screen.findByText(success);
  expect(screen.getByRole("button", { name: `Review ${label}` })).toBeDisabled();
  rerenderClaims(f, { ...f.auction, tokenId: "2" });
  await waitFor(() => expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled());
  expect(screen.getByText(/Transaction for the previously reviewed auction #1/)).toBeInTheDocument();
  expect(f.writeContract).toHaveBeenCalledTimes(1);
});

it.each(["lot", "wallet"])("does not apply stale background balances after a changed %s", async (change) => {
  const f = setupClaims();
  await waitFor(() => expect(screen.getByRole("button", { name: "Review claim refund" })).toBeEnabled());
  const oldRefund = deferred<unknown>();
  const oldCredit = deferred<unknown>();
  let holdRefund = true;
  let holdCredit = true;
  const originalRead = f.readContract.getMockImplementation()!;
  f.readContract.mockImplementation(async (request) => {
    if (request.functionName === "refundableAmount" && holdRefund) { holdRefund = false; return oldRefund.promise; }
    if (request.functionName === "sellerCredits" && holdCredit) { holdCredit = false; return oldCredit.promise; }
    return originalRead(request);
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh wallet claim data" }));
  await waitFor(() => expect(holdRefund || holdCredit).toBe(false));
  f.readValues.refundableAmount = 4_000_000_000_000_000_000n;
  f.readValues.sellerCredits = 5_000_000_000_000_000_000n;
  if (change === "wallet") vi.mocked(useAccount).mockReturnValue({ ...vi.mocked(useAccount)(), address: testAddresses.secondBidder } as ReturnType<typeof useAccount>);
  rerenderClaims(f, change === "lot" ? { ...f.auction, tokenId: "2" } : f.auction);
  await waitFor(() => expect(screen.getByText("Refund available").nextElementSibling).toHaveTextContent("4 ETH"));
  await act(async () => { oldRefund.resolve(99_000_000_000_000_000_000n); oldCredit.resolve(99_000_000_000_000_000_000n); });
  expect(screen.getByText("Refund available").nextElementSibling).toHaveTextContent("4 ETH");
  expect(screen.getByText("Global seller proceeds credit").nextElementSibling).toHaveTextContent("5 ETH");
  expect(f.writeContract).not.toHaveBeenCalled();
});

it.each(auctionClaims)("retains pending $label proof and verifies it historically under a reused-ID lot", async ({ label, success }) => {
  const f = setupClaims();
  const receipt = deferred<typeof f.receipt>();
  f.waitForTransactionReceipt.mockImplementationOnce(() => receipt.promise);
  await submitClaim(label);
  await waitFor(() => expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(1));
  rerenderClaims(f, { ...f.auction, tokenId: "2" });
  await act(async () => { receipt.resolve(f.receipt); });
  await screen.findByText("Confirmation not verified");
  expect(screen.getByTestId("wallet-transaction-status").querySelector("[title]")).toHaveAttribute("title", txHash);
  expect(f.onActionComplete).not.toHaveBeenCalled();
  expect(screen.queryByText(success)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
  await screen.findByText(`Previously reviewed auction #1: ${success}`);
  expect(f.onActionComplete).not.toHaveBeenCalled();
  expect(f.writeContract).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: `Review ${label}` })).toBeEnabled();
});

it("preserves original/replacement refund hashes and proof when confirming a previously reviewed lot", async () => {
  const f = setupClaims();
  claimReplacement(f, "repriced", {});
  const replaced = f.waitForTransactionReceipt.getMockImplementation()!;
  const receipt = deferred<typeof f.receipt>();
  f.waitForTransactionReceipt.mockImplementationOnce(async (options) => { await receipt.promise; return replaced(options); });
  await submitClaim("claim refund");
  await waitFor(() => expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(1));
  rerenderClaims(f, { ...f.auction, tokenId: "2" });
  await act(async () => { receipt.resolve(f.receipt); });
  await screen.findByText("Confirmation not verified");
  const status = screen.getByTestId("wallet-transaction-status");
  expect(status.querySelector("[title]")).toHaveAttribute("title", `0x${"7".repeat(64)}`);
  expect(status.textContent).toContain(txHash);
  f.waitForTransactionReceipt.mockResolvedValue(f.receipt);
  fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
  await screen.findByText("Previously reviewed auction #1: Refund claimed.");
  expect(status.querySelector("[title]")).toHaveAttribute("title", `0x${"7".repeat(64)}`);
  expect(status.textContent).toContain(txHash);
  expect(f.getTransaction).toHaveBeenCalledWith({ hash: `0x${"7".repeat(64)}` });
  expect(f.onActionComplete).not.toHaveBeenCalled();
  expect(f.writeContract).toHaveBeenCalledTimes(1);
});

it("keeps a confirmed claim separate if the page changes while its read model refresh is pending", async () => {
  const refresh = deferred<void>();
  const f = setupClaims({ onActionComplete: vi.fn(() => refresh.promise) });
  await submitClaim("claim refund");
  await waitFor(() => expect(f.onActionComplete).toHaveBeenCalledTimes(1));
  rerenderClaims(f, { ...f.auction, tokenId: "2" });
  await act(async () => { refresh.resolve(); });
  await screen.findByText("Confirmation not verified");
  expect(screen.queryByText("Refund claimed.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
  await screen.findByText("Previously reviewed auction #1: Refund claimed.");
  expect(f.onActionComplete).toHaveBeenCalledTimes(1);
  expect(f.writeContract).toHaveBeenCalledTimes(1);
});

it("requires a fresh review after refreshing from stale lot A to reused-ID lot B", async () => {
  const onRefresh = vi.fn(async () => { rerenderClaims(f, { ...f.auction, tokenId: "2" }); });
  const f = setupClaims({ onActionComplete: onRefresh });
  f.liveAuction.tokenId = 2n;
  await submitClaim("claim refund");
  await expectNoSignature(f);
  fireEvent.click(screen.getByRole("button", { name: "Refresh auction details" }));
  await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Review claim refund" })).toBeEnabled());
  expect(screen.queryByRole("button", { name: "Continue in wallet" })).not.toBeInTheDocument();
  expect(f.writeContract).not.toHaveBeenCalled();
  await submitClaim("claim refund");
  await screen.findByText("Refund claimed.");
  expect(f.writeContract).toHaveBeenCalledTimes(1);
});

it("clears an old unavailable-data notice after confirmed action refresh reads succeed", async () => {
  const f = setupClaims({ failedReads: new Set(["entitlementOf"]) });
  await screen.findByText(/Some wallet claim data is unavailable/);
  f.failedReads.clear();
  await submitClaim("claim refund");
  await screen.findByText("Refund claimed.");
  expect(screen.queryByText(/Some wallet claim data is unavailable/)).not.toBeInTheDocument();
  expect(screen.getByText("Redistribution available").nextElementSibling).toHaveTextContent("0.1 ETH");
  expect(f.writeContract).toHaveBeenCalledTimes(1);
});
