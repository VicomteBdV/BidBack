import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPublicClient, createWalletClient } from "viem";
import { useAccount } from "wagmi";
import { describe, expect, it, vi } from "vitest";
import { WalletCreateAuctionForm } from "@/components/WalletCreateAuctionForm";
import { localDeploymentFixture, testAddresses } from "@/test/fixtures";

vi.mock("wagmi", () => ({
  useAccount: vi.fn()
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");

  return {
    ...actual,
    createPublicClient: vi.fn(),
    createWalletClient: vi.fn(),
    custom: vi.fn((provider: unknown) => provider)
  };
});

const seller = testAddresses.seller;
const otherOwner = testAddresses.secondBidder;
const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

type MinimalConnectedAccount = {
  address: `0x${string}`;
  chainId: number;
  isConnected: true;
};

function paramsTuple() {
  return {
    minAuctionDuration: 1n
  };
}

function mockConnectedAccount() {
  const account: MinimalConnectedAccount = {
    address: seller,
    chainId: 31337,
    isConnected: true
  };

  return account as unknown as ReturnType<typeof useAccount>;
}

function setupWalletCreateForm({
  owner = seller,
  approvedAddress = zeroAddress,
  approvedForAll = false
}: {
  owner?: `0x${string}`;
  approvedAddress?: `0x${string}`;
  approvedForAll?: boolean;
} = {}) {
  const readContract = vi.fn(async (request: unknown) => {
    const { functionName } = request as { functionName?: string };

    if (functionName === "params") return paramsTuple();
    if (functionName === "paused") return false;
    if (functionName === "ownerOf") return owner;
    if (functionName === "getApproved") return approvedAddress;
    if (functionName === "isApprovedForAll") return approvedForAll;
    if (functionName === "nextAuctionId") return 1n;

    throw new Error(`Unexpected readContract call: ${String(functionName)}`);
  });

  const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
  const writeContract = vi.fn(async () =>
    "0x1111111111111111111111111111111111111111111111111111111111111111" as const
  );

  vi.mocked(createPublicClient).mockReturnValue({
    readContract,
    waitForTransactionReceipt
  } as unknown as ReturnType<typeof createPublicClient>);

  vi.mocked(createWalletClient).mockReturnValue({
    writeContract
  } as unknown as ReturnType<typeof createWalletClient>);

  vi.mocked(useAccount).mockReturnValue(mockConnectedAccount());

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(localDeploymentFixture), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    )
  );

  Object.defineProperty(window, "ethereum", {
    configurable: true,
    value: {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "eth_chainId") return "0x7a69";
        throw new Error(`Unexpected provider request: ${method}`);
      })
    }
  });

  render(<WalletCreateAuctionForm />);

  return {
    readContract,
    writeContract,
    waitForTransactionReceipt
  };
}

async function waitForContext() {
  await screen.findByText("NFTVault approval target");
  await waitFor(() => expect(screen.getByRole("button", { name: "Check ownership and approval" })).toBeEnabled());
}

describe("WalletCreateAuctionForm", () => {
  it("checks ownership and approval for token ID 0", async () => {
    const { readContract } = setupWalletCreateForm({
      owner: seller,
      approvedAddress: testAddresses.nftVault
    });

    await waitForContext();

    fireEvent.change(screen.getByLabelText("Token ID"), {
      target: {
        value: "0"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Check ownership and approval" }));

    expect(await screen.findByText("Wallet owns the token and NFTVault is approved.")).toBeInTheDocument();
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "ownerOf",
        args: [0n]
      })
    );
  });

  it("shows owner mismatch when the connected wallet is not the ERC721 owner", async () => {
    setupWalletCreateForm({
      owner: otherOwner
    });

    await waitForContext();

    fireEvent.click(screen.getByRole("button", { name: "Check ownership and approval" }));

    expect(await screen.findByText(/Connected wallet is not the token owner/)).toBeInTheDocument();
    expect(screen.getByText("Owner mismatch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve NFTVault" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create auction" })).toBeDisabled();
  });

  it("shows missing approval and keeps create auction disabled", async () => {
    setupWalletCreateForm({
      owner: seller,
      approvedAddress: zeroAddress,
      approvedForAll: false
    });

    await waitForContext();

    fireEvent.click(screen.getByRole("button", { name: "Check ownership and approval" }));

    expect(await screen.findByText("Wallet owns the token. Approve NFTVault before creating the auction.")).toBeInTheDocument();
    expect(screen.getByText("Approval required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve NFTVault" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create auction" })).toBeDisabled();
  });

  it("enables create auction when ownership and approval are valid", async () => {
    setupWalletCreateForm({
      owner: seller,
      approvedAddress: testAddresses.nftVault,
      approvedForAll: false
    });

    await waitForContext();

    fireEvent.click(screen.getByRole("button", { name: "Check ownership and approval" }));

    expect(await screen.findByText("Wallet owns the token and NFTVault is approved.")).toBeInTheDocument();
    expect(screen.getByText("NFTVault approved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve NFTVault" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create auction" })).toBeEnabled();
  });
});
