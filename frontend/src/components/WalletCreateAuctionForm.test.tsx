import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeEventTopics, encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { useAccount } from "wagmi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateAuctionFields } from "@/components/CreateAuctionFields";
import { erc721Abi } from "@/contracts/erc721Abi";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { WalletCreateAuctionForm } from "@/components/WalletCreateAuctionForm";
import { localDeploymentFixture, testAddresses } from "@/test/fixtures";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(), useConfig: vi.fn(() => ({}))
}));

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

const seller = testAddresses.seller;
const otherOwner = testAddresses.secondBidder;
const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

const approvalHash = `0x${"4".repeat(64)}` as Hex;
const createHash = `0x${"1".repeat(64)}` as Hex;
const blockHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function creationLog({ auctionId = 1n, sellerAddress = seller, nft = testAddresses.localNft,
  tokenId = 2n, startPrice = 1_000_000_000_000_000_000n, duration = 7200n,
  emitter = testAddresses.auctionHouse }: {
  auctionId?: bigint; sellerAddress?: `0x${string}`; nft?: `0x${string}`;
  tokenId?: bigint; startPrice?: bigint; duration?: bigint; emitter?: `0x${string}`;
} = {}) {
  return {
    transactionHash: createHash, blockHash, blockNumber: 42n, transactionIndex: 0, logIndex: 0, removed: false,
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
  connector: typeof connectorB;
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
    isConnected: true, connector: connectorB
  };

  return account as unknown as ReturnType<typeof useAccount>;
}

const providerA = { request: vi.fn() };
const providerB = { request: vi.fn(async ({ method }: { method: string }) =>
  method === "eth_accounts" ? [vi.mocked(useAccount)().address] : "0x7a69") };
const connectorB = { uid: "wallet-b", name: "Wallet B", getProvider: vi.fn(async () => providerB) };

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

  const transaction = { hash: createHash, from: seller as Address, to: testAddresses.auctionHouse as Address,
    input: "0x" as Hex, value: 0n, nonce: 5, chainId: 31337, blockHash: blockHash as Hex, blockNumber: 42n, transactionIndex: 0 };
  const receipt = { status: "success", logs: [creationLog()], blockHash: blockHash as Hex,
    blockNumber: 42n, transactionIndex: 0, transactionHash: createHash, from: seller as Address, to: testAddresses.auctionHouse as Address };
  const waitForTransactionReceipt = vi.fn(async (_options?: unknown) => receipt);
  const getBlock = vi.fn(async () => ({ timestamp: 1000n, hash: blockHash as Hex, number: 42n }));
  const getTransaction = vi.fn(async () => transaction);
  const getChainId = vi.fn(async () => 31337);
  const writeContract = vi.fn(async (request: unknown) => {
    const { functionName } = request as { functionName?: string };

    const submitted = request as { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };
    const hash = functionName === "approve" ? approvalHash : createHash;
    Object.assign(transaction, { hash, to: submitted.address, input: encodeFunctionData(submitted) });
    Object.assign(receipt, { transactionHash: hash, to: submitted.address });
    if (functionName === "approve") {
      receipt.logs = [{ ...creationLog(), address: submitted.address, transactionHash: hash,
        topics: encodeEventTopics({ abi: erc721Abi, eventName: "Approval", args: {
          owner: seller, approved: testAddresses.nftVault, tokenId: (submitted.args as readonly [Address, bigint])[1] } }), data: "0x" }];
      currentApprovedAddress = testAddresses.nftVault;
      currentApprovedForAll = false;
    }

    if (functionName === "createAuction") {
      const [nft, tokenId, startPrice, duration] = (request as { args: [`0x${string}`, bigint, bigint, bigint] }).args;
      receipt.logs = [creationLog({ nft, tokenId, startPrice, duration })];
    }

    return hash;
  });

  vi.mocked(createPublicClient).mockReturnValue({
    readContract,
    getBlock,
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

  providerA.request.mockReset();
  providerB.request.mockReset();
  providerB.request.mockImplementation(async ({ method }) => method === "eth_accounts" ? [vi.mocked(useAccount)().address] : "0x7a69");
  Object.defineProperty(window, "ethereum", { configurable: true, value: providerA });

  const view = render(<WalletCreateAuctionForm />);

  return {
    readContract,
    writeContract,
    waitForTransactionReceipt, getTransaction, getChainId, getBlock, transaction, receipt, view
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
    expect(providerB.request.mock.calls.filter(([args]) => args.method === "eth_sendTransaction")).toHaveLength(2);
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
    const { readContract, waitForTransactionReceipt, receipt } = setupWalletCreateForm({ approvedAddress: testAddresses.nftVault });
    waitForTransactionReceipt.mockImplementation(async () => ({ ...receipt, logs: [creationLog({ auctionId: 9n })] }));
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
  ])("keeps creation unverified when the event is $label", async ({ logs }) => {
    const { waitForTransactionReceipt, writeContract, receipt } = setupWalletCreateForm({ approvedAddress: testAddresses.nftVault });
    waitForTransactionReceipt.mockImplementation(async () => ({ ...receipt, logs }));
    await waitForContext();
    fireEvent.click(screen.getByRole("button", { name: "Review auction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create auction" }));
    expect(await screen.findByText("Confirmation not verified")).toBeInTheDocument();
    expect(screen.queryByText("Transaction confirmed")).not.toBeInTheDocument();
    expect(screen.getByText(/Do not submit again while the outcome is unknown/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open auction detail" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review auction" })).toBeDisabled();
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

});

// Every component scenario uses B, while the legacy global points at unrelated A.
afterEach(() => {
  expect(providerA.request).not.toHaveBeenCalled();
});

async function submitCreateAction(action: "approve" | "create") {
  await waitForContext();
  fireEvent.click(screen.getByRole("button", { name: "Review auction" }));
  const button = await screen.findByRole("button", { name: action === "approve" ? "Approve NFT custody" : "Create auction" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

function replaceCreateAction(f: ReturnType<typeof setupWalletCreateForm>, reason: string, change: Partial<typeof f.transaction>) {
  f.waitForTransactionReceipt.mockImplementation(async (options) => {
    const original = { ...f.transaction };
    const hash = `0x${"7".repeat(64)}` as Hex;
    Object.assign(f.transaction, { hash }, change);
    Object.assign(f.receipt, { transactionHash: hash, to: f.transaction.to, from: f.transaction.from });
    f.receipt.logs = f.receipt.logs.map((log) => ({ ...log, transactionHash: hash }));
    (options as { onReplaced: (value: unknown) => void }).onReplaced({ reason,
      transaction: { ...f.transaction }, replacedTransaction: original, transactionReceipt: { ...f.receipt } });
    return f.receipt;
  });
}

const listingActions = ["approve", "create"] as const;
describe.each(listingActions)("%s wallet confirmation", (action) => {
  it.each(["rejected", "reverted", "cancelled", "fake repriced", "incompatible target", "incompatible function", "wrong arguments", "wrong sender", "wrong hash", "missing event", "wrong emitter"])("does not advance or announce success for %s", async (scenario) => {
    const f = setupWalletCreateForm({ approvedAddress: action === "create" ? testAddresses.nftVault : zeroAddress });
    if (scenario === "rejected") f.writeContract.mockRejectedValue({ code: 4001 });
    if (scenario === "reverted") f.waitForTransactionReceipt.mockImplementation(async () => ({ ...f.receipt, status: "reverted" }));
    if (scenario === "cancelled" || scenario === "fake repriced") replaceCreateAction(f,
      scenario === "cancelled" ? "cancelled" : "repriced", { to: seller, input: "0x" });
    if (scenario === "incompatible target") replaceCreateAction(f, "repriced", { to: otherOwner });
    if (scenario === "incompatible function") replaceCreateAction(f, "repriced", { input: "0x12345678" });
    if (scenario === "wrong arguments") replaceCreateAction(f, "repriced", { input: action === "approve"
      ? encodeFunctionData({ abi: erc721Abi, functionName: "approve", args: [otherOwner, 99n] })
      : encodeFunctionData({ abi: auctionHouseAbi, functionName: "createAuction", args: [testAddresses.localNft, 99n, 1n, 7200n] }) });
    if (["wrong sender", "wrong hash", "missing event", "wrong emitter"].includes(scenario)) {
      f.waitForTransactionReceipt.mockImplementation(async () => {
        if (scenario === "wrong sender") { f.transaction.from = otherOwner; f.receipt.from = otherOwner; }
        if (scenario === "wrong hash") f.receipt.transactionHash = `0x${"7".repeat(64)}`;
        if (scenario === "missing event") f.receipt.logs = [];
        if (scenario === "wrong emitter") f.receipt.logs[0].address = otherOwner;
        return f.receipt;
      });
    }
    await submitCreateAction(action);
    const unknown = ["wrong sender", "wrong hash", "missing event", "wrong emitter"].includes(scenario);
    await screen.findByText(scenario === "rejected" ? "Transaction rejected" : unknown ? "Confirmation not verified" : "Transaction failed");
    expect(screen.queryByText("NFT custody approved.")).not.toBeInTheDocument();
    expect(screen.queryByText("Auction #1 created.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open auction detail" })).not.toBeInTheDocument();
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    if (scenario === "rejected") expect(screen.getByTestId("wallet-transaction-status").querySelector('[title]')).toBeNull();
    if (action === "approve") expect(screen.queryByRole("button", { name: "Create auction" })).not.toBeInTheDocument();
    if (unknown) {
      expect(screen.getByRole("button", { name: "Review auction" })).toBeDisabled();
      expect(screen.getByLabelText("NFT contract")).toBeDisabled();
    } else expect(screen.getByRole("button", { name: "Review auction" })).toBeEnabled();
  });
  it("confirms compatible repricing on the mined hash", async () => {
    const f = setupWalletCreateForm({ approvedAddress: action === "create" ? testAddresses.nftVault : zeroAddress });
    replaceCreateAction(f, "repriced", {});
    await submitCreateAction(action);
    await screen.findByText(action === "approve" ? "NFT custody approved." : "Auction #1 created.");
    const status = screen.getByTestId("wallet-transaction-status");
    expect(status.querySelector('[title]')).toHaveAttribute("title", `0x${"7".repeat(64)}`);
    expect(status.textContent).toContain(action === "approve" ? approvalHash : createHash);
    expect(f.getTransaction).toHaveBeenCalledWith({ hash: `0x${"7".repeat(64)}` });
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
  it.each(["wait", "transaction", "chain"])("recovers after %s RPC unavailability using only explicit verification", async (rpc) => {
    const f = setupWalletCreateForm({ approvedAddress: action === "create" ? testAddresses.nftVault : zeroAddress });
    if (rpc === "wait") f.waitForTransactionReceipt.mockRejectedValueOnce(new Error("RPC unavailable"));
    if (rpc === "transaction") f.getTransaction.mockRejectedValueOnce(new Error("RPC unavailable"));
    if (rpc === "chain") f.getChainId.mockRejectedValueOnce(new Error("RPC unavailable"));
    await submitCreateAction(action);
    await screen.findByText("Confirmation not verified");
    expect(f.writeContract).toHaveBeenCalledTimes(1);
    expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(rpc === "chain" ? 0 : 1);
    fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
    await screen.findByText(action === "approve" ? "NFT custody approved." : "Auction #1 created.");
    expect(f.waitForTransactionReceipt).toHaveBeenLastCalledWith(expect.objectContaining({ timeout: 15000, retryCount: 1 }));
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
  it.each(["input", "value", "to"])("keeps missing mined %s unknown and recovers without resubmission", async (field) => {
    const f = setupWalletCreateForm({ approvedAddress: action === "create" ? testAddresses.nftVault : zeroAddress });
    f.getTransaction.mockImplementationOnce(async () => {
      return { ...f.transaction, [field]: undefined };
    });
    await submitCreateAction(action);
    await screen.findByText("Confirmation not verified");
    fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
    await screen.findByText(action === "approve" ? "NFT custody approved." : "Auction #1 created.");
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  });
});

it.each(["owner", "operator", "token"])("requires approval event %s to match the exact signed request", async (field) => {
  const f = setupWalletCreateForm();
  f.waitForTransactionReceipt.mockImplementation(async () => ({ ...f.receipt,
    logs: [{ ...f.receipt.logs[0], topics: encodeEventTopics({ abi: erc721Abi, eventName: "Approval",
      args: { owner: field === "owner" ? otherOwner : seller,
        approved: field === "operator" ? otherOwner : testAddresses.nftVault, tokenId: field === "token" ? 99n : 2n } }) }] }));
  await submitCreateAction("approve");
  await screen.findByText("Confirmation not verified");
  expect(screen.queryByRole("button", { name: "Create auction" })).not.toBeInTheDocument();
  const readCount = f.readContract.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Review auction" }));
  expect(f.readContract).toHaveBeenCalledTimes(readCount);
  // The mock's approval state is favorable after submit; it cannot substitute for missing transaction proof.
  fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
  await waitFor(() => expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Confirmation not verified")).toBeInTheDocument();
  expect(f.writeContract).toHaveBeenCalledTimes(1);
});

it("retains a proved approval and its hash after failed display refresh, then unlocks creation through a successful read-only review", async () => {
  const f = setupWalletCreateForm();
  f.waitForTransactionReceipt.mockImplementationOnce(async () => {
    f.readContract.mockRejectedValueOnce(new Error("Display unavailable")); return f.receipt;
  });
  await submitCreateAction("approve");
  await screen.findByText("NFT custody approved, but displayed approval data could not be fully refreshed.");
  expect(screen.getByText("Transaction confirmed")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve NFT custody" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Review auction" }));
  await screen.findByText("NFT custody approved.");
  expect(screen.getByRole("button", { name: "Create auction" })).toBeEnabled();
  expect(screen.getByText("Transaction confirmed")).toBeInTheDocument();
  expect(screen.getByTestId("wallet-transaction-status").querySelector('[title]')).toHaveAttribute("title", approvalHash);
  expect(f.writeContract).toHaveBeenCalledTimes(1);
});

it.each(["unavailable", "hash", "number", "timestamp"])("does not prove creation with an invalid mined block %s, and can recover from RPC unavailability", async (field) => {
  const f = setupWalletCreateForm({ approvedAddress: testAddresses.nftVault });
  if (field === "unavailable") f.getBlock.mockRejectedValueOnce(new Error("Block unavailable"));
  if (field === "hash") f.getBlock.mockResolvedValue({ hash: `0x${"b".repeat(64)}`, number: 42n, timestamp: 1000n });
  if (field === "number") f.getBlock.mockResolvedValue({ hash: blockHash, number: 43n, timestamp: 1000n });
  if (field === "timestamp") f.getBlock.mockResolvedValue({ hash: blockHash, number: 42n, timestamp: 999n });
  await submitCreateAction("create");
  await screen.findByText("Confirmation not verified");
  expect(screen.queryByRole("link", { name: "Open auction detail" })).not.toBeInTheDocument();
  expect(f.writeContract).toHaveBeenCalledTimes(1);
  if (field === "unavailable") {
    fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
    await screen.findByText("Auction #1 created.");
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  }
});

it("rejects a zero auction ID", async () => {
  const f = setupWalletCreateForm({ approvedAddress: testAddresses.nftVault });
  f.waitForTransactionReceipt.mockImplementation(async () => ({ ...f.receipt, logs: [creationLog({ auctionId: 0n })] }));
  await submitCreateAction("create");
  await screen.findByText("Confirmation not verified");
  expect(screen.queryByRole("link", { name: "Open auction detail" })).not.toBeInTheDocument();
});

it("keeps the exact created ID while ignoring a concurrent transaction's event in the same block", async () => {
  const f = setupWalletCreateForm({ approvedAddress: testAddresses.nftVault });
  f.waitForTransactionReceipt.mockImplementation(async () => ({ ...f.receipt,
    logs: [creationLog({ auctionId: 9n }), { ...creationLog({ auctionId: 10n }), transactionHash: approvalHash, transactionIndex: 1 }] }));
  await submitCreateAction("create");
  await screen.findByText("Auction #9 created.");
  expect(screen.getByRole("link", { name: "Open auction detail" })).toHaveAttribute("href", "/auctions/9");
  expect(f.readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: "nextAuctionId" }));
});

it.each(listingActions.flatMap((action) => ["account", "chain", "connector"].map((changed) => ({ action, changed }))))(
  "keeps $action submission across a changed $changed without attributing it to the new context", async ({ action, changed }) => {
    const f = setupWalletCreateForm({ approvedAddress: action === "create" ? testAddresses.nftVault : zeroAddress });
    const originalAccount = mockConnectedAccount();
    let release: (receipt: typeof f.receipt) => void = () => {};
    f.waitForTransactionReceipt.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await submitCreateAction(action);
    await waitFor(() => expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(1));
    const nextAccount = changed === "account" ? { ...originalAccount, address: otherOwner }
      : changed === "chain" ? { ...originalAccount, chainId: 1 }
        : { ...originalAccount, connector: { ...connectorB, uid: "other-connector" } };
    vi.mocked(useAccount).mockReturnValue(nextAccount as unknown as ReturnType<typeof useAccount>);
    f.view.rerender(<WalletCreateAuctionForm />);
    release(f.receipt);
    await screen.findByText("Confirmation not verified");
    expect(screen.getByLabelText("Create auction transaction sequence").querySelector('[aria-current="step"]')).toHaveTextContent(
      action === "approve" ? "Approve NFT custody if required" : "Create auction");
    expect(screen.queryByText("NFT custody approved.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open auction detail" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify transaction" })).toBeDisabled());
    vi.mocked(useAccount).mockReturnValue(originalAccount);
    f.view.rerender(<WalletCreateAuctionForm />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify transaction" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
    await screen.findByText(action === "approve" ? "NFT custody approved." : "Auction #1 created.");
    expect(f.writeContract).toHaveBeenCalledTimes(1);
  }
);

it.each(listingActions)("restores submitted form details for an in-flight %s without rebuilding its intent or requesting another signature", async (action) => {
  const f = setupWalletCreateForm({ approvedAddress: action === "create" ? testAddresses.nftVault : zeroAddress });
  let release: (receipt: typeof f.receipt) => void = () => {};
  f.waitForTransactionReceipt.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  await submitCreateAction(action);
  await waitFor(() => expect(f.waitForTransactionReceipt).toHaveBeenCalledTimes(1));
  // A programmatic/in-flight edit exercises the guard even though normal UI inputs are disabled while busy.
  fireEvent.change(screen.getByLabelText("Token ID"), { target: { value: "99" } });
  if (action === "create") fireEvent.change(screen.getByLabelText("Start price in ETH"), { target: { value: "2" } });
  expect(screen.getByLabelText("Token ID")).toHaveValue("99");
  release(f.receipt);
  await screen.findByText("Confirmation not verified");
  expect(screen.getByRole("button", { name: "Verify transaction" })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Restore submitted details" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Restore submitted details" }));
  expect(screen.getByLabelText("Token ID")).toHaveValue("2");
  if (action === "create") expect(screen.getByLabelText("Start price in ETH")).toHaveValue("1");
  await waitFor(() => expect(screen.getByRole("button", { name: "Verify transaction" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Verify transaction" }));
  await screen.findByText(action === "approve" ? "NFT custody approved." : "Auction #1 created.");
  expect(f.writeContract).toHaveBeenCalledTimes(1);
  expect((f.writeContract.mock.calls[0][0] as { args: readonly unknown[] }).args).toEqual(action === "approve"
    ? [testAddresses.nftVault, 2n] : [testAddresses.localNft, 2n, 1000000000000000000n, 7200n]);
});
