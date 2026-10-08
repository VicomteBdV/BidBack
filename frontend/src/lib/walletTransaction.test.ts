import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, type Abi, type Address, type Hex, type TransactionReceipt } from "viem";
import { erc721Abi } from "@/contracts/erc721Abi";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { testAddresses } from "@/test/fixtures";
import { confirmWalletTransaction, matchingWalletActionEvents, walletConfirmationState, walletTransactionSubmission,
  type WalletConfirmationClient } from "@/lib/walletTransaction";

import { describe, expect, it, vi } from "vitest";
import {
  buildExplorerTxUrl,
  failedTransactionState,
  isUserRejectedTransaction,
  receiptWasSuccessful,
  revertedTransactionState,
  shortenTxHash,
  unknownConfirmationState,
  walletTransactionErrorMessage
} from "@/lib/walletTransaction";

const txHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

describe("walletTransaction", () => {
  it("builds explorer transaction URLs only when an explorer is configured", () => {
    expect(buildExplorerTxUrl(txHash, "https://sepolia.basescan.org/")).toBe(
      `https://sepolia.basescan.org/tx/${txHash}`
    );

    expect(buildExplorerTxUrl(txHash, "")).toBeNull();
    expect(buildExplorerTxUrl(null, "https://sepolia.basescan.org")).toBeNull();
  });

  it("shortens transaction hashes for compact display", () => {
    expect(shortenTxHash(txHash)).toBe("0x11111111...11111111");
  });

  it("classifies user rejected transactions", () => {
    const rejected = { code: 4001, message: "User rejected the request." };

    expect(isUserRejectedTransaction(rejected)).toBe(true);
    expect(walletTransactionErrorMessage(rejected)).toBe("Transaction rejected in wallet.");
    expect(failedTransactionState(rejected).phase).toBe("rejected");
  });

  it("keeps common wallet errors readable", () => {
    expect(walletTransactionErrorMessage(new Error("insufficient funds for gas"))).toBe(
      "Insufficient funds for transaction value or gas."
    );

    expect(failedTransactionState(new Error("execution reverted"), "Fallback").phase).toBe("failed");
  });

  it("distinguishes successful, reverted, and unverifiable submitted transactions", () => {
    expect(receiptWasSuccessful({ status: "success" })).toBe(true);
    expect(receiptWasSuccessful({ status: "reverted" })).toBe(false);
    expect(revertedTransactionState(txHash)).toMatchObject({ phase: "failed", txHash });

    const unknown = unknownConfirmationState(txHash, new Error("RPC timeout"));
    expect(unknown).toMatchObject({
      phase: "confirmation-unknown",
      txHash,
      technicalDetail: "RPC timeout"
    });
    expect(unknown.message).not.toMatch(/revert|failed/i);
  });
});

// These fixtures retain RPC transaction/receipt/log identities, rather than status-only mocks.

const replacementHash = `0x${"2".repeat(64)}` as Hex;
const minedBlockHash = `0x${"a".repeat(64)}` as Hex;
const zero = `0x${"0".repeat(40)}` as Address;
const account = testAddresses.primaryBidder;
const cases: { name: string; abi: Abi; to: Address; functionName: string; eventName: string;
  args: readonly (bigint | Address)[]; expected: Record<string, bigint | string>; topics: Record<string, bigint | string>;
  data: Hex; positiveAmount?: boolean; duration?: bigint }[] = [
  { name: "finalize", abi: auctionHouseAbi, to: testAddresses.auctionHouse, functionName: "finalizeAuction", args: [1n],
    eventName: "AuctionFinalized", expected: { auctionId: 1n }, topics: { auctionId: 1n, winner: zero },
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [0n, 0n, 0n]) },
  { name: "NFT claim", abi: auctionHouseAbi, to: testAddresses.auctionHouse, functionName: "claimNft", args: [1n],
    eventName: "NFTClaimed", expected: { auctionId: 1n, claimant: account }, topics: { auctionId: 1n, claimant: account }, data: "0x" },
  { name: "refund", abi: escrowVaultAbi, to: testAddresses.escrowVault, functionName: "claimRefund", args: [1n],
    eventName: "RefundClaimed", expected: { auctionId: 1n, bidder: account }, topics: { auctionId: 1n, bidder: account },
    data: encodeAbiParameters([{ type: "uint256" }], [1n]), positiveAmount: true },
  { name: "redistribution", abi: distributionVaultAbi, to: testAddresses.distributionVault, functionName: "claim", args: [1n],
    eventName: "DistributionClaimed", expected: { auctionId: 1n, claimant: account }, topics: { auctionId: 1n, claimant: account },
    data: encodeAbiParameters([{ type: "uint256" }], [1n]), positiveAmount: true },
  { name: "seller withdrawal", abi: escrowVaultAbi, to: testAddresses.escrowVault, functionName: "withdrawSellerProceeds", args: [],
    eventName: "SellerProceedsWithdrawn", expected: { seller: account }, topics: { seller: account },
    data: encodeAbiParameters([{ type: "uint256" }], [3n]), positiveAmount: true },
  { name: "fee withdrawal", abi: escrowVaultAbi, to: testAddresses.escrowVault, functionName: "withdrawProtocolFees", args: [],
    eventName: "ProtocolFeesWithdrawn", expected: { recipient: account }, topics: { recipient: account },
    data: encodeAbiParameters([{ type: "uint256" }], [4n]), positiveAmount: true },
  { name: "NFT approval", abi: erc721Abi, to: testAddresses.localNft, functionName: "approve", args: [testAddresses.nftVault, 2n],
    eventName: "Approval", expected: { owner: account, approved: testAddresses.nftVault, tokenId: 2n },
    topics: { owner: account, approved: testAddresses.nftVault, tokenId: 2n }, data: "0x" },
  { name: "auction creation", abi: auctionHouseAbi, to: testAddresses.auctionHouse, functionName: "createAuction",
    args: [testAddresses.localNft, 2n, 100n, 7200n], eventName: "AuctionCreated",
    expected: { seller: account, nft: testAddresses.localNft, tokenId: 2n, startPrice: 100n },
    topics: { auctionId: 9n, seller: account, nft: testAddresses.localNft }, duration: 7200n,
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }], [2n, 100n, 8200n]) }
];

function confirmationFixture(action: typeof cases[number]) {
  const intent = { chainId: 31337, account, to: action.to, value: 0n,
    data: encodeFunctionData({ abi: action.abi, functionName: action.functionName, args: action.args }) };
  const transaction = { hash: txHash, from: account as Address, to: action.to, input: intent.data, value: 0n,
    nonce: 5, chainId: 31337, blockHash: minedBlockHash, blockNumber: 42n, transactionIndex: 0 };
  const log = { address: action.to, data: action.data,
    topics: encodeEventTopics({ abi: action.abi, eventName: action.eventName, args: action.topics }),
    transactionHash: txHash, blockHash: minedBlockHash, blockNumber: 42n, transactionIndex: 0, logIndex: 0, removed: false };
  const receipt = { status: "success", from: account as Address, to: action.to, transactionHash: txHash,
    blockHash: minedBlockHash, blockNumber: 42n, transactionIndex: 0, logs: [log] };
  const mocks = { getChainId: vi.fn(async () => 31337), getTransaction: vi.fn(async () => transaction),
    getBlock: vi.fn(async () => ({ timestamp: 1000n, hash: minedBlockHash, number: 42n })), waitForTransactionReceipt: vi.fn(async (_options?: unknown) => receipt) };
  const submission = walletTransactionSubmission(txHash, intent, async (r, client) => {
    const matches = matchingWalletActionEvents(r, { abi: action.abi, eventName: action.eventName, address: action.to,
      expected: action.expected, positiveAmount: action.positiveAmount });
    if (matches.length !== 1) return null;
    if (action.duration !== undefined) {
      const block = await client.getBlock({ blockHash: r.blockHash });
      if (block.hash !== r.blockHash || block.number !== r.blockNumber || typeof block.timestamp !== "bigint" ||
        matches[0].initialEndTime !== block.timestamp + action.duration || typeof matches[0].auctionId !== "bigint" || matches[0].auctionId <= 0n) return null;
      return { auctionId: matches[0].auctionId.toString() };
    }
    return {};
  });
  function replace(reason = "repriced", changes: Partial<typeof transaction> = {}) {
    const original = { ...transaction };
    Object.assign(transaction, { hash: replacementHash }, changes);
    Object.assign(receipt, { transactionHash: replacementHash, from: transaction.from, to: transaction.to });
    Object.assign(log, { transactionHash: replacementHash });
    mocks.waitForTransactionReceipt.mockImplementation(async (options) => {
      (options as { onReplaced: (replacement: unknown) => void }).onReplaced({ reason,
        replacedTransaction: original, transaction: { ...transaction }, transactionReceipt: { ...receipt } });
      return receipt;
    });
  }
  return { intent, transaction, receipt, log, mocks, submission, replace,
    confirm: (recheck = false) => confirmWalletTransaction(mocks as unknown as WalletConfirmationClient, submission, { recheck }) };
}

describe.each(cases)("verified $name confirmation", (action) => {
  it("confirms exact mined action (including zero-bid finalization and aggregate withdrawal amounts)", async () => {
    const f = confirmationFixture(action);
    expect(await f.confirm()).toMatchObject({ outcome: "confirmed", submission: { effectiveHash: txHash } });
    expect(Object.isFrozen(f.submission.intent)).toBe(true);
    f.intent.to = testAddresses.secondBidder;
    expect(f.submission.intent.to).toBe(action.to);
  });
  it("reports the original compatible transaction reverting", async () => {
    const f = confirmationFixture(action);
    f.receipt.status = "reverted";
    expect(await f.confirm()).toMatchObject({ outcome: "reverted" });
  });
  it.each(["cancelled", "repriced", "replaced"])("rejects mined cancellation even when reason is %s", async (reason) => {
    const f = confirmationFixture(action);
    f.replace(reason, { to: account, input: "0x", value: 0n });
    const result = await f.confirm();
    expect(result.outcome).toBe("cancelled");
    expect(walletConfirmationState(result)).toMatchObject({ phase: "failed", txHash: replacementHash });
    expect(walletConfirmationState(result).technicalDetail).toContain(txHash);
  });
  it("accepts compatible repricing using the effective hash and retains the original hash", async () => {
    const f = confirmationFixture(action);
    f.replace();
    expect(await f.confirm()).toMatchObject({ outcome: "confirmed",
      submission: { originalHash: txHash, effectiveHash: replacementHash, replacementNonce: 5 } });
    expect(f.mocks.getTransaction).toHaveBeenCalledWith({ hash: replacementHash });
  });
  it.each(["target", "calldata", "value"])("rejects a replacement with incompatible %s", async (field) => {
    const f = confirmationFixture(action);
    f.replace("repriced", field === "target" ? { to: testAddresses.secondBidder }
      : field === "calldata" ? { input: "0x12345678" } : { value: 1n });
    expect((await f.confirm()).outcome).toBe("incompatible");
  });
  it.each(["sender", "nonce", "originalHash", "originalContent", "callbackReceipt"])("never trusts contradictory replacement provenance: %s", async (field) => {
    const f = confirmationFixture(action);
    const original = { ...f.transaction };
    f.replace();
    f.mocks.waitForTransactionReceipt.mockImplementation(async (options) => {
      const replacement = { ...f.transaction };
      if (field === "sender") replacement.from = testAddresses.secondBidder;
      if (field === "nonce") replacement.nonce += 1;
      if (field === "originalHash") original.hash = replacementHash as typeof txHash;
      if (field === "originalContent") original.input = "0x12345678";
      (options as { onReplaced: (value: unknown) => void }).onReplaced({ reason: "repriced",
        replacedTransaction: original, transaction: replacement,
        transactionReceipt: { ...f.receipt, transactionHash: field === "callbackReceipt" ? txHash : replacementHash } });
      return f.receipt;
    });
    expect((await f.confirm()).outcome).toBe("unknown");
  });
  it.each(["receiptHash", "transactionHash", "receiptFrom", "receiptTo", "sender", "chain", "blockHash", "blockNumber", "index"])("does not confirm inconsistent mined %s", async (field) => {
    const f = confirmationFixture(action);
    if (field === "receiptHash") f.receipt.transactionHash = replacementHash as typeof txHash;
    if (field === "transactionHash") f.transaction.hash = replacementHash as typeof txHash;
    if (field === "receiptFrom") f.receipt.from = testAddresses.secondBidder;
    if (field === "receiptTo") f.receipt.to = testAddresses.secondBidder;
    if (field === "sender") { f.receipt.from = testAddresses.secondBidder; f.transaction.from = testAddresses.secondBidder; }
    if (field === "chain") f.transaction.chainId = 1;
    if (field === "blockHash") f.transaction.blockHash = replacementHash;
    if (field === "blockNumber") f.transaction.blockNumber += 1n;
    if (field === "index") f.transaction.transactionIndex += 1;
    expect((await f.confirm()).outcome).toBe("unknown");
  });
  it.each(["missing", "emitter", "transactionHash", "blockHash", "removed", "duplicate", "wrongAction", "args"])("requires its own consistent action event: %s", async (field) => {
    const f = confirmationFixture(action);
    if (field === "missing") f.receipt.logs = [];
    if (field === "emitter") f.log.address = testAddresses.secondBidder;
    if (field === "transactionHash") f.log.transactionHash = replacementHash as typeof txHash;
    if (field === "blockHash") f.log.blockHash = replacementHash;
    if (field === "removed") f.log.removed = true;
    if (field === "duplicate") f.receipt.logs.push({ ...f.log, logIndex: 1 });
    if (field === "wrongAction") f.log.topics = [];
    if (field === "args") f.log.topics = encodeEventTopics({ abi: action.abi, eventName: action.eventName,
      args: Object.fromEntries(Object.entries(action.topics).map(([key, value]) => [key, typeof value === "bigint" ? value + 1n : testAddresses.secondBidder])) });
    expect((await f.confirm()).outcome).toBe("unknown");
  });
  it.each(["wait", "transaction", "chain"])("recovers from %s RPC unavailability only after explicit read-only verification", async (rpc) => {
    const f = confirmationFixture(action);
    if (rpc === "wait") f.mocks.waitForTransactionReceipt.mockRejectedValueOnce(new Error("RPC unavailable"));
    if (rpc === "transaction") f.mocks.getTransaction.mockRejectedValueOnce(new Error("RPC unavailable"));
    if (rpc === "chain") f.mocks.getChainId.mockRejectedValueOnce(new Error("RPC unavailable"));
    expect((await f.confirm()).outcome).toBe("unknown");
    expect((await f.confirm(true)).outcome).toBe("confirmed");
    expect(f.mocks.waitForTransactionReceipt).toHaveBeenLastCalledWith(expect.objectContaining({ timeout: 15000, retryCount: 1 }));
  });
  it("preserves the effective hash if the replacement was observed before a timeout", async () => {
    const f = confirmationFixture(action);
    f.replace();
    const initialWait = f.mocks.waitForTransactionReceipt.getMockImplementation()!;
    f.mocks.waitForTransactionReceipt.mockImplementationOnce(async (options) => {
      await initialWait(options); throw new Error("RPC timeout after replacement");
    });
    expect(await f.confirm()).toMatchObject({ outcome: "unknown", submission: { effectiveHash: replacementHash } });
    f.mocks.waitForTransactionReceipt.mockImplementation(async () => f.receipt);
    expect((await f.confirm(true)).outcome).toBe("confirmed");
  });
});

it.each(cases.filter((action) => action.positiveAmount))("$name does not confirm a zero-amount event", async (action) => {
  const f = confirmationFixture(action);
  f.log.data = encodeAbiParameters([{ type: "uint256" }], [0n]);
  expect((await f.confirm()).outcome).toBe("unknown");
});

it.each(["callback calldata", "callback target", "callback value", "callback receipt status", "callback receipt logs"])("known contradictory %s evidence cannot confirm", async (field) => {
  const f = confirmationFixture(cases[0]);
  const original = { ...f.transaction };
  f.replace();
  f.mocks.waitForTransactionReceipt.mockImplementation(async (options) => {
    const observed = { ...f.transaction };
    const observedReceipt = { ...f.receipt, logs: [...f.receipt.logs] };
    if (field === "callback calldata") observed.input = "0x";
    if (field === "callback target") observed.to = account;
    if (field === "callback value") observed.value = 1n;
    if (field === "callback receipt status") observedReceipt.status = "reverted";
    if (field === "callback receipt logs") observedReceipt.logs = [];
    (options as { onReplaced: (value: unknown) => void }).onReplaced({ reason: "repriced",
      replacedTransaction: original, transaction: observed, transactionReceipt: observedReceipt });
    return f.receipt;
  });
  expect((await f.confirm()).outcome).toBe("unknown");
});

it("a bad replacement observation cannot permanently block a later coherent manual verification", async () => {
  const f = confirmationFixture(cases[0]);
  const original = { ...f.transaction };
  f.replace();
  f.mocks.waitForTransactionReceipt.mockImplementationOnce(async (options) => {
    (options as { onReplaced: (value: unknown) => void }).onReplaced({ reason: "repriced", replacedTransaction: original,
      transaction: { ...f.transaction, nonce: 99 }, transactionReceipt: f.receipt });
    return f.receipt;
  });
  expect((await f.confirm()).outcome).toBe("unknown");
  expect(f.submission.effectiveHash).toBe(txHash);
  expect((await f.confirm(true)).outcome).toBe("confirmed");
});

it.each(["short transaction hash", "malformed block hash", "missing index", "negative block", "negative index"])("invalid mined identity %s does not confirm", async (field) => {
  const f = confirmationFixture(cases[0]);
  if (field === "short transaction hash") {
    Object.assign(f.submission, { effectiveHash: "0x12", originalHash: "0x12" });
    f.receipt.transactionHash = "0x12" as typeof txHash; f.transaction.hash = "0x12" as typeof txHash;
  }
  if (field === "malformed block hash") { f.transaction.blockHash = "0x12"; f.receipt.blockHash = "0x12"; }
  if (field === "missing index") { Object.assign(f.transaction, { transactionIndex: null }); Object.assign(f.receipt, { transactionIndex: null }); }
  if (field === "negative block") { f.transaction.blockNumber = -1n; f.receipt.blockNumber = -1n; }
  if (field === "negative index") { f.transaction.transactionIndex = -1; f.receipt.transactionIndex = -1; }
  expect((await f.confirm()).outcome).toBe("unknown");
});

it("supports legacy transactions without a chainId field when the selected RPC chain is verified", async () => {
  const f = confirmationFixture(cases[0]);
  Object.assign(f.transaction, { chainId: undefined });
  expect((await f.confirm()).outcome).toBe("confirmed");
});

it.each(["receipt block", "receipt index", "receipt status", "receipt logs", "transaction input", "transaction value", "transaction target"])("incomplete callback %s data can be recovered by a coherent manual check without another replacement callback", async (field) => {
  const f = confirmationFixture(cases[0]);
  const original = { ...f.transaction };
  f.replace();
  f.mocks.waitForTransactionReceipt.mockImplementationOnce(async (options) => {
    const observedTransaction = { ...f.transaction };
    const observedReceipt = { ...f.receipt };
    if (field === "receipt block") Object.assign(observedReceipt, { blockNumber: null });
    if (field === "receipt index") Object.assign(observedReceipt, { transactionIndex: undefined });
    if (field === "receipt status") Object.assign(observedReceipt, { status: undefined });
    if (field === "receipt logs") Object.assign(observedReceipt, { logs: undefined });
    if (field === "transaction input") Object.assign(observedTransaction, { input: undefined });
    if (field === "transaction value") Object.assign(observedTransaction, { value: undefined });
    if (field === "transaction target") Object.assign(observedTransaction, { to: undefined });
    (options as { onReplaced: (value: unknown) => void }).onReplaced({ reason: "repriced", replacedTransaction: original,
      transaction: observedTransaction, transactionReceipt: observedReceipt });
    return f.receipt;
  });
  expect((await f.confirm()).outcome).toBe("unknown");
  expect(f.submission.effectiveHash).toBe(replacementHash);
  f.mocks.waitForTransactionReceipt.mockImplementation(async () => f.receipt);
  expect((await f.confirm(true)).outcome).toBe("confirmed");
  expect(f.mocks.waitForTransactionReceipt).toHaveBeenLastCalledWith(expect.objectContaining({ hash: replacementHash, timeout: 15000 }));
});

it.each(["log transaction hash", "log block hash", "log block", "log transaction index", "log index", "removed log", "transaction block hash", "transaction block", "transaction index"])("does not discard contradictory callback mined metadata: %s", async (field) => {
  const f = confirmationFixture(cases[0]);
  const original = { ...f.transaction };
  f.replace();
  f.mocks.waitForTransactionReceipt.mockImplementation(async (options) => {
    const observedTransaction = { ...f.transaction };
    const observedLog = { ...f.log };
    if (field === "log transaction hash") observedLog.transactionHash = txHash;
    if (field === "log block hash") observedLog.blockHash = replacementHash;
    if (field === "log block") observedLog.blockNumber += 1n;
    if (field === "log transaction index") observedLog.transactionIndex += 1;
    if (field === "log index") observedLog.logIndex += 1;
    if (field === "removed log") observedLog.removed = true;
    if (field === "transaction block hash") observedTransaction.blockHash = replacementHash;
    if (field === "transaction block") observedTransaction.blockNumber += 1n;
    if (field === "transaction index") observedTransaction.transactionIndex += 1;
    (options as { onReplaced: (value: unknown) => void }).onReplaced({ reason: "repriced", replacedTransaction: original,
      transaction: observedTransaction, transactionReceipt: { ...f.receipt, logs: [observedLog] } });
    return f.receipt;
  });
  expect((await f.confirm()).outcome).toBe("unknown");
});

it.each(["input", "value", "to"])("missing final mined transaction %s remains unknown and can be verified once RPC content recovers", async (field) => {
  const f = confirmationFixture(cases[0]);
  const complete = { ...f.transaction };
  Object.assign(f.transaction, { [field]: undefined });
  expect((await f.confirm()).outcome).toBe("unknown");
  Object.assign(f.transaction, complete);
  expect((await f.confirm(true)).outcome).toBe("confirmed");
  expect(f.mocks.waitForTransactionReceipt).toHaveBeenLastCalledWith(expect.objectContaining({ hash: txHash, timeout: 15000 }));
});
