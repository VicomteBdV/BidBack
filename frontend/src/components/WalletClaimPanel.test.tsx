import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient } from "viem";
import { useAccount } from "wagmi";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SerializedAuction } from "@/lib/auctionTypes";
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
const providerB = { request: vi.fn(async ({ method }: { method: string }): Promise<string | (string | undefined)[]> =>
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
  failedReads = new Set<string>()
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
} = {}) {
  const account = testAddresses.primaryBidder;
  vi.mocked(useAccount).mockReturnValue({ address: account, chainId: 31337, isConnected: true, connector: connectorB } as unknown as ReturnType<typeof useAccount>);

  const liveAuction = { state: 2, nftClaimed: false,
    highestBidder: (auctionOverrides.highestBidder ?? account) as `0x${string}`, seller: account as `0x${string}` };
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (failedReads.has(functionName)) throw new Error(`Unavailable: ${functionName}`);
    if (functionName === "getAuction") return liveAuction;
    if (functionName === "refundableAmount") return refundableAmount;
    if (functionName === "refundClaimed") return refundClaimed;
    if (functionName === "entitlementOf") return rewardEntitlement;
    if (functionName === "claimed") return rewardClaimed;
    if (functionName === "sellerCredits") return sellerCredit;
    if (functionName === "protocolFeeCredits") return protocolFeeCredit;
    throw new Error(`Unexpected read: ${functionName}`);
  });
  const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
  const writeContract = vi.fn(async () => txHash);
  vi.mocked(createPublicClient).mockReturnValue({ readContract, waitForTransactionReceipt } as unknown as ReturnType<typeof createPublicClient>);
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
    <WalletClaimPanel
      auction={{
        ...auctionDetailFixture.auction,
        state: 2,
        stateLabel: "FINALIZED",
        finalized: true,
        nftClaimed: false,
        seller: account,
        highestBidder: account,
        auctionFeeRecipient: account,
        ...auctionOverrides
      }}
      onActionComplete={onActionComplete}
    />
  );

  return { writeContract, onActionComplete, readContract, liveAuction, failedReads, waitForTransactionReceipt };
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
    expect(await screen.findByText("Transaction failed")).toBeInTheDocument();
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
    const { writeContract, waitForTransactionReceipt, onActionComplete } = setupClaims();
    if (outcome === "rejected") writeContract.mockRejectedValue({ code: 4001 });
    if (outcome === "reverted") waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
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
