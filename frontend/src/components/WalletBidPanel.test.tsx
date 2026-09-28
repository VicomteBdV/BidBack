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

function blockHashFor(blockNumber: bigint, offset = 0n): `0x${string}` {
  return `0x${(blockNumber + offset).toString(16).padStart(64, "0")}`;
}

type MockReceipt = {
  status: string;
  transactionHash?: `0x${string}`;
  blockNumber?: bigint;
  blockHash?: `0x${string}`;
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
    blockNumber: 102n,
    blockHash: blockHashFor(102n),
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

function storedBidMarker(auctionId: string) {
  return {
    version: 2,
    kind: "submitted-wallet-bid",
    hash: txHash,
    expectedNewCap: "1200000000000000000",
    lot: {
      chainId: 31337,
      auctionHouse: auctionDetailFixture.auctionHouse,
      auctionId,
      bidder: testAddresses.primaryBidder,
      seller: auctionDetailFixture.auction.seller,
      nft: auctionDetailFixture.auction.nft,
      tokenId: auctionDetailFixture.auction.tokenId,
      startPrice: auctionDetailFixture.auction.startPrice,
      startTime: auctionDetailFixture.auction.startTime,
      initialEndTime: auctionDetailFixture.auction.initialEndTime,
      modules: {
        nftVault: testAddresses.nftVault,
        escrowVault: testAddresses.escrowVault,
        distributionVault: testAddresses.distributionVault,
        reputationAdapter: testAddresses.reputationAdapter
      },
      reviewBlock: { number: "101", hash: blockHashFor(101n) }
    }
  };
}

function pendingBidKeyFor(auctionId: string) {
  return [
    "bidback:pending-wallet-bid:v1",
    "31337",
    localDeploymentFixture.contracts.auctionHouse.toLowerCase(),
    auctionId,
    testAddresses.primaryBidder.toLowerCase()
  ].join(":");
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

type OnchainModuleOverrides = Partial<{
  nftVault: `0x${string}`;
  escrowVault: `0x${string}`;
  distributionVault: `0x${string}`;
  reputationAdapter: `0x${string}`;
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
  historicalBlockHashOffset = 0n,
  postReceiptHistoricalBlockHashOffset = 0n,
  receiptBlockHashOffset = 0n,
  snapshotEscrowVault = testAddresses.escrowVault,
  preflightSnapshotEscrowVault,
  snapshotModuleOverrides = {},
  preflightSnapshotModuleOverrides,
  onchainAuctionOverrides = {},
  preflightOnchainAuctionOverrides,
  postReceiptOnchainAuctionOverrides,
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
  historicalBlockHashOffset?: bigint;
  postReceiptHistoricalBlockHashOffset?: bigint;
  receiptBlockHashOffset?: bigint;
  snapshotEscrowVault?: `0x${string}`;
  preflightSnapshotEscrowVault?: `0x${string}`;
  snapshotModuleOverrides?: OnchainModuleOverrides;
  preflightSnapshotModuleOverrides?: OnchainModuleOverrides;
  onchainAuctionOverrides?: OnchainAuctionOverrides;
  preflightOnchainAuctionOverrides?: OnchainAuctionOverrides;
  postReceiptOnchainAuctionOverrides?: OnchainAuctionOverrides;
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
        ...(auctionReadCount === 1 ? {} : preflightOnchainAuctionOverrides ?? {}),
        ...(auctionReadCount >= 3 ? postReceiptOnchainAuctionOverrides ?? {} : {})
      };
    }
    if (functionName === "getAuctionModules") {
      moduleReadCount += 1;
      const initialModules = {
        nftVault: testAddresses.nftVault,
        escrowVault: snapshotEscrowVault,
        distributionVault: testAddresses.distributionVault,
        reputationAdapter: testAddresses.reputationAdapter,
        ...snapshotModuleOverrides
      };
      return moduleReadCount === 1
        ? initialModules
        : {
            ...initialModules,
            ...(preflightSnapshotEscrowVault ? { escrowVault: preflightSnapshotEscrowVault } : {}),
            ...preflightSnapshotModuleOverrides
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
  const historicalBlockReadCounts = new Map<bigint, number>();
  const getBlock = vi.fn(async (request: { blockNumber?: bigint } = {}) => {
    if (request.blockNumber !== undefined) {
      const historicalReadCount = (historicalBlockReadCounts.get(request.blockNumber) ?? 0) + 1;
      historicalBlockReadCounts.set(request.blockNumber, historicalReadCount);
      const offset = request.blockNumber === 102n
        ? receiptBlockHashOffset
        : historicalBlockHashOffset + (historicalReadCount > 1 ? postReceiptHistoricalBlockHashOffset : 0n);
      return {
        timestamp: latestBlockTimestamp,
        number: request.blockNumber,
        hash: blockHashFor(request.blockNumber, offset)
      };
    }
    blockReadCount += 1;
    const number = blockReadCount === 1 ? initialBlockNumber : preflightBlockNumber;
    return {
      timestamp: blockReadCount === 1
        ? latestBlockTimestamp
        : preflightBlockTimestamp ?? latestBlockTimestamp,
      number,
      hash: blockHashFor(number)
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
      : {
          status,
          transactionHash: replacementHash,
          blockNumber: 102n,
          blockHash: blockHashFor(102n),
          logs: []
        };
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
    const first = setupBid({
      receipt: {
        status: "reverted",
        transactionHash: txHash,
        blockNumber: 102n,
        blockHash: blockHashFor(102n),
        logs: []
      }
    });
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

  it("uses the receipt block canonicality read as the final RPC before settling a revert", async () => {
    const { getBlock, readContract } = setupBid({
      receipt: {
        status: "reverted",
        transactionHash: txHash,
        blockNumber: 102n,
        blockHash: blockHashFor(102n),
        logs: []
      }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("The transaction was included on-chain but reverted.");

    expect(getBlock.mock.calls.at(-1)?.[0]).toEqual({ blockNumber: 102n });
    expect(getBlock.mock.invocationCallOrder.at(-1))
      .toBeGreaterThan(readContract.mock.invocationCallOrder.at(-1) ?? 0);
    expect(window.sessionStorage).toHaveLength(0);
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
      version: 2,
      kind: "submitted-wallet-bid",
      hash: txHash,
      expectedNewCap: "1200000000000000000",
      lot: {
        chainId: 31337,
        auctionHouse: auctionDetailFixture.auctionHouse,
        auctionId: "1",
        bidder: testAddresses.primaryBidder,
        seller: auctionDetailFixture.auction.seller,
        nft: auctionDetailFixture.auction.nft,
        tokenId: auctionDetailFixture.auction.tokenId,
        startPrice: auctionDetailFixture.auction.startPrice,
        startTime: auctionDetailFixture.auction.startTime,
        initialEndTime: auctionDetailFixture.auction.initialEndTime,
        modules: {
          nftVault: testAddresses.nftVault,
          escrowVault: testAddresses.escrowVault,
          distributionVault: testAddresses.distributionVault,
          reputationAdapter: testAddresses.reputationAdapter
        },
        reviewBlock: { number: "101", hash: blockHashFor(101n) }
      }
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

  it.each([
    {
      label: "missing receipt block number",
      receipt: { ...bidPlacedReceipt(), blockNumber: undefined }
    },
    {
      label: "missing receipt block hash",
      receipt: { ...bidPlacedReceipt(), blockHash: undefined }
    },
    {
      label: "non-canonical receipt block hash",
      receipt: { ...bidPlacedReceipt(), blockHash: unrelatedHash }
    }
  ])("keeps recovery locked for $label", async ({ receipt }) => {
    const { onBidComplete } = setupBid({ receipt });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText("Transaction confirmed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
    expect(onBidComplete).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it("rechecks the review block after a receipt and keeps an orphaned preflight marker locked", async () => {
    const { onBidComplete } = setupBid({ historicalBlockHashOffset: 10_000n });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    expect(screen.getByText("The canonical review block changed or is unavailable.")).toBeInTheDocument();
    expect(onBidComplete).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it("rechecks immutable lot identity after a receipt before settling", async () => {
    const { onBidComplete } = setupBid({
      postReceiptOnchainAuctionOverrides: { tokenId: 999n }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    expect(screen.getByText("Persisted bid lot mismatch (token ID).")).toBeInTheDocument();
    expect(onBidComplete).not.toHaveBeenCalled();
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

  it.each([
    ["seller", { seller: testAddresses.secondBidder }],
    ["NFT contract", { nft: testAddresses.paramsController }],
    ["token ID", { tokenId: "999" }],
    ["start price", { startPrice: "1000000000000000001" }],
    ["start time", { startTime: "1780000001" }],
    ["initial end time", { initialEndTime: "1780007201" }]
  ] as const)("refuses recovery when the current lot reuses the same context with a different %s", async (
    expectedMismatch,
    changedLot
  ) => {
    const first = setupBid({
      auctionOverrides: { auctionId: "913" },
      receipt: { status: "success", transactionHash: txHash, logs: [] }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    first.view.unmount();

    const second = setupBid({
      auctionOverrides: { auctionId: "913", ...changedLot }
    });
    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check transaction confirmation" }));

    expect(await screen.findByText("Recovery identity not verified")).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(`Displayed auction does not match the persisted bid lot \\(${expectedMismatch}\\)`)).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(second.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(second.writeContract).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it.each([
    ["NFTVault snapshot", { nftVault: testAddresses.paramsController }],
    ["EscrowVault snapshot", { escrowVault: testAddresses.distributionVault }],
    ["DistributionVault snapshot", { distributionVault: testAddresses.paramsController }],
    ["ReputationAdapter snapshot", { reputationAdapter: testAddresses.paramsController }]
  ] as const)("refuses recovery when the current auction has a different %s", async (
    expectedMismatch,
    snapshotModuleOverrides
  ) => {
    const first = setupBid({
      auctionOverrides: { auctionId: "914" },
      receipt: { status: "success", transactionHash: txHash, logs: [] }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    first.view.unmount();

    const second = setupBid({
      auctionOverrides: { auctionId: "914" },
      snapshotModuleOverrides
    });
    fireEvent.click(await screen.findByRole("button", { name: "Check transaction confirmation" }));

    expect(await screen.findByText("Recovery identity not verified")).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(`Persisted bid lot mismatch \\(${expectedMismatch}\\)`)).length)
      .toBeGreaterThan(0);
    expect(second.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it("refuses recovery when the canonical review block changed after a reset or reorg", async () => {
    const first = setupBid({
      auctionOverrides: { auctionId: "915" },
      receipt: { status: "success", transactionHash: txHash, logs: [] }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    first.view.unmount();

    const second = setupBid({
      auctionOverrides: { auctionId: "915" },
      historicalBlockHashOffset: 10_000n
    });
    fireEvent.click(await screen.findByRole("button", { name: "Check transaction confirmation" }));

    expect(await screen.findByText("Recovery identity not verified")).toBeInTheDocument();
    expect(screen.getAllByText(/canonical review block changed or is unavailable/).length).toBeGreaterThan(0);
    expect(second.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it.each([
    {
      label: "review block changes after the initial recovery check",
      secondSetup: { postReceiptHistoricalBlockHashOffset: 10_000n },
      expectedDetail: "The canonical review block changed or is unavailable."
    },
    {
      label: "lot identity changes after the initial recovery check",
      secondSetup: { postReceiptOnchainAuctionOverrides: { tokenId: 999n } },
      expectedDetail: "Persisted bid lot mismatch (token ID)."
    }
  ])("keeps recovery locked when $label", async ({ secondSetup, expectedDetail }) => {
    const first = setupBid({
      auctionOverrides: { auctionId: "920" },
      receipt: new Error("RPC timeout")
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    first.view.unmount();

    const second = setupBid({ auctionOverrides: { auctionId: "920" }, ...secondSetup });
    fireEvent.click(await screen.findByRole("button", { name: "Check transaction confirmation" }));

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    expect(screen.getByText(expectedDetail)).toBeInTheDocument();
    expect(second.waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    expect(second.onBidComplete).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it("binds recovery to the displayed immutable lot even when RPC still reports the stored lot", async () => {
    const first = setupBid({
      auctionOverrides: { auctionId: "921" },
      receipt: new Error("RPC timeout")
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    first.view.unmount();

    const second = setupBid({
      auctionOverrides: { auctionId: "921", tokenId: "999" },
      onchainAuctionOverrides: { tokenId: BigInt(auctionDetailFixture.auction.tokenId) }
    });
    fireEvent.click(await screen.findByRole("button", { name: "Check transaction confirmation" }));

    expect(await screen.findByText("Recovery identity not verified")).toBeInTheDocument();
    expect(screen.getAllByText(/Displayed auction does not match the persisted bid lot \(token ID\)/).length)
      .toBeGreaterThan(0);
    expect(second.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it.each([
    {
      label: "confirmed outcome",
      auctionId: "927",
      terminal: {
        resolvedOutcome: {
          kind: "confirmed",
          hash: txHash,
          blockNumber: "102",
          blockHash: blockHashFor(102n)
        }
      },
      terminalMessage: "This bid was confirmed on-chain, but recovery storage cleanup is incomplete."
    },
    {
      label: "resolved replacement",
      auctionId: "928",
      terminal: {
        resolvedReplacement: {
          reason: "replaced",
          hash: replacementHash,
          originalHash: txHash,
          outcome: "confirmed",
          blockNumber: "102",
          blockHash: blockHashFor(102n)
        }
      },
      terminalMessage: "The original reviewed bid was replaced and was not confirmed."
    }
  ] as const)("keeps a reloaded $label marker locked after its terminal block is reorganized", async ({
    auctionId,
    terminal,
    terminalMessage
  }) => {
    const marker = { ...storedBidMarker(auctionId), ...terminal };
    const key = pendingBidKeyFor(auctionId);
    window.sessionStorage.setItem(key, JSON.stringify(marker));
    const { waitForTransactionReceipt } = setupBid({
      auctionOverrides: { auctionId },
      receiptBlockHashOffset: 1n
    });
    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    const checkConfirmation = screen.getByRole("button", { name: "Check transaction confirmation" });
    fireEvent.click(checkConfirmation);

    await waitFor(() => expect(checkConfirmation).toBeEnabled());
    expect(screen.getByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText(terminalMessage)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Transaction evidence and technical details"));
    expect(screen.getByText(/stored terminal transaction block is no longer canonical/)).toBeInTheDocument();
    expect(waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
  });

  it.each([
    ["chain ID", (marker: Record<string, any>) => { marker.lot.chainId = 1; }],
    ["AuctionHouse", (marker: Record<string, any>) => { marker.lot.auctionHouse = testAddresses.paramsController; }],
    ["auction ID", (marker: Record<string, any>) => { marker.lot.auctionId = "999"; }],
    ["bidder", (marker: Record<string, any>) => { marker.lot.bidder = testAddresses.secondBidder; }]
  ] as const)("refuses a structurally valid marker whose persisted %s conflicts with its recovery key", async (
    expectedMismatch,
    mutateMarker
  ) => {
    const first = setupBid({
      auctionOverrides: { auctionId: "917" },
      receipt: { status: "success", transactionHash: txHash, logs: [] }
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    const key = window.sessionStorage.key(0)!;
    const marker = JSON.parse(window.sessionStorage.getItem(key)!);
    mutateMarker(marker);
    window.sessionStorage.setItem(key, JSON.stringify(marker));
    first.view.unmount();

    const second = setupBid({ auctionOverrides: { auctionId: "917" } });
    fireEvent.click(await screen.findByRole("button", { name: "Check transaction confirmation" }));

    expect(await screen.findByText("Recovery identity not verified")).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(`Persisted bid context mismatch \\(${expectedMismatch}\\)`)).length)
      .toBeGreaterThan(0);
    expect(second.getBlock).toHaveBeenCalledTimes(1);
    expect(second.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(1);
  });

  it("renders recovery controls as distinct primary and secondary actions in one labelled group", async () => {
    setupBid({ receipt: new Error("RPC timeout") });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");

    const actions = screen.getByRole("group", { name: "Bid recovery actions" });
    const confirmationAction = within(actions).getByRole("button", { name: "Check transaction confirmation" });
    const refreshAction = within(actions).getByRole("button", { name: "Refresh wallet bid data" });
    expect(confirmationAction).toHaveClass("transaction-primary-action");
    expect(refreshAction).toHaveClass("transaction-secondary-action");
    expect(confirmationAction).not.toBe(refreshAction);
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

  it("keeps a repriced bid locked when its receipt block is no longer canonical", async () => {
    const { waitForTransactionReceipt, onBidComplete } = setupBid({ receiptBlockHashOffset: 1n });
    queueReplacement(waitForTransactionReceipt, "repriced");
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText("Transaction confirmed")).not.toBeInTheDocument();
    expect(onBidComplete).not.toHaveBeenCalled();
    expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({
      hash: replacementHash
    });
  });

  it("does not resolve a replaced bid when the replacement receipt block is no longer canonical", async () => {
    const { waitForTransactionReceipt, onBidComplete } = setupBid({ receiptBlockHashOffset: 1n });
    queueReplacement(waitForTransactionReceipt, "replaced");
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText("The original reviewed bid was replaced and was not confirmed.")).not.toBeInTheDocument();
    expect(onBidComplete).not.toHaveBeenCalled();
    const retained = JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!);
    expect(retained.hash).toBe(txHash);
    expect(retained).not.toHaveProperty("resolvedReplacement");
  });

  it("recovers a repriced hash and its complete lot identity after reload once replacement was observed", async () => {
    const first = setupBid({ auctionOverrides: { auctionId: "916" } });
    first.waitForTransactionReceipt.mockImplementationOnce(async (request) => {
      request?.onReplaced?.({
        reason: "repriced",
        transaction: { hash: replacementHash },
        replacedTransaction: { hash: txHash },
        transactionReceipt: bidPlacedReceipt({ hash: replacementHash, auctionId: 916n })
      });
      throw new Error("RPC disconnected after observing repricing");
    });
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Confirmation not verified");
    const stored = JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!);
    expect(stored).toMatchObject({
      version: 2,
      kind: "submitted-wallet-bid",
      hash: replacementHash,
      lot: { auctionId: "916", tokenId: auctionDetailFixture.auction.tokenId }
    });
    first.view.unmount();

    const second = setupBid({ auctionOverrides: { auctionId: "916" } });
    second.waitForTransactionReceipt.mockResolvedValueOnce(
      bidPlacedReceipt({ hash: replacementHash, auctionId: 916n })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Check transaction confirmation" }));

    expect(await screen.findByText("Your submitted bid is confirmed on-chain.")).toBeInTheDocument();
    expect(second.writeContract).not.toHaveBeenCalled();
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

  it("detects a silently ignored repriced hash write and retains the complete replacement state", async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (value.includes(replacementHash)) return undefined;
      return originalSetItem.call(this, key, value);
    });
    let restored = false;
    try {
      const first = setupBid({ auctionOverrides: { auctionId: "933" } });
      first.waitForTransactionReceipt.mockImplementationOnce(async (request) => {
        request?.onReplaced?.({
          reason: "repriced",
          transaction: { hash: replacementHash },
          replacedTransaction: { hash: txHash },
          transactionReceipt: bidPlacedReceipt({ hash: replacementHash, auctionId: 933n })
        });
        throw new Error("RPC disconnected after repricing");
      });

      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      await screen.findByText("Confirmation not verified");
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(screen.getByText(/stored value does not match the latest recovery state/)).toBeInTheDocument();
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({
        hash: txHash,
        lot: { auctionId: "933" }
      });

      setItem.mockRestore();
      restored = true;
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));
      await waitFor(() => expect(screen.queryByText("Recovery storage unavailable")).not.toBeInTheDocument());
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({
        version: 2,
        kind: "submitted-wallet-bid",
        hash: replacementHash,
        lot: { auctionId: "933", tokenId: auctionDetailFixture.auction.tokenId }
      });
      expect(screen.getByRole("button", { name: "Continue in wallet" })).toBeDisabled();
    } finally {
      if (!restored) setItem.mockRestore();
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
    waitForTransactionReceipt.mockResolvedValueOnce({
      status: "reverted",
      transactionHash: txHash,
      blockNumber: 102n,
      blockHash: blockHashFor(102n),
      logs: []
    });
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
    window.sessionStorage.setItem(key, JSON.stringify({
      version: 2,
      kind: "submitted-wallet-bid",
      hash: "not-a-hash",
      expectedNewCap: "1200000000000000000"
    }));
    const { writeContract } = setupBid({ auctionOverrides: { auctionId: "909" } });

    const review = await screen.findByRole("button", { name: "Review bid" });
    expect(await screen.findByText("Recovery storage unavailable")).toBeInTheDocument();
    expect(screen.getByText(/contains an invalid or incomplete bid marker/)).toBeInTheDocument();
    expect(review).toBeDisabled();
    expect(screen.queryByText("Confirmation not verified")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("rejects a terminal marker with missing canonical block evidence", async () => {
    const auctionId = "925";
    const marker = {
      ...storedBidMarker(auctionId),
      resolvedOutcome: {
        kind: "confirmed",
        hash: txHash,
        blockNumber: "102"
      }
    };
    const key = pendingBidKeyFor(auctionId);
    window.sessionStorage.setItem(key, JSON.stringify(marker));
    const { writeContract } = setupBid({ auctionOverrides: { auctionId } });

    expect(await screen.findByText("Recovery storage unavailable")).toBeInTheDocument();
    expect(screen.getByText(/invalid or incomplete bid marker/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check transaction confirmation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it.each([
    ["outcome hash", (marker: Record<string, any>) => {
      marker.resolvedOutcome = {
        kind: "confirmed",
        hash: unrelatedHash,
        blockNumber: "102",
        blockHash: blockHashFor(102n)
      };
    }],
    ["replacement original hash", (marker: Record<string, any>) => {
      marker.resolvedReplacement = {
        reason: "replaced",
        hash: replacementHash,
        originalHash: unrelatedHash,
        outcome: "confirmed",
        blockNumber: "102",
        blockHash: blockHashFor(102n)
      };
    }]
  ] as const)("rejects a terminal marker with a mismatched %s", async (_label, mutateMarker) => {
    const auctionId = "926";
    const marker = storedBidMarker(auctionId);
    mutateMarker(marker);
    const key = pendingBidKeyFor(auctionId);
    window.sessionStorage.setItem(key, JSON.stringify(marker));
    setupBid({ auctionOverrides: { auctionId } });

    expect(await screen.findByText("Recovery storage unavailable")).toBeInTheDocument();
    expect(screen.getByText(/invalid or incomplete bid marker/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check transaction confirmation" })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
  });

  it("fails closed and retains malformed recovery storage", async () => {
    const key = [
      "bidback:pending-wallet-bid:v1",
      "31337",
      localDeploymentFixture.contracts.auctionHouse.toLowerCase(),
      "918",
      testAddresses.primaryBidder.toLowerCase()
    ].join(":");
    window.sessionStorage.setItem(key, "{not-json");
    const { writeContract } = setupBid({ auctionOverrides: { auctionId: "918" } });

    expect(await screen.findByText("Recovery storage unavailable")).toBeInTheDocument();
    expect(screen.getByText(/contains a malformed bid marker/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Check transaction confirmation" })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(key)).toBe("{not-json");
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("fails closed instead of silently migrating a legacy v1 submitted marker", async () => {
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

    expect(await screen.findByText("Recovery storage unavailable")).toBeInTheDocument();
    expect(screen.getByText(/legacy bid marker without a complete immutable lot identity/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check transaction confirmation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
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

  it("keeps a newer in-memory submitted hash locked across a remount when persistence fails", async () => {
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
    expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check transaction confirmation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    expect(second.writeContract).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));
    await waitFor(() => expect(screen.queryByText("Recovery storage unavailable")).not.toBeInTheDocument());
    expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({
      version: 2,
      hash: txHash
    });
  });

  it("detects a silently ignored initial hash write and retains the complete submission in memory", async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      const marker = JSON.parse(value) as { kind?: string };
      if (marker.kind === "submitted-wallet-bid") return undefined;
      return originalSetItem.call(this, key, value);
    });
    let restored = false;
    try {
      const first = setupBid({
        auctionOverrides: { auctionId: "932" },
        receipt: new Error("RPC disconnected after submission")
      });
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      await screen.findByText("Confirmation not verified");
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(screen.getByText(/stored value does not match the latest recovery state/)).toBeInTheDocument();
      expect(first.writeContract).toHaveBeenCalledTimes(1);
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toEqual({
        version: 1,
        kind: "wallet-dispatch-intent"
      });
      first.view.unmount();
      setItem.mockRestore();
      restored = true;

      const second = setupBid({ auctionOverrides: { auctionId: "932" } });
      expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
      expect(second.writeContract).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));
      await waitFor(() => expect(screen.queryByText("Recovery storage unavailable")).not.toBeInTheDocument());
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({
        version: 2,
        kind: "submitted-wallet-bid",
        hash: txHash,
        lot: { auctionId: "932", tokenId: auctionDetailFixture.auction.tokenId }
      });
      expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    } finally {
      if (!restored) setItem.mockRestore();
    }
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

  it("keeps the complete confirmed marker locked when storage silently ignores cleanup", async () => {
    const originalRemoveItem = Storage.prototype.removeItem;
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (key.endsWith(":capability-probe")) return originalRemoveItem.call(this, key);
      return undefined;
    });
    let restored = false;
    try {
      setupBid({ auctionOverrides: { auctionId: "931" } });
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      expect(await screen.findByText("Bid placed with 1.2 ETH sent.")).toBeInTheDocument();
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({
        version: 2,
        kind: "submitted-wallet-bid",
        hash: txHash,
        lot: { auctionId: "931", tokenId: auctionDetailFixture.auction.tokenId },
        resolvedOutcome: {
          kind: "confirmed",
          hash: txHash,
          blockNumber: "102",
          blockHash: blockHashFor(102n)
        }
      });

      removeItem.mockRestore();
      restored = true;
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));
      await waitFor(() => expect(screen.queryByText("Recovery storage unavailable")).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Review bid" })).toBeEnabled();
      expect(window.sessionStorage).toHaveLength(0);
    } finally {
      if (!restored) removeItem.mockRestore();
    }
  });

  it("retains a newer same-hash confirmed outcome in memory when terminal persistence fails", async () => {
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalSetItem = Storage.prototype.setItem;
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (key.endsWith(":capability-probe")) return originalRemoveItem.call(this, key);
      throw new Error("remove blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (value.includes("\"resolvedOutcome\"")) throw new Error("resolved outcome write blocked");
      return originalSetItem.call(this, key, value);
    });
    let restored = false;
    try {
      const first = setupBid({ auctionOverrides: { auctionId: "922" } });
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      expect(await screen.findByText("Bid placed with 1.2 ETH sent.")).toBeInTheDocument();
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      const staleStored = JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!);
      expect(staleStored.hash).toBe(txHash);
      expect(staleStored).not.toHaveProperty("resolvedOutcome");
      first.view.unmount();
      removeItem.mockRestore();
      setItem.mockRestore();
      restored = true;

      const second = setupBid({ auctionOverrides: { auctionId: "922" } });
      expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Check transaction confirmation" }));

      expect(await screen.findByText("This bid was confirmed on-chain, but recovery storage cleanup is incomplete."))
        .toBeInTheDocument();
      expect(second.waitForTransactionReceipt).not.toHaveBeenCalled();
      expect(window.sessionStorage).toHaveLength(1);
    } finally {
      if (!restored) {
        removeItem.mockRestore();
        setItem.mockRestore();
      }
    }
  });

  it("detects a silently ignored terminal rewrite and preserves its proof until verified cleanup", async () => {
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalSetItem = Storage.prototype.setItem;
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (key.endsWith(":capability-probe")) return originalRemoveItem.call(this, key);
      throw new Error("cleanup blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (value.includes("\"resolvedOutcome\"")) return undefined;
      return originalSetItem.call(this, key, value);
    });
    let setItemRestored = false;
    let removeItemRestored = false;
    try {
      setupBid({ auctionOverrides: { auctionId: "934" } });
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      expect(await screen.findByText("Bid placed with 1.2 ETH sent.")).toBeInTheDocument();
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(screen.getByText(/stored value does not match the latest recovery state/)).toBeInTheDocument();
      const staleStored = JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!);
      expect(staleStored).toMatchObject({ hash: txHash, lot: { auctionId: "934" } });
      expect(staleStored).not.toHaveProperty("resolvedOutcome");
      expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();

      setItem.mockRestore();
      setItemRestored = true;
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));
      await waitFor(() => expect(
        JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!).resolvedOutcome
      ).toMatchObject({
        kind: "confirmed",
        hash: txHash,
        blockNumber: "102",
        blockHash: blockHashFor(102n)
      }));
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();

      removeItem.mockRestore();
      removeItemRestored = true;
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));
      await waitFor(() => expect(screen.queryByText("Recovery storage unavailable")).not.toBeInTheDocument());
      expect(window.sessionStorage).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Review bid" })).toBeEnabled();
    } finally {
      if (!setItemRestored) setItem.mockRestore();
      if (!removeItemRestored) removeItem.mockRestore();
    }
  });

  it("retains a newer same-hash resolved replacement in memory when persistence fails", async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (value.includes("\"resolvedReplacement\"")) throw new Error("replacement write blocked");
      return originalSetItem.call(this, key, value);
    });
    let restored = false;
    try {
      const neverRefresh = vi.fn(() => new Promise<void>(() => undefined));
      const first = setupBid({ auctionOverrides: { auctionId: "923" }, onBidComplete: neverRefresh });
      queueReplacement(first.waitForTransactionReceipt, "replaced");
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));

      expect(await screen.findByText("The original reviewed bid was replaced and was not confirmed."))
        .toBeInTheDocument();
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      const staleStored = JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!);
      expect(staleStored.hash).toBe(txHash);
      expect(staleStored).not.toHaveProperty("resolvedReplacement");
      first.view.unmount();
      setItem.mockRestore();
      restored = true;

      const second = setupBid({ auctionOverrides: { auctionId: "923" } });
      expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Check transaction confirmation" }));

      expect(await screen.findByText("The original reviewed bid was replaced and was not confirmed."))
        .toBeInTheDocument();
      expect(second.waitForTransactionReceipt).not.toHaveBeenCalled();
      expect(window.sessionStorage).toHaveLength(1);
    } finally {
      if (!restored) setItem.mockRestore();
    }
  });

  it("keeps delayed confirmed-outcome cleanup locked when its terminal block reorganizes", async () => {
    const originalRemoveItem = Storage.prototype.removeItem;
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (key.endsWith(":capability-probe")) return originalRemoveItem.call(this, key);
      throw new Error("remove blocked");
    });
    let restored = false;
    try {
      const { getBlock } = setupBid({ auctionOverrides: { auctionId: "929" } });
      const review = await screen.findByRole("button", { name: "Review bid" });
      await waitFor(() => expect(review).toBeEnabled());
      fireEvent.click(review);
      fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
      expect(await screen.findByText("Bid placed with 1.2 ETH sent.")).toBeInTheDocument();
      expect(screen.getByText("Recovery storage unavailable")).toBeInTheDocument();
      expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({
        hash: txHash,
        resolvedOutcome: {
          hash: txHash,
          blockNumber: "102",
          blockHash: blockHashFor(102n)
        }
      });

      removeItem.mockRestore();
      restored = true;
      getBlock.mockImplementation(async (request: { blockNumber?: bigint } = {}) => {
        const number = request.blockNumber ?? 200n;
        return {
          timestamp: 1n,
          number,
          hash: blockHashFor(number, request.blockNumber === 102n ? 1n : 0n)
        };
      });
      fireEvent.click(screen.getByRole("button", { name: "Retry recovery storage access" }));

      expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
      expect(screen.getAllByText(/stored terminal transaction block is no longer canonical/).length)
        .toBeGreaterThan(0);
      expect(window.sessionStorage).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
    } finally {
      if (!restored) removeItem.mockRestore();
    }
  });

  it("keeps delayed replacement refresh locked when its terminal block reorganizes", async () => {
    const onBidComplete = vi.fn()
      .mockRejectedValueOnce(new Error("auction refresh unavailable"))
      .mockResolvedValue(undefined);
    const { getBlock, waitForTransactionReceipt } = setupBid({
      auctionOverrides: { auctionId: "930" },
      onBidComplete
    });
    queueReplacement(waitForTransactionReceipt, "replaced");
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    expect(await screen.findByText("The original reviewed bid was replaced and was not confirmed."))
      .toBeInTheDocument();
    expect(window.sessionStorage).toHaveLength(1);
    expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0)!)!)).toMatchObject({
      hash: txHash,
      resolvedReplacement: {
        hash: replacementHash,
        originalHash: txHash,
        blockNumber: "102",
        blockHash: blockHashFor(102n)
      }
    });

    getBlock.mockImplementation(async (request: { blockNumber?: bigint } = {}) => {
      const number = request.blockNumber ?? 200n;
      return {
        timestamp: 1n,
        number,
        hash: blockHashFor(number, request.blockNumber === 102n ? 1n : 0n)
      };
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh resolved transaction state" }));

    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText("The original reviewed bid was replaced and was not confirmed.")).not.toBeInTheDocument();
    expect(screen.getAllByText(/stored terminal transaction block is no longer canonical/).length)
      .toBeGreaterThan(0);
    expect(window.sessionStorage).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
  });

  it("discards preflight results after the wallet identity changes", async () => {
    const { view, getBlock, writeContract } = setupBid();
    let resolveBlock!: (block: { timestamp: bigint; number: bigint; hash: `0x${string}` }) => void;
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
    await act(async () => resolveBlock({ timestamp: 1n, number: 102n, hash: blockHashFor(102n) }));
    expect(writeContract).not.toHaveBeenCalled();
    expect(screen.queryByText("Waiting for wallet signature")).not.toBeInTheDocument();
  });

  it("does not let an old operation clear the busy state of a new wallet identity", async () => {
    const { view, renderedAuction, getBlock, writeContract } = setupBid();
    let resolveOldBlock!: (block: { timestamp: bigint; number: bigint; hash: `0x${string}` }) => void;
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

    await act(async () => resolveOldBlock({ timestamp: 1n, number: 102n, hash: blockHashFor(102n) }));
    expect(screen.getByRole("button", { name: "Working..." })).toBeDisabled();
    await act(async () => resolveNewWrite(txHash));
    await screen.findByText("Transaction confirmed");
  });

  it("invalidates an in-flight receipt when the displayed immutable lot changes under the same recovery key", async () => {
    const { view, renderedAuction, waitForTransactionReceipt, onBidComplete } = setupBid({
      auctionOverrides: { auctionId: "924" }
    });
    let resolveReceipt!: (receipt: MockReceipt) => void;
    waitForTransactionReceipt.mockImplementationOnce(() => new Promise((resolve) => {
      resolveReceipt = resolve;
    }));
    const review = await screen.findByRole("button", { name: "Review bid" });
    await waitFor(() => expect(review).toBeEnabled());
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Continue in wallet" }));
    await screen.findByText("Bid transaction submitted. Waiting for confirmation.");

    view.rerender(<WalletBidPanel auction={{ ...renderedAuction, tokenId: "999" }}
      expectedChainId={auctionDetailFixture.chainId} expectedAuctionHouse={auctionDetailFixture.auctionHouse}
      onBidComplete={onBidComplete} />);
    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    await act(async () => resolveReceipt(bidPlacedReceipt({ auctionId: 924n })));

    expect(screen.queryByText("Transaction confirmed")).not.toBeInTheDocument();
    expect(onBidComplete).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Review bid" })).toBeDisabled();
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
