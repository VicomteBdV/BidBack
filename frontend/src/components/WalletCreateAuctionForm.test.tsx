import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeEventTopics } from "viem";
import { useAccount } from "wagmi";
import { describe, expect, it, vi } from "vitest";
import { CreateAuctionFields } from "@/components/CreateAuctionFields";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
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

const blockHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function creationLog({ auctionId = 1n, sellerAddress = seller, nft = testAddresses.localNft,
  tokenId = 2n, startPrice = 1_000_000_000_000_000_000n, duration = 7200n,
  emitter = testAddresses.auctionHouse }: {
  auctionId?: bigint; sellerAddress?: `0x${string}`; nft?: `0x${string}`;
  tokenId?: bigint; startPrice?: bigint; duration?: bigint; emitter?: `0x${string}`;
} = {}) {
  return {
    address: emitter,
    topics: encodeEventTopics({ abi: auctionHouseAbi, eventName: "AuctionCreated",
      args: { auctionId, seller: sellerAddress, nft } }),
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }],
      [tokenId, startPrice, 1000n + duration])
  };
}

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

function mockConnectedAccount(chainId = 31337) {
  const account: MinimalConnectedAccount = {
    address: seller,
    chainId,
    isConnected: true
  };

  return account as unknown as ReturnType<typeof useAccount>;
}

function setupWalletCreateForm({
  owner = seller,
  approvedAddress = zeroAddress,
  approvedForAll = false,
  chainId = 31337
}: {
  owner?: `0x${string}`;
  approvedAddress?: `0x${string}`;
  approvedForAll?: boolean;
  chainId?: number;
} = {}) {
  let currentApprovedAddress = approvedAddress;
  let currentApprovedForAll = approvedForAll;

  const readContract = vi.fn(async (request: unknown) => {
    const { functionName } = request as { functionName?: string };

    if (functionName === "params") return paramsTuple();
    if (functionName === "paused") return false;
    if (functionName === "ownerOf") return owner;
    if (functionName === "getApproved") return currentApprovedAddress;
    if (functionName === "isApprovedForAll") return currentApprovedForAll;
    if (functionName === "nextAuctionId") return 1n;

    throw new Error(`Unexpected readContract call: ${String(functionName)}`);
  });

  let logs = [creationLog()];
  const waitForTransactionReceipt = vi.fn(async () => ({ status: "success", logs, blockHash }));
  const getBlock = vi.fn(async () => ({ timestamp: 1000n }));
  const writeContract = vi.fn(async (request: unknown) => {
    const { functionName } = request as { functionName?: string };

    if (functionName === "approve") {
      currentApprovedAddress = testAddresses.nftVault;
      currentApprovedForAll = false;
    }

    if (functionName === "createAuction") {
      const [nft, tokenId, startPrice, duration] = (request as { args: [`0x${string}`, bigint, bigint, bigint] }).args;
      logs = [creationLog({ nft, tokenId, startPrice, duration })];
    }

    return "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
  });

  vi.mocked(createPublicClient).mockReturnValue({
    readContract,
    getBlock,
    waitForTransactionReceipt
  } as unknown as ReturnType<typeof createPublicClient>);

  vi.mocked(createWalletClient).mockReturnValue({
    writeContract
  } as unknown as ReturnType<typeof createWalletClient>);

  vi.mocked(useAccount).mockReturnValue(mockConnectedAccount(chainId));

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
  await screen.findByText("Create network and contract details");
  await waitFor(() => expect(screen.getByRole("button", { name: "Review auction" })).toBeEnabled());
}

describe("WalletCreateAuctionForm", () => {
  it("associates a field validation error with its labelled input", async () => {
    setupWalletCreateForm();
    await waitForContext();

    const nftContract = screen.getByLabelText("NFT contract");
    fireEvent.change(nftContract, { target: { value: "not-an-address" } });

    expect(nftContract).toHaveAttribute("aria-invalid", "true");
    const errorId = nftContract.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent("Invalid NFT contract address");
  });

  it("shows days and hours and keeps the human duration in the creation review", async () => {
    setupWalletCreateForm({ approvedAddress: testAddresses.nftVault });
    await waitForContext();

    const days = screen.getByLabelText("Days");
    const hours = screen.getByLabelText("Hours");
    expect(days).toHaveValue(0);
    expect(hours).toHaveValue("2");
    expect(days).toHaveClass("w-full", "min-w-0");
    expect(hours).toHaveClass("w-full", "min-w-0");
    expect(screen.queryByLabelText("Duration in seconds")).not.toBeInTheDocument();
    expect(screen.queryByText(/7200 seconds/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Total duration:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));

    expect(await screen.findByText("Wallet owns the token and NFT custody approval is active.")).toBeInTheDocument();
    const review = screen.getByRole("region", { name: "Create auction" });
    expect(within(review).getByText("Duration").nextElementSibling).toHaveTextContent("2 hours");
  });

  it("keeps create deployment details collapsed by default", async () => {
    setupWalletCreateForm();
    await waitForContext();
    const summary = screen.getByText("Create network and contract details");

    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("explains the expected network while preserving disabled wallet actions", async () => {
    setupWalletCreateForm({ chainId: 1 });

    expect((await screen.findAllByText(/not on the target chain/)).length).toBeGreaterThan(0);
    const checkButton = screen.getByRole("button", { name: "Review auction" });
    expect(checkButton).toBeDisabled();
    const reasonId = checkButton.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).toHaveTextContent("not on the target chain");
  });

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

    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));

    expect(await screen.findByText("Wallet owns the token and NFT custody approval is active.")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));

    expect(await screen.findByText(/Connected wallet is not the token owner/)).toBeInTheDocument();
    expect(screen.getByText("Owner mismatch")).toBeInTheDocument();
    expect(screen.queryByText("Review before signing")).not.toBeInTheDocument();
  });

  it("shows missing approval and keeps create auction disabled", async () => {
    setupWalletCreateForm({
      owner: seller,
      approvedAddress: zeroAddress,
      approvedForAll: false
    });

    await waitForContext();

    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));

    expect(await screen.findByText("Wallet owns the token. Approve NFT custody before creating the auction.")).toBeInTheDocument();
    expect(screen.getByText("Approval required")).toBeInTheDocument();
    expect(screen.getByText("Currently expected: 2 wallet confirmations")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve NFT custody" })).toBeEnabled();
  });

  it("refreshes approval status after wallet approval confirmation", async () => {
    const { waitForTransactionReceipt, writeContract } = setupWalletCreateForm({
      owner: seller,
      approvedAddress: zeroAddress,
      approvedForAll: false
    });

    await waitForContext();

    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));

    expect(await screen.findByText("Wallet owns the token. Approve NFT custody before creating the auction.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve NFT custody" }));

    expect(await screen.findByText("NFT custody approved.")).toBeInTheDocument();
    expect(screen.getByText("NFT custody approved")).toBeInTheDocument();
    expect(screen.getByText("Currently expected: 1 wallet confirmation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create auction" })).toBeEnabled();
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "approve" }));
    expect(waitForTransactionReceipt).toHaveBeenCalled();
  });

  it("enables create auction when ownership and approval are valid", async () => {
    setupWalletCreateForm({
      owner: seller,
      approvedAddress: testAddresses.nftVault,
      approvedForAll: false
    });

    await waitForContext();

    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));

    expect(await screen.findByText("Wallet owns the token and NFT custody approval is active.")).toBeInTheDocument();
    expect(screen.getByText("NFT custody approved")).toBeInTheDocument();
    expect(screen.getByText("Currently expected: 1 wallet confirmation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create auction" })).toBeEnabled();
  });

  it("preserves approval then create call order and contract arguments", async () => {
    const { writeContract, waitForTransactionReceipt } = setupWalletCreateForm({
      owner: seller,
      approvedAddress: zeroAddress,
      approvedForAll: false
    });

    await waitForContext();
    fireEvent.change(screen.getByLabelText("Days"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));
    await screen.findByText("Currently expected: 2 wallet confirmations");
    const review = screen.getByRole("region", { name: "Create auction" });
    expect(within(review).getByText("Duration").nextElementSibling).toHaveTextContent("2 days 3 hours");

    fireEvent.click(screen.getByRole("button", { name: "Approve NFT custody" }));
    await screen.findByText("NFT custody approved.");
    fireEvent.click(screen.getByRole("button", { name: "Create auction" }));

    expect(await screen.findByText("Auction #1 created.")).toBeInTheDocument();
    expect(vi.mocked(writeContract).mock.calls.map(([request]) => (request as { functionName: string }).functionName)).toEqual([
      "approve",
      "createAuction"
    ]);
    expect(writeContract).toHaveBeenNthCalledWith(1, expect.objectContaining({
      functionName: "approve",
      args: [testAddresses.nftVault, 2n]
    }));
    expect(writeContract).toHaveBeenNthCalledWith(2, expect.objectContaining({
      functionName: "createAuction",
      args: [testAddresses.localNft, 2n, 1_000_000_000_000_000_000n, 183600n]
    }));
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  it("keeps zero and invalid day values from reaching auction creation", async () => {
    const { writeContract } = setupWalletCreateForm({ approvedAddress: testAddresses.nftVault });
    await waitForContext();

    const days = screen.getByLabelText("Days");
    const hours = screen.getByLabelText("Hours");
    const reviewButton = screen.getByRole("button", { name: "Review auction" });

    fireEvent.change(hours, { target: { value: "0" } });
    expect(reviewButton).toBeDisabled();
    const durationGroup = screen.getByRole("group", { name: "Duration" });
    const errorId = durationGroup.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent("Duration must be greater than zero.");

    for (const invalidDays of ["-1", "1.5", "not-a-number"]) {
      fireEvent.change(days, { target: { value: invalidDays } });
      expect(reviewButton).toBeDisabled();
      fireEvent.click(reviewButton);
    }

    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rounds a non-aligned external duration up and synchronizes the canonical seconds", async () => {
    const onDurationSecondsChange = vi.fn();

    function DurationHarness() {
      const [durationSeconds, setDurationSeconds] = React.useState("7201");

      return (
        <>
          <CreateAuctionFields
            nftContract={testAddresses.localNft}
            tokenId="2"
            startPriceEth="1"
            durationSeconds={durationSeconds}
            onNftContractChange={vi.fn()}
            onTokenIdChange={vi.fn()}
            onStartPriceEthChange={vi.fn()}
            onDurationSecondsChange={(value) => {
              onDurationSecondsChange(value);
              setDurationSeconds(value);
            }}
          />
          <output data-testid="canonical-duration">{durationSeconds}</output>
        </>
      );
    }

    render(<DurationHarness />);

    await waitFor(() => expect(onDurationSecondsChange).toHaveBeenCalledWith("10800"));
    expect(screen.getByLabelText("Days")).toHaveValue(0);
    expect(screen.getByLabelText("Hours")).toHaveValue("3");
    expect(screen.queryByText(/^Total duration:/)).not.toBeInTheDocument();
    expect(screen.getByTestId("canonical-duration")).toHaveTextContent("10800");
  });
  it("uses the receipt ID after a concurrent creation instead of the old counter", async () => {
    const { readContract, waitForTransactionReceipt } = setupWalletCreateForm({ approvedAddress: testAddresses.nftVault });
    waitForTransactionReceipt.mockResolvedValue({ status: "success", logs: [creationLog({ auctionId: 9n })], blockHash });
    await waitForContext();
    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create auction" }));
    expect(await screen.findByText("Auction #9 created.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open auction detail" })).toHaveAttribute("href", "/auctions/9");
    expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "nextAuctionId" }));
  });

  it.each([
    { label: "missing", logs: [] },
    { label: "wrong emitter", logs: [creationLog({ emitter: otherOwner })] },
    { label: "wrong seller", logs: [creationLog({ sellerAddress: otherOwner })] },
    { label: "wrong NFT", logs: [creationLog({ nft: otherOwner })] },
    { label: "wrong token", logs: [creationLog({ tokenId: 99n })] },
    { label: "wrong price", logs: [creationLog({ startPrice: 1n })] },
    { label: "wrong duration", logs: [creationLog({ duration: 1n })] },
    { label: "ambiguous", logs: [creationLog(), creationLog({ auctionId: 2n })] },
    { label: "malformed", logs: [{ ...creationLog(), data: "0x" as const }] }
  ])("preserves confirmed creation with an unidentified ID when the event is $label", async ({ logs }) => {
    const { waitForTransactionReceipt, writeContract } = setupWalletCreateForm({ approvedAddress: testAddresses.nftVault });
    waitForTransactionReceipt.mockResolvedValue({ status: "success", logs, blockHash });
    await waitForContext();
    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create auction" }));
    expect(await screen.findByText("Auction creation confirmed, but the auction ID could not be determined.")).toBeInTheDocument();
    expect(screen.getByText("Transaction confirmed")).toBeInTheDocument();
    expect(screen.getByText(/Do not create the auction again/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open auction detail" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review auction" })).toBeDisabled();
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

});
