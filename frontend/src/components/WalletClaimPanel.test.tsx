import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient } from "viem";
import { useAccount } from "wagmi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletClaimPanel } from "@/components/WalletClaimPanel";
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

const txHash = "0x3333333333333333333333333333333333333333333333333333333333333333" as const;

function setupClaims({
  refundableAmount = 1_000_000_000_000_000_000n,
  rewardEntitlement = 100_000_000_000_000_000n,
  sellerCredit = 2_000_000_000_000_000_000n,
  protocolFeeCredit = 10_000_000_000_000_000n,
  onActionComplete = vi.fn(async () => undefined)
}: {
  refundableAmount?: bigint;
  rewardEntitlement?: bigint;
  sellerCredit?: bigint;
  protocolFeeCredit?: bigint;
  onActionComplete?: () => Promise<void>;
} = {}) {
  const account = testAddresses.primaryBidder;
  vi.mocked(useAccount).mockReturnValue({ address: account, chainId: 31337, isConnected: true } as unknown as ReturnType<typeof useAccount>);

  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "refundableAmount") return refundableAmount;
    if (functionName === "refundClaimed") return false;
    if (functionName === "entitlementOf") return rewardEntitlement;
    if (functionName === "claimed") return false;
    if (functionName === "sellerCredits") return sellerCredit;
    if (functionName === "protocolFeeCredits") return protocolFeeCredit;
    throw new Error(`Unexpected read: ${functionName}`);
  });
  const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
  const writeContract = vi.fn(async () => txHash);
  vi.mocked(createPublicClient).mockReturnValue({ readContract, waitForTransactionReceipt } as unknown as ReturnType<typeof createPublicClient>);
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
    <WalletClaimPanel
      auction={{
        ...auctionDetailFixture.auction,
        state: 2,
        stateLabel: "FINALIZED",
        finalized: true,
        nftClaimed: false,
        seller: account,
        highestBidder: account,
        auctionFeeRecipient: account
      }}
      onActionComplete={onActionComplete}
    />
  );

  return { writeContract, onActionComplete };
}

beforeEach(() => vi.clearAllMocks());

describe("WalletClaimPanel", () => {
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
    expect(screen.getAllByText(/global credit/i).length).toBeGreaterThanOrEqual(2);
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
});
