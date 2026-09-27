import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeEventTopics } from "viem";
import { useAccount } from "wagmi";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { WalletBidPanel } from "@/components/WalletBidPanel";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { auctionDetailFixture, localDeploymentFixture, testAddresses } from "@/test/fixtures";

vi.mock("wagmi", () => ({ useAccount: vi.fn(), useConfig: vi.fn(() => ({})) }));
vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button>Connect or switch wallet</button> }));
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

const txHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const replacementHash = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const unrelatedHash = "0x3333333333333333333333333333333333333333333333333333333333333333" as const;

type MockReceipt = {
  status: string;
  transactionHash?: `0x${string}`;
  logs?: Array<{
    address: `0x${string}`;
    data: `0x${string}`;
    topics: ReturnType<typeof encodeEventTopics>;
  }>;
};

function bidPlacedReceipt({
  hash = txHash,
  auctionHouse = auctionDetailFixture.auctionHouse,
  auctionId = 1n,
  bidder = testAddresses.primaryBidder,
  amount = 1_200_000_000_000_000_000n
}: {
  hash?: `0x${string}`;
  auctionHouse?: `0x${string}`;
  auctionId?: bigint;
  bidder?: `0x${string}`;
  amount?: bigint;
} = {}): MockReceipt {
  return {
    status: "success",
    transactionHash: hash,
    logs: [{
      address: auctionHouse,
      topics: encodeEventTopics({
        abi: auctionHouseAbi,
        eventName: "BidPlaced",
        args: { auctionId, bidder }
      }),
      data: encodeAbiParameters([{ type: "uint256" }], [amount])
    }]
  };
}

type ReplacementEvent = {
  reason: "cancelled" | "replaced" | "repriced";
  transaction: { hash: typeof replacementHash };
  replacedTransaction: { hash: typeof txHash };
  transactionReceipt: MockReceipt;
};

type ReceiptWaitRequest = {
  onReplaced?: (event: ReplacementEvent) => void;
};

const providerA = { request: vi.fn() };
const providerB = { request: vi.fn(async ({ method }: { method: string }) =>
  method === "eth_accounts" ? [vi.mocked(useAccount)().address] : "0x7a69") };
const connectorB = { uid: "wallet-b", name: "Wallet B", getProvider: vi.fn(async () => providerB) };

type OnchainAuctionOverrides = Partial<{
  seller: `0x${string}`;
  nft: `0x${string}`;
  tokenId: bigint;
  startPrice: bigint;
  startTime: bigint;
  initialEndTime: bigint;
  endTime: bigint;
  state: number;
}>;

function setupBid({
  currentCap = 0n,
  minimumNextBid = 1_200_000_000_000_000_000n,
  preflightCurrentCap,
  preflightMinimumNextBid,
  latestBlockTimestamp = 1n,
  preflightBlockTimestamp,
  initialBlockNumber = 100n,
  preflightBlockNumber = 101n,
  snapshotEscrowVault = testAddresses.escrowVault,
  preflightSnapshotEscrowVault,
  onchainAuctionOverrides = {},
  preflightOnchainAuctionOverrides,
  expectedChainId = auctionDetailFixture.chainId,
  expectedAuctionHouse = auctionDetailFixture.auctionHouse,
  auctionOverrides = {},
  receipt,
  simulationError,
  writeError,
  onBidComplete = vi.fn(async () => undefined)
}: {
  currentCap?: bigint;
  minimumNextBid?: bigint;
  preflightCurrentCap?: bigint;
  preflightMinimumNextBid?: bigint;
  latestBlockTimestamp?: bigint;
  preflightBlockTimestamp?: bigint;
  initialBlockNumber?: bigint;
  preflightBlockNumber?: bigint;
  snapshotEscrowVault?: `0x${string}`;
  preflightSnapshotEscrowVault?: `0x${string}`;
  onchainAuctionOverrides?: OnchainAuctionOverrides;
  preflightOnchainAuctionOverrides?: OnchainAuctionOverrides;
  expectedChainId?: number;
  expectedAuctionHouse?: `0x${string}`;
  auctionOverrides?: Partial<SerializedAuction>;
  receipt?: MockReceipt | Error;
  simulationError?: unknown;
  writeError?: unknown;
  onBidComplete?: () => Promise<void>;
} = {}) {
  vi.mocked(useAccount).mockReturnValue({
    address: testAddresses.primaryBidder,
    chainId: 31337,
    isConnected: true, connector: connectorB
  } as unknown as ReturnType<typeof useAccount>);

  const renderedAuction: SerializedAuction = {
    ...auctionDetailFixture.auction,
    state: 0,
    finalized: false,
    endTime: "9999999999",
    chainTimestamp: "1",
    ...auctionOverrides
  };
  const baseOnchainAuction = {
    seller: renderedAuction.seller,
    nft: renderedAuction.nft,
    tokenId: BigInt(renderedAuction.tokenId),
    startPrice: BigInt(renderedAuction.startPrice),
    startTime: BigInt(renderedAuction.startTime),
    initialEndTime: BigInt(renderedAuction.initialEndTime),
    endTime: BigInt(renderedAuction.endTime),
    extensionsUsed: renderedAuction.extensionsUsed,
    state: renderedAuction.state,
    highestBidder: renderedAuction.highestBidder,
    highestBid: BigInt(renderedAuction.highestBid),
    participantCount: BigInt(renderedAuction.participantCount),
    bidCount: BigInt(renderedAuction.bidCount),
    nftClaimed: renderedAuction.nftClaimed
  };

  let minimumReadCount = 0;
  let capReadCount = 0;
  let auctionReadCount = 0;
  let moduleReadCount = 0;
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "getAuction") {
      auctionReadCount += 1;
      return {
        ...baseOnchainAuction,
        ...onchainAuctionOverrides,
        ...(auctionReadCount === 1 ? {} : preflightOnchainAuctionOverrides ?? {})
      };
    }
    if (functionName === "getAuctionModules") {
      moduleReadCount += 1;
      return {
        nftVault: testAddresses.nftVault,
        escrowVault: moduleReadCount === 1
          ? snapshotEscrowVault
          : preflightSnapshotEscrowVault ?? snapshotEscrowVault,
        distributionVault: testAddresses.distributionVault,
        reputationAdapter: testAddresses.reputationAdapter
      };
    }
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
  const writeContract = vi.fn(async (_request?: { args?: readonly [bigint, bigint] }) => {
    if (writeError) throw writeError;
    return txHash;
  });
  const waitForTransactionReceipt = vi.fn(async (_request?: ReceiptWaitRequest) => {
    if (receipt instanceof Error) throw receipt;
    if (receipt) return receipt;
    const request = writeContract.mock.calls.at(-1)?.[0];
    return bidPlacedReceipt({
      auctionId: request?.args?.[0] ?? BigInt(renderedAuction.auctionId),
      bidder: vi.mocked(useAccount)().address ?? testAddresses.primaryBidder,
      amount: request?.args?.[1] ?? minimumNextBid
    });
  });
  const simulateContract = vi.fn(async (request: unknown) => {
    if (simulationError) throw simulationError;
    return { request };
  });
  let blockReadCount = 0;
  const getBlock = vi.fn(async () => {
    blockReadCount += 1;
    return {
      timestamp: blockReadCount === 1
        ? latestBlockTimestamp
        : preflightBlockTimestamp ?? latestBlockTimestamp,
      number: blockReadCount === 1 ? initialBlockNumber : preflightBlockNumber
    };
  });
  vi.mocked(createPublicClient).mockReturnValue({
    getBlock,
    readContract,
    simulateContract,
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

  const view = render(
    <WalletBidPanel
      auction={renderedAuction}
      expectedChainId={expectedChainId}
      expectedAuctionHouse={expectedAuctionHouse}
      onBidComplete={onBidComplete}
    />
  );

  return { view, renderedAuction, getBlock, readContract, simulateContract, writeContract,
    waitForTransactionReceipt, onBidComplete };
}

function queueReplacement(
  waitForTransactionReceipt: ReturnType<typeof setupBid>["waitForTransactionReceipt"],
  reason: ReplacementEvent["reason"],
  status = "success"
) {
  waitForTransactionReceipt.mockImplementationOnce(async (request) => {
    const transactionReceipt = status === "success"
      ? bidPlacedReceipt({ hash: replacementHash })
      : { status, transactionHash: replacementHash, logs: [] };
    request?.onReplaced?.({
      reason,
      transaction: { hash: replacementHash },
      replacedTransaction: { hash: txHash },
      transactionReceipt
    });
    return transactionReceipt;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("WalletBidPanel", () => {
  it.each([
    {
      label: "chain",
      options: { expectedChainId: 1 },
      message: /loaded for chain 1, but wallet bidding is configured/
    },
    {
      label: "AuctionHouse",
      options: { expectedAuctionHouse: testAddresses.seller },
      message: /displayed AuctionHouse .* does not match the configured AuctionHouse/
    }
  ])("locks bidding when the expected $label does not match the configured target", async ({ options, message }) => {
    const { getBlock, readContract, writeContract } = setupBid(options);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(getBlock).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("locks bidding when the displayed immutable lot identity diverges on-chain", async () => {
    const { writeContract } = setupBid({
      onchainAuctionOverrides: { seller: testAddresses.primaryBidder }
    });

    expect((await screen.findAllByText(/Displayed auction does not match the on-chain lot at block 100 \(seller\)/)).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "state",
      options: { onchainAuctionOverrides: { state: 1 } },
      message: "Auction is not OPEN."
    },
    {
      label: "end time",
      options: { latestBlockTimestamp: 10n, onchainAuctionOverrides: { endTime: 10n } },
      message: "Auction has reached its end time. Refresh auction state or finalize it."
    }
  ])("uses the pinned live $label for initial bid readiness", async ({ options, message }) => {
    const { writeContract } = setupBid(options);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("reads the wallet cap from the auction's snapshotted EscrowVault at the pinned block", async () => {
    const rotatedVault = testAddresses.distributionVault;
    const { readContract, writeContract } = setupBid({ snapshotEscrowVault: rotatedVault });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());

    const initialReads = readContract.mock.calls.map(([request]) => request as {
      functionName: string; address: string; blockNumber?: bigint;
    });
    expect(initialReads.filter(({ functionName }) =>
      ["getAuction", "getAuctionModules", "minimumNextBid", "capOf"].includes(functionName)
    ).every(({ blockNumber }) => blockNumber === 100n)).toBe(true);
    expect(initialReads.find(({ functionName }) => functionName === "capOf")?.address).toBe(rotatedVault);
    expect(initialReads.some(({ functionName, address }) =>
      functionName === "capOf" && address === localDeploymentFixture.contracts.escrowVault
    )).toBe(false);

    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await waitFor(() => expect(writeContract).toHaveBeenCalledTimes(1));
    const capReads = readContract.mock.calls.map(([request]) => request as {
      functionName: string; address: string; blockNumber?: bigint;
    }).filter(({ functionName }) => functionName === "capOf");
    expect(capReads.slice(0, 2).map(({ blockNumber }) => blockNumber)).toEqual([100n, 101n]);
    expect(capReads.every(({ address }) => address === rotatedVault)).toBe(true);
  });

  it("distinguishes a first bid and sends the unchanged total cap and value", async () => {
    const { readContract, writeContract } = setupBid({ minimumNextBid: 1_000_000_000_000_000_000n });
    const reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    expect(screen.getByLabelText("Bid cap in ETH")).toHaveValue("1");
    expect(screen.queryByText("Wallet bid data loaded.")).not.toBeInTheDocument();
    fireEvent.click(reviewButton);

    expect(screen.getByRole("heading", { name: "Place bid" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review place bid" })).toBeInTheDocument();
    const reviewPanel = within(screen.getByLabelText("Review your bid"));
    expect(reviewPanel.getByText("AuctionHouse").nextElementSibling).toHaveTextContent(auctionDetailFixture.auctionHouse);
    expect(reviewPanel.getByText("NFT contract").nextElementSibling).toHaveTextContent(auctionDetailFixture.auction.nft);
    expect(reviewPanel.getByText("Token ID").nextElementSibling).toHaveTextContent(auctionDetailFixture.auction.tokenId);
    expect(screen.getByText("ETH sent in this transaction").nextElementSibling).toHaveTextContent("1 ETH");
    expect(screen.getByText("Your new total cap").nextElementSibling).toHaveTextContent("1 ETH");
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "placeBid",
      args: [1n, 1_000_000_000_000_000_000n],
      value: 1_000_000_000_000_000_000n
    })));
    expect(await screen.findByText("Bid placed with 1 ETH sent.")).toBeInTheDocument();
    await waitFor(() => expect(providerB.request).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" })));
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
    expect(screen.getByText("ETH sent in this transaction").nextElementSibling).toHaveTextContent("0.2 ETH");
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

  it("requires a new review when fresh preflight reads change the deposited cap", async () => {
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

    expect(await screen.findByText("Your deposited cap and the minimum required bid changed. Review the updated amounts before continuing.")).toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Additional amount in ETH")).toHaveValue("0.2");
    fireEvent.click(screen.getByRole("button", { name: "Review increase" }));
    expect(screen.getByText("Your new total cap").nextElementSibling).toHaveTextContent("1.3 ETH");
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await waitFor(() => expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "placeBid",
      args: [1n, 1_300_000_000_000_000_000n],
      value: 200_000_000_000_000_000n
    })));
  });

  it("requires a new review when the minimum required bid changes during preflight", async () => {
    const { writeContract } = setupBid({
      currentCap: 1_000_000_000_000_000_000n,
      minimumNextBid: 1_200_000_000_000_000_000n,
      preflightMinimumNextBid: 1_250_000_000_000_000_000n
    });
    const input = await screen.findByLabelText("Additional amount in ETH");
    await waitFor(() => expect(input).toHaveValue("0.2"));
    fireEvent.change(input, { target: { value: "0.3" } });
    fireEvent.click(screen.getByRole("button", { name: "Review increase" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("The minimum required bid changed. Review the updated amounts before continuing.")).toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Additional amount in ETH")).toHaveValue("0.3");
    await waitFor(() => expect(screen.getByLabelText("Additional amount in ETH")).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Review increase" }));
    expect(screen.getByText("Your new total cap").nextElementSibling).toHaveTextContent("1.3 ETH");
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await waitFor(() => expect(writeContract).toHaveBeenCalledTimes(1));
  });

  it("revalidates the immutable lot at one pinned preflight block and aborts before opening the wallet", async () => {
    const { readContract, writeContract } = setupBid({
      preflightBlockNumber: 222n,
      preflightOnchainAuctionOverrides: { tokenId: 999n }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Bid blocked before the wallet request.")).toBeInTheDocument();
    expect(screen.getAllByText(/Displayed auction does not match the on-chain lot at block 222 \(token ID\)/).length)
      .toBeGreaterThan(0);
    const preflightReads = readContract.mock.calls.map(([request]) => request as {
      functionName: string; blockNumber?: bigint;
    }).filter(({ blockNumber }) => blockNumber === 222n);
    expect(preflightReads.map(({ functionName }) => functionName)).toEqual(expect.arrayContaining([
      "getAuction", "getAuctionModules", "minimumNextBid"
    ]));
    expect(writeContract).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("uses the latest block timestamp and blocks an expired bid before requesting a signature", async () => {
    const { getBlock, writeContract, waitForTransactionReceipt } = setupBid({
      latestBlockTimestamp: 1_000n,
      preflightBlockTimestamp: 2_000n,
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
    ["paused auction", "execution reverted: EnforcedPause()"],
    ["participant cap", "execution reverted: MaxParticipantsReached()"]
  ])("blocks a %s simulation rejection before opening the wallet", async (_label, shortMessage) => {
    const { simulateContract, writeContract } = setupBid({ simulationError: { shortMessage } });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Bid blocked by the contract simulation.")).toBeInTheDocument();
    expect(screen.getByText(/Refresh the auction and wallet bid data, then review the bid again/)).toBeInTheDocument();
    expect(simulateContract).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      address: auctionDetailFixture.auctionHouse,
      functionName: "placeBid",
      args: [1n, 1_200_000_000_000_000_000n],
      account: testAddresses.primaryBidder,
      value: 1_200_000_000_000_000_000n,
      blockNumber: 101n
    }));
    expect(screen.getByRole("button", { name: "Review bid" })).toBeEnabled();
    expect(writeContract).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(0);
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

  it("keeps the entered step-up amount visible when it is below the minimum", async () => {
    setupBid({ currentCap: 1_000_000_000_000_000_000n });
    const input = await screen.findByLabelText("Additional amount in ETH");
    fireEvent.change(input, { target: { value: "0.1" } });

    expect(await screen.findByText("New bid cap must meet the minimum required bid.")).toBeInTheDocument();
    expect(screen.getByText("Additional amount").nextElementSibling).toHaveTextContent("0.1 ETH");
    expect(screen.getByText("New total cap").nextElementSibling).toHaveTextContent("1.1 ETH");
    expect(screen.getByRole("button", { name: "Review increase" })).toBeDisabled();
  });

  it("never displays a negative amount for a zero step-up input", async () => {
    setupBid({ currentCap: 1_000_000_000_000_000_000n });
    const input = await screen.findByLabelText("Additional amount in ETH");
    fireEvent.change(input, { target: { value: "0" } });

    expect(await screen.findByText("Bid increase must be greater than zero.")).toBeInTheDocument();
    expect(screen.getByText("Additional amount").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("New total cap").nextElementSibling).toHaveTextContent("—");
    expect(screen.queryByText("-1 ETH")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review increase" })).toBeDisabled();
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
    const first = setupBid({ receipt: { status: "reverted", transactionHash: txHash, logs: [] } });
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

  it("preserves reviewed amounts while the wallet signature is pending", async () => {
    const { writeContract } = setupBid({ currentCap: 1_000_000_000_000_000_000n });
    let resolveWrite!: (hash: typeof txHash) => void;
    writeContract.mockImplementationOnce(() => new Promise((resolve) => { resolveWrite = resolve; }));
    const review = await screen.findByRole("button", { name: "Review increase" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    expect(screen.getByLabelText("Review your bid")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Waiting for wallet signature");
    expect(screen.getByText("ETH sent in this transaction").nextElementSibling).toHaveTextContent("0.2 ETH");
    expect(screen.getByText("Your new total cap").nextElementSibling).toHaveTextContent("1.2 ETH");
    expect(screen.getByRole("button", { name: "Working..." })).toBeDisabled();
    await act(async () => resolveWrite(txHash));
    await screen.findByText("Transaction confirmed");
  });

  it("checks an uncertain receipt without submitting a second bid", async () => {
    const { waitForTransactionReceipt, writeContract } = setupBid({ receipt: new Error("RPC timeout") });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    waitForTransactionReceipt.mockResolvedValueOnce(bidPlacedReceipt());
    fireEvent.click(screen.getByRole("button", { name: "Check transaction confirmation" }));
    await screen.findByText("Your submitted bid is confirmed on-chain.");
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: "missing BidPlaced event",
      receipt: { status: "success", transactionHash: txHash, logs: [] } as MockReceipt
    },
    {
      label: "mismatched BidPlaced amount",
      receipt: bidPlacedReceipt({ amount: 1_300_000_000_000_000_000n })
    },
    {
      label: "unrelated successful transaction hash",
      receipt: bidPlacedReceipt({ hash: unrelatedHash })
    }
  ])("keeps recovery locked for a successful receipt with $label", async ({ receipt }) => {
    const { writeContract } = setupBid({ receipt });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText("Transaction confirmed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(1);
    const marker = JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!);
    expect(marker).toMatchObject({
      version: 1,
      hash: txHash,
      expectedNewCap: "1200000000000000000"
    });
  });

  it.each([
    {
      label: "reverted receipt with no transaction hash",
      receipt: { status: "reverted", logs: [] } as MockReceipt
    },
    {
      label: "reverted receipt with an unrelated transaction hash",
      receipt: { status: "reverted", transactionHash: unrelatedHash, logs: [] } as MockReceipt
    },
    {
      label: "receipt with an unknown status",
      receipt: { status: "pending", transactionHash: txHash, logs: [] } as MockReceipt
    }
  ])("keeps recovery locked for a $label", async ({ receipt }) => {
    const { writeContract } = setupBid({ receipt });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText("The transaction was included on-chain but reverted.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(1);
  });

  it("restores a receipt with missing bid evidence after remount and confirms only matching evidence", async () => {
    const first = setupBid({
      auctionOverrides: { auctionId: "911" },
      receipt: { status: "success", transactionHash: txHash, logs: [] }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    expect(window.sessionStorage).toHaveLength(1);
    first.view.unmount();

    const second = setupBid({ auctionOverrides: { auctionId: "911" } });
    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Check transaction confirmation" }));

    expect(await screen.findByText("Your submitted bid is confirmed on-chain.")).toBeInTheDocument();
    expect(second.writeContract).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("confirms a repriced bid with the effective transaction hash", async () => {
    const { waitForTransactionReceipt, writeContract } = setupBid();
    queueReplacement(waitForTransactionReceipt, "repriced");
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Bid placed with 1.2 ETH sent.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    expect(screen.getByTitle(replacementHash)).toBeInTheDocument();
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("retains a newer repriced hash when session storage still contains the submitted hash", async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (value.includes(replacementHash)) throw new Error("repriced hash write blocked");
      return originalSetItem.call(this, key, value);
    });
    let setItemRestored = false;
    try {
      const { waitForTransactionReceipt, writeContract } = setupBid({ auctionOverrides: { auctionId: "912" } });
      waitForTransactionReceipt.mockImplementationOnce(async (request) => {
        request?.onReplaced?.({
          reason: "repriced",
          transaction: { hash: replacementHash },
          replacedTransaction: { hash: txHash },
          transactionReceipt: bidPlacedReceipt({ hash: replacementHash, auctionId: 912n })
        });
        throw new Error("RPC disconnected after repricing");
      });

      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      await screen.findByText("Confirmation not verified");
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({ hash: txHash });

      setItem.mockRestore();
      setItemRestored = true;
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));
      await waitFor(() => expect(screen.queryByText("Recovery storage unavailable")).not.toBeInTheDocument());
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({ hash: replacementHash });

      waitForTransactionReceipt.mockResolvedValueOnce(bidPlacedReceipt({ hash: replacementHash, auctionId: 912n }));
      fireEvent.click(screen.getByRole("button", { name: "Check transaction confirmation" }));

      expect(await screen.findByText("Your submitted bid is confirmed on-chain.")).toBeInTheDocument();
      expect(writeContract).toHaveBeenCalledTimes(1);
      expect(window.sessionStorage).toHaveLength(0);
    } finally {
      if (!setItemRestored) setItem.mockRestore();
    }
  });

  it.each([
    ["cancelled", "The original reviewed bid was cancelled and was not confirmed."],
    ["replaced", "The original reviewed bid was replaced and was not confirmed."]
  ] as const)("does not confirm a %s bid transaction", async (reason, expectedMessage) => {
    const { waitForTransactionReceipt, writeContract, onBidComplete } = setupBid();
    queueReplacement(waitForTransactionReceipt, reason);
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
    expect(screen.queryByText("Transaction confirmed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    expect(screen.getByTitle(txHash)).toBeInTheDocument();
    expect(screen.getByText(`Replacement transaction ${replacementHash} was confirmed on-chain.`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Review bid" })).toBeEnabled());
    expect(onBidComplete).toHaveBeenCalled();
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("keeps a cancelled bid locked until auction and wallet state refresh succeeds", async () => {
    const onBidComplete = vi.fn()
      .mockRejectedValueOnce(new Error("auction refresh unavailable"))
      .mockResolvedValue(undefined);
    const { waitForTransactionReceipt } = setupBid({ onBidComplete });
    queueReplacement(waitForTransactionReceipt, "cancelled");
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    await screen.findByText("The original reviewed bid was cancelled and was not confirmed.");
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(window.sessionStorage).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh resolved transaction state" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Review bid" })).toBeEnabled());
    expect(onBidComplete).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("detects a replacement while recovering a timed-out receipt", async () => {
    const { waitForTransactionReceipt, writeContract } = setupBid({ receipt: new Error("RPC timeout") });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    expect(window.sessionStorage).toHaveLength(1);

    queueReplacement(waitForTransactionReceipt, "replaced");
    fireEvent.click(screen.getByRole("button", { name: "Check transaction confirmation" }));
    expect(await screen.findByText("The original reviewed bid was replaced and was not confirmed.")).toBeInTheDocument();
    expect(screen.queryByText("Transaction confirmed")).not.toBeInTheDocument();
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("keeps an unavailable receipt locked and permits recovery from a verified revert", async () => {
    const { waitForTransactionReceipt, writeContract } = setupBid({ receipt: new Error("RPC timeout") });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    waitForTransactionReceipt.mockRejectedValueOnce(new Error("Receipt not found"));
    fireEvent.click(screen.getByRole("button", { name: "Check transaction confirmation" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Check transaction confirmation" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
    waitForTransactionReceipt.mockResolvedValueOnce({ status: "reverted", transactionHash: txHash, logs: [] });
    fireEvent.click(screen.getByRole("button", { name: "Check transaction confirmation" }));
    await screen.findByText("The transaction was included on-chain but reverted.");
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeEnabled();
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("offers wallet recovery and blocks bidding when wrongNetwork=%s", async (wrongNetwork) => {
    const { view, writeContract } = setupBid();
    await screen.findByRole("button", { name: "Review bid" });
    vi.mocked(useAccount).mockReturnValue({ address: wrongNetwork ? testAddresses.primaryBidder : undefined,
      chainId: 1, isConnected: wrongNetwork, connector: connectorB } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<WalletBidPanel auction={auctionDetailFixture.auction}
      expectedChainId={auctionDetailFixture.chainId} expectedAuctionHouse={auctionDetailFixture.auctionHouse}
      onBidComplete={async () => undefined} />);
    expect(screen.getByRole("button", { name: "Connect or switch wallet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review bid" })).not.toBeInTheDocument();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("masks a pending bid for another account and restores it when the account returns", async () => {
    const { view, renderedAuction, waitForTransactionReceipt, writeContract } = setupBid();
    waitForTransactionReceipt.mockImplementationOnce(() => new Promise(() => undefined));
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Bid transaction submitted. Waiting for confirmation.");
    expect(window.sessionStorage).toHaveLength(1);

    vi.mocked(useAccount).mockReturnValue({ address: testAddresses.seller, chainId: 31337,
      isConnected: true, connector: connectorB } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<WalletBidPanel auction={renderedAuction}
      expectedChainId={auctionDetailFixture.chainId} expectedAuctionHouse={auctionDetailFixture.auctionHouse}
      onBidComplete={async () => undefined} />);
    await waitFor(() => expect(screen.queryByText("Confirmation not verified")).not.toBeInTheDocument());
    expect(screen.queryByText("Bid transaction submitted. Waiting for confirmation.")).not.toBeInTheDocument();

    vi.mocked(useAccount).mockReturnValue({ address: testAddresses.primaryBidder, chainId: 31337,
      isConnected: true, connector: connectorB } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<WalletBidPanel auction={renderedAuction}
      expectedChainId={auctionDetailFixture.chainId} expectedAuctionHouse={auctionDetailFixture.auctionHouse}
      onBidComplete={async () => undefined} />);
    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check transaction confirmation" })).toBeEnabled();
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(1);
  });

  it("restores a pending bid after unmount and remount", async () => {
    const first = setupBid();
    first.waitForTransactionReceipt.mockImplementationOnce(() => new Promise(() => undefined));
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Bid transaction submitted. Waiting for confirmation.");
    expect(window.sessionStorage).toHaveLength(1);
    first.view.unmount();

    setupBid();
    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check transaction confirmation" })).toBeEnabled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it("fails closed and retains an invalid stored transaction marker", async () => {
    const key = [
      "bidback:pending-wallet-bid:v1",
      "31337",
      localDeploymentFixture.contracts.auctionHouse.toLowerCase(),
      "909",
      testAddresses.primaryBidder.toLowerCase()
    ].join(":");
    window.sessionStorage.setItem(key, JSON.stringify({ version: 1, hash: "not-a-hash" }));
    const { writeContract } = setupBid({ auctionOverrides: { auctionId: "909" } });

    const review = await screen.findByRole("button", { name: "Review bid" });
    expect(await screen.findByText("Recovery storage unavailable")).toBeInTheDocument();
    expect(screen.getByText(/contains an invalid bid marker/)).toBeInTheDocument();
    expect(review).toBeDisabled();
    expect(screen.queryByText("Confirmation not verified")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("uses one recovery key for equivalent canonical auction IDs", async () => {
    const key = [
      "bidback:pending-wallet-bid:v1",
      "31337",
      localDeploymentFixture.contracts.auctionHouse.toLowerCase(),
      "1",
      testAddresses.primaryBidder.toLowerCase()
    ].join(":");
    window.sessionStorage.setItem(key, JSON.stringify({
      version: 1,
      hash: txHash,
      expectedNewCap: "1200000000000000000"
    }));
    const { writeContract } = setupBid({ auctionOverrides: { auctionId: "01" } });

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check transaction confirmation" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("fails closed when recovery storage cannot be read", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("read blocked");
    });
    try {
      const { writeContract } = setupBid({ auctionOverrides: { auctionId: "901" } });
      const review = await screen.findByRole("button", { name: "Review bid" });
      expect(await screen.findByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(review).toBeDisabled();
      expect(screen.getByText(/Session recovery storage read failed\. read blocked/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry recovery storage access" })).toBeInTheDocument();
      expect(writeContract).not.toHaveBeenCalled();
    } finally {
      getItem.mockRestore();
    }
  });

  it("blocks before opening the wallet when recovery storage cannot be written", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("write blocked");
    });
    try {
      const { writeContract } = setupBid({ auctionOverrides: { auctionId: "902" } });
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      expect(await screen.findByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(screen.getByText(/No wallet request was opened\. Enable session storage and try again\./)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
      expect(writeContract).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  it("cleans up a certain pre-dispatch readback failure before enabling an explicit retry", async () => {
    const originalGetItem = Storage.prototype.getItem;
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const stored = originalGetItem.call(this, key);
      if (stored?.includes("wallet-dispatch-intent")) throw new Error("intent readback blocked");
      return stored;
    });
    let getItemRestored = false;
    try {
      const { writeContract } = setupBid({ auctionOverrides: { auctionId: "906" } });
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      expect(await screen.findByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(screen.getByText(/Session recovery storage read failed\. intent readback blocked/)).toBeInTheDocument();
      expect(writeContract).not.toHaveBeenCalled();
      expect(window.sessionStorage).toHaveLength(1);
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toEqual({
        version: 1,
        kind: "wallet-not-opened-cleanup-pending"
      });

      getItem.mockRestore();
      getItemRestored = true;
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));

      await waitFor(() => expect(screen.queryByText("Recovery storage unavailable")).not.toBeInTheDocument());
      expect(screen.getByText("No wallet request was opened.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Review bid" })).toBeEnabled();
      expect(window.sessionStorage).toHaveLength(0);
      expect(writeContract).not.toHaveBeenCalled();
    } finally {
      if (!getItemRestored) getItem.mockRestore();
    }
  });

  it("keeps a certain pre-dispatch failure locked when cleanup cannot be verified", async () => {
    const originalGetItem = Storage.prototype.getItem;
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const stored = originalGetItem.call(this, key);
      if (stored?.includes("wallet-dispatch-intent")) throw new Error("intent readback blocked");
      return stored;
    });
    let getItemRestored = false;
    const originalRemoveItem = Storage.prototype.removeItem;
    let removeItem: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const { writeContract } = setupBid({ auctionOverrides: { auctionId: "910" } });
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
      await screen.findByText("Recovery storage unavailable");

      getItem.mockRestore();
      getItemRestored = true;
      removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
        if (!key.endsWith(":capability-probe")) throw new Error("cleanup blocked");
        return originalRemoveItem.call(this, key);
      });
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));

      expect(await screen.findByText(/cleanup is not yet verified/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
      expect(window.sessionStorage).toHaveLength(1);
      expect(writeContract).not.toHaveBeenCalled();
    } finally {
      removeItem?.mockRestore();
      if (!getItemRestored) getItem.mockRestore();
    }
  });

  it("keeps a durable hash-unknown intent locked across a remount when hash persistence fails", async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key.endsWith(":capability-probe") || JSON.parse(value).kind === "wallet-dispatch-intent") {
        return originalSetItem.call(this, key, value);
      }
      throw new Error("post-dispatch write blocked");
    });
    const first = setupBid({ auctionOverrides: { auctionId: "903" } });
    first.waitForTransactionReceipt.mockImplementationOnce(() => new Promise(() => undefined));
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Bid transaction submitted. Waiting for confirmation.");
    expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
    expect(first.writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(1);
    expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toEqual({
      version: 1,
      kind: "wallet-dispatch-intent"
    });
    first.view.unmount();
    setItem.mockRestore();

    const second = setupBid({ auctionOverrides: { auctionId: "903" } });
    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.getByText("A wallet bid request may have been submitted, but no transaction hash was saved.")).toBeInTheDocument();
    expect(screen.getByText(/Check this account's wallet activity/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check transaction confirmation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(second.writeContract).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous wallet error fail-closed without checking a nonexistent hash", async () => {
    const first = setupBid({
      auctionOverrides: { auctionId: "905" },
      writeError: { message: "request rejected after provider response loss" }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("A wallet bid request may have been submitted, but no transaction hash was saved.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check transaction confirmation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
    expect(first.writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(1);
    expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toEqual({
      version: 1,
      kind: "wallet-dispatch-intent"
    });

    first.view.unmount();
    const second = setupBid({ auctionOverrides: { auctionId: "905" } });
    expect(await screen.findByText("A wallet bid request may have been submitted, but no transaction hash was saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(second.writeContract).not.toHaveBeenCalled();
  });

  it("keeps an invalid wallet transaction hash fail-closed behind the durable intent", async () => {
    const first = setupBid({ auctionOverrides: { auctionId: "907" } });
    first.writeContract.mockResolvedValueOnce("invalid-hash" as typeof txHash);
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("A wallet bid request may have been submitted, but no transaction hash was saved.")).toBeInTheDocument();
    expect(screen.getByText("Wallet returned an invalid transaction hash.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check transaction confirmation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it("keeps a confirmed result explicit and locked when recovery cleanup fails", async () => {
    const originalRemoveItem = Storage.prototype.removeItem;
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (key.endsWith(":capability-probe")) return originalRemoveItem.call(this, key);
      throw new Error("remove blocked");
    });
    const { writeContract } = setupBid({ auctionOverrides: { auctionId: "904" } });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Bid placed with 1.2 ETH sent.")).toBeInTheDocument();
    expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Confirmation not verified")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(1);

    removeItem.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));
    await waitFor(() => expect(screen.queryByText("Recovery storage unavailable")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Review bid" })).toBeEnabled();
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("discards preflight results after the wallet identity changes", async () => {
    const { view, getBlock, writeContract } = setupBid();
    let resolveBlock!: (block: { timestamp: bigint; number: bigint }) => void;
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    getBlock.mockImplementationOnce(() => new Promise((resolve) => { resolveBlock = resolve; }));
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await waitFor(() => expect(getBlock).toHaveBeenCalled());
    vi.mocked(useAccount).mockReturnValue({ address: testAddresses.seller, chainId: 31337,
      isConnected: true, connector: connectorB } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<WalletBidPanel auction={auctionDetailFixture.auction}
      expectedChainId={auctionDetailFixture.chainId} expectedAuctionHouse={auctionDetailFixture.auctionHouse}
      onBidComplete={async () => undefined} />);
    await act(async () => resolveBlock({ timestamp: 1n, number: 102n }));
    expect(writeContract).not.toHaveBeenCalled();
    expect(screen.queryByText("Waiting for wallet signature")).not.toBeInTheDocument();
  });

  it("does not let an old operation clear the busy state of a new wallet identity", async () => {
    const { view, renderedAuction, getBlock, writeContract } = setupBid();
    let resolveOldBlock!: (block: { timestamp: bigint; number: bigint }) => void;
    const firstReview = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(firstReview).toBeEnabled());
    getBlock.mockImplementationOnce(() => new Promise((resolve) => { resolveOldBlock = resolve; }));
    fireEvent.click(firstReview);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await waitFor(() => expect(getBlock).toHaveBeenCalledTimes(1));

    vi.mocked(useAccount).mockReturnValue({ address: testAddresses.seller, chainId: 31337,
      isConnected: true, connector: connectorB } as unknown as ReturnType<typeof useAccount>);
    view.rerender(<WalletBidPanel auction={renderedAuction}
      expectedChainId={auctionDetailFixture.chainId} expectedAuctionHouse={auctionDetailFixture.auctionHouse}
      onBidComplete={async () => undefined} />);
    const secondReview = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(secondReview).toBeEnabled());

    let resolveNewWrite!: (hash: typeof txHash) => void;
    writeContract.mockImplementationOnce(() => new Promise((resolve) => { resolveNewWrite = resolve; }));
    fireEvent.click(secondReview);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Waiting for wallet signature");
    expect(screen.getByRole("button", { name: "Working..." })).toBeDisabled();

    await act(async () => resolveOldBlock({ timestamp: 1n, number: 102n }));
    expect(screen.getByRole("button", { name: "Working..." })).toBeDisabled();
    await act(async () => resolveNewWrite(txHash));
    await screen.findByText("Transaction confirmed");
  });

  it("keeps the review available for retry after a rejected signature", async () => {
    const { writeContract } = setupBid({ writeError: { code: 4001, message: "User rejected the request." } });
    const reviewButton = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    fireEvent.click(reviewButton);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Transaction rejected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeEnabled();
    expect(window.sessionStorage).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await waitFor(() => expect(writeContract).toHaveBeenCalledTimes(2));
  });

  it("accepts only a canonical numeric 4001 from a nested provider cause as a certain rejection", async () => {
    const { writeContract } = setupBid({
      writeError: {
        message: "wallet request failed",
        cause: { message: "provider wrapper failed", cause: { code: 4001, message: "Rejected" } }
      }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Transaction rejected")).toBeInTheDocument();
    expect(screen.queryByText("Confirmation not verified")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeEnabled();
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("retries rejected-intent cleanup without converting the rejection into an unknown submission", async () => {
    const originalRemoveItem = Storage.prototype.removeItem;
    let cleanupBlocked = true;
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (cleanupBlocked && !key.endsWith(":capability-probe")) throw new Error("rejection cleanup blocked");
      return originalRemoveItem.call(this, key);
    });
    try {
      const { writeContract } = setupBid({
        auctionOverrides: { auctionId: "908" },
        writeError: { code: 4001, message: "User rejected the request." }
      });
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      expect(await screen.findByText("Transaction rejected")).toBeInTheDocument();
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(screen.queryByText("A wallet bid request may have been submitted, but no transaction hash was saved.")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Check transaction confirmation" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
      expect(writeContract).toHaveBeenCalledTimes(1);
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toEqual({
        version: 1,
        kind: "wallet-rejected-cleanup-pending"
      });

      cleanupBlocked = false;
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));

      await waitFor(() => expect(screen.queryByText("Recovery storage unavailable")).not.toBeInTheDocument());
      expect(screen.getByText("Transaction rejected")).toBeInTheDocument();
      expect(screen.queryByText("Confirmation not verified")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Check transaction confirmation" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeEnabled();
      expect(window.sessionStorage).toHaveLength(0);
      expect(writeContract).toHaveBeenCalledTimes(1);
    } finally {
      removeItem.mockRestore();
    }
  });
});

// Every component scenario uses B, while the legacy global points at unrelated A.
afterEach(() => {
  expect(providerA.request).not.toHaveBeenCalled();
});
