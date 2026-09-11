#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { encodeAbiParameters, toFunctionSelector, isAddress } from "viem";
import {
  PHASES, assertBaseSepoliaChainId, assertLifecyclePhase, calculateCanonicalEconomics,
  exactKeys, loadSession, phaseEvidence, publicBlock, readOnlyClient, requireEvidence,
  sessionContext, uintString, validateSession, verifyPhase
} from "./verify-base-sepolia-lifecycle.mjs";

export const ACTORS = { P1: "owner", T1: "seller", T2: "seller", T3: "bidderA", T4: "bidderB",
  T5: "bidderA", T6: "seller", T7: "bidderA", T8: "bidderB", T9: "bidderB", T10: "seller", T11: "feeRecipient" };
export const TRANSACTION_IDS = Object.keys(ACTORS);
const hashPattern = /^0x[a-fA-F0-9]{64}$/;
const hexPattern = /^0x(?:[a-fA-F0-9]{2})*$/;
const sameAddress = (a, b) => isAddress(a) && isAddress(b) && a.toLowerCase() === b.toLowerCase();

export class EvidenceError extends Error {
  constructor(status, step) {
    super(`Evidence ${status}: ${step}.`);
    this.status = status;
    this.step = step;
  }
}

function check(condition, step, status = "invalid") {
  if (!condition) throw new EvidenceError(status, step);
}

function amount(value) {
  check(typeof value === "bigint" && value >= 0n, "transaction numeric metadata");
  return value.toString();
}

// Existing contract signatures only; no ABI or contract changes. These bytes are
// inspected or passed to eth_call, never to a signing/broadcast method.
export function calldata(signature, types = [], values = []) {
  return toFunctionSelector(signature) + (types.length ? encodeAbiParameters(types.map((type) => ({ type })), values).slice(2) : "");
}

export function expectedTransactions(session, manifest) {
  const c = manifest.contracts;
  const id = BigInt(session.auctionId);
  const e = calculateCanonicalEconomics();
  const action = (to, signature, types, values, value = 0n) => ({ to, input: calldata(signature, types, values), value });
  return {
    P1: { to: null, value: 0n },
    T1: action(session.nft.address, "approve(address,uint256)", ["address", "uint256"], [c.nftVault, BigInt(session.nft.tokenId)]),
    T2: action(c.auctionHouse, "createAuction(address,uint256,uint256,uint64)", ["address", "uint256", "uint256", "uint64"], [session.nft.address, BigInt(session.nft.tokenId), e.startPrice, 7200n]),
    T3: action(c.auctionHouse, "placeBid(uint256,uint256)", ["uint256", "uint256"], [id, e.bidderAInitialCap], e.bidderAInitialCap),
    T4: action(c.auctionHouse, "placeBid(uint256,uint256)", ["uint256", "uint256"], [id, e.bidderBCap], e.bidderBCap),
    T5: action(c.auctionHouse, "placeBid(uint256,uint256)", ["uint256", "uint256"], [id, e.bidderAFinalCap], e.stepUpValue),
    T6: action(c.auctionHouse, "finalizeAuction(uint256)", ["uint256"], [id]),
    T7: action(c.auctionHouse, "claimNft(uint256)", ["uint256"], [id]),
    T8: action(c.escrowVault, "claimRefund(uint256)", ["uint256"], [id]),
    T9: action(c.distributionVault, "claim(uint256)", ["uint256"], [id]),
    T10: action(c.escrowVault, "withdrawSellerProceeds()", [], []),
    T11: action(c.escrowVault, "withdrawProtocolFees()", [], [])
  };
}

export function validateTransactionInput(input, session, provenance) {
  exactKeys(input, ["schemaVersion", "runId", "sourceCommit", "chainId", "auctionId", "manifestChecksum", "transactions"]);
  for (const key of ["schemaVersion", "runId", "sourceCommit", "chainId", "auctionId"]) check(input[key] === session[key], "transaction session identity");
  check(input.manifestChecksum === provenance.checksum, "transaction manifest checksum");
  check(input.transactions && TRANSACTION_IDS.every((id) => input.transactions[id]), "required P1 and T1-T11 hashes", "missing");
  exactKeys(input.transactions, TRANSACTION_IDS);
  const hashes = TRANSACTION_IDS.map((id) => {
    check(typeof input.transactions[id] === "string" && hashPattern.test(input.transactions[id]), id);
    return input.transactions[id].toLowerCase();
  });
  check(new Set(hashes).size === hashes.length, "duplicate transaction hash");
  return Object.fromEntries(TRANSACTION_IDS.map((id, index) => [id, hashes[index]]));
}

async function transactionRead(read, id, missingStatus) {
  try { return await read(); } catch (error) {
    // Only typed not-found conditions are classified; network errors are invalid.
    if (["TransactionNotFoundError", "TransactionReceiptNotFoundError"].includes(error?.name)) throw new EvidenceError(missingStatus, id);
    throw new EvidenceError("invalid", id);
  }
}

export async function collectTransactions(client, session, manifest, hashes) {
  assertBaseSepoliaChainId(await client.getChainId());
  const expected = expectedTransactions(session, manifest);
  const records = [];
  for (const id of TRANSACTION_IDS) {
    const hash = hashes[id];
    check(typeof hash === "string" && hashPattern.test(hash), id);
    check(!records.some((record) => record.hash === hash.toLowerCase()), "duplicate transaction hash");
    const tx = await transactionRead(() => client.getTransaction({ hash }), id, "missing");
    check(tx, id, "missing");
    check(tx.blockNumber != null && tx.blockHash != null, id, "pending");
    const receipt = await transactionRead(() => client.getTransactionReceipt({ hash }), id, "pending");
    check(receipt && receipt.blockNumber != null && receipt.blockHash != null, id, "pending");
    check(receipt.status !== "reverted", id, "failed");
    check(receipt.status === "success", id);
    const block = publicBlock(await client.getBlock({ blockNumber: receipt.blockNumber }));
    check(tx.hash?.toLowerCase() === hash.toLowerCase() && receipt.transactionHash?.toLowerCase() === hash.toLowerCase() &&
      tx.blockHash.toLowerCase() === block.hash && receipt.blockHash.toLowerCase() === block.hash &&
      amount(tx.blockNumber) === block.number && amount(receipt.blockNumber) === block.number, id);
    check(Number.isSafeInteger(tx.transactionIndex) && tx.transactionIndex >= 0 && tx.transactionIndex === receipt.transactionIndex, id);
    check(sameAddress(tx.from, session.roles[ACTORS[id]]) && sameAddress(receipt.from, tx.from), id);
    const action = expected[id];
    check(action.to === null ? tx.to === null && receipt.to === null && sameAddress(receipt.contractAddress, session.nft.address)
      : sameAddress(tx.to, action.to) && sameAddress(receipt.to, action.to), id);
    check(tx.value === action.value && (id === "P1" || tx.input?.toLowerCase() === action.input.toLowerCase()), id);
    check(Array.isArray(receipt.logs), id);
    const logs = receipt.logs.map((log) => {
      check(isAddress(log.address) && hexPattern.test(log.data) && Array.isArray(log.topics) && log.topics.every((topic) => hashPattern.test(topic)) &&
        Number.isSafeInteger(log.logIndex) && log.logIndex >= 0 && log.removed === false &&
        log.transactionHash?.toLowerCase() === hash.toLowerCase() && log.blockHash?.toLowerCase() === block.hash &&
        log.blockNumber === receipt.blockNumber && log.transactionIndex === receipt.transactionIndex, id);
      return { address: log.address.toLowerCase(), data: log.data.toLowerCase(), topics: log.topics.map((topic) => topic.toLowerCase()), logIndex: log.logIndex };
    }).sort((a, b) => a.logIndex - b.logIndex);
    check(new Set(logs.map((log) => log.logIndex)).size === logs.length, id);
    records.push({ id, actor: ACTORS[id], status: "confirmed", hash: hash.toLowerCase(), receiptStatus: "success",
      blockNumber: block.number, blockHash: block.hash, timestampUtc: block.timestampUtc,
      transactionIndex: tx.transactionIndex, from: tx.from.toLowerCase(), to: tx.to?.toLowerCase() ?? null,
      contractAddress: id === "P1" ? receipt.contractAddress.toLowerCase() : null,
      value: amount(tx.value), gasUsed: amount(receipt.gasUsed),
      effectiveGasPrice: receipt.effectiveGasPrice == null ? null : amount(receipt.effectiveGasPrice), logs });
  }
  for (let index = 1; index < records.length; index++) {
    const previous = records[index - 1]; const current = records[index];
    check(BigInt(previous.blockNumber) < BigInt(current.blockNumber) ||
      previous.blockNumber === current.blockNumber && previous.transactionIndex < current.transactionIndex, "transaction order");
  }
  return records;
}

export function validateSnapshots(snapshots, session, manifest, provenance) {
  check(Array.isArray(snapshots) && snapshots.length === PHASES.length, "required canonical phases", "missing");
  const found = new Map();
  for (const snapshot of snapshots) {
    exactKeys(snapshot, ["schemaVersion", "runId", "sourceCommit", "chainId", "auctionId", "phase", "generatedAt", "manifest", "block", "deployment", "lifecycle"]);
    check(PHASES.includes(snapshot.phase) && !found.has(snapshot.phase), "unknown or duplicate phase");
    for (const key of ["schemaVersion", "runId", "sourceCommit", "chainId", "auctionId"]) check(snapshot[key] === session[key], "snapshot session identity");
    check(isDeepStrictEqual(snapshot.manifest, provenance), "snapshot manifest checksum and provenance");
    check(typeof snapshot.generatedAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(snapshot.generatedAt) &&
      Number.isFinite(Date.parse(snapshot.generatedAt)), "snapshot timestamp");
    exactKeys(snapshot.block, ["number", "hash", "timestampUtc"]);
    uintString(snapshot.block.number);
    check(hashPattern.test(snapshot.block.hash), "snapshot block hash");
    assertLifecyclePhase(snapshot.lifecycle, sessionContext(session, manifest, snapshot.phase));
    found.set(snapshot.phase, snapshot);
  }
  return PHASES.map((phase) => found.get(phase));
}

export async function simulateDuplicates(client, session, manifest, block) {
  assertBaseSepoliaChainId(await client.getChainId());
  const actions = expectedTransactions(session, manifest);
  const expectations = { T7: "NFTAlreadyClaimed()", T8: "RefundAlreadyClaimed()", T9: "RewardAlreadyClaimed()",
    T10: "NothingToClaim()", T11: "NothingToClaim()" };
  const results = [];
  for (const [id, signature] of Object.entries(expectations)) {
    const action = actions[id];
    const selector = toFunctionSelector(signature);
    let reverted = false;
    try {
      await client.call({ account: session.roles[ACTORS[id]], to: action.to, data: action.input, blockNumber: BigInt(block.number) });
    } catch (error) {
      // Exact custom-error bytes distinguish a contract revert from a timeout,
      // HTTP failure or provider prose. Do not retain any raw error object.
      for (let cause = error, depth = 0; cause && depth < 10; cause = cause.cause, depth++) {
        if (typeof cause.data === "string" && cause.data.toLowerCase() === selector.toLowerCase()) reverted = true;
      }
    }
    check(reverted, `duplicate ${id}`);
    results.push({ transactionId: id, actor: session.roles[ACTORS[id]], target: action.to, calldata: action.input,
      method: "eth_call", result: "expected-revert", errorSelector: selector, block });
  }
  check((await client.getBlock({ blockNumber: BigInt(block.number) })).hash.toLowerCase() === block.hash.toLowerCase(), "duplicate simulation block changed");
  return results;
}

export async function assembleEvidence(client, bundle, input, snapshots) {
  const { session: rawSession, manifest, provenance } = bundle;
  const session = validateSession(rawSession);
  const hashes = validateTransactionInput(input, session, provenance);
  const ordered = validateSnapshots(snapshots, session, manifest, provenance);
  const transactions = await collectTransactions(client, session, manifest, hashes);
  const verifiedSnapshots = [];
  for (let index = 0; index < ordered.length; index++) {
    const snapshot = ordered[index];
    // A phase is captured after its transaction and before the next action.
    const lower = transactions[index + 1];
    const upper = transactions[index + 2];
    check(BigInt(snapshot.block.number) >= BigInt(lower.blockNumber) &&
      (!upper || BigInt(snapshot.block.number) < BigInt(upper.blockNumber)), "phase transaction block interval");
    const verified = await verifyPhase(client, manifest, sessionContext(session, manifest, snapshot.phase), BigInt(snapshot.block.number));
    const reconstructed = phaseEvidence(session, provenance, snapshot.phase, verified, snapshot.generatedAt);
    // Re-read historical state: rejects altered nested fields, stale/reorged
    // blocks, or arbitrary extra data rather than copying untrusted input.
    check(isDeepStrictEqual(snapshot, reconstructed), "snapshot historical state mismatch");
    verifiedSnapshots.push(reconstructed);
  }
  const context = sessionContext(session, manifest, "final");
  const before = await verifyPhase(client, manifest, context);
  check(BigInt(before.block.number) >= BigInt(ordered.at(-1).block.number), "final block precedes snapshots");
  const duplicateSimulations = await simulateDuplicates(client, session, manifest, before.block);
  const after = await verifyPhase(client, manifest, context);
  check(BigInt(after.block.number) >= BigInt(before.block.number), "final block moved backwards");
  for (const record of transactions) {
    check((await client.getBlock({ blockNumber: BigInt(record.blockNumber) })).hash.toLowerCase() === record.blockHash, "transaction block changed during assembly");
  }
  return { schemaVersion: 1, status: "complete", session, manifest: provenance, contracts: manifest.contracts,
    generatedAt: new Date().toISOString(), transactions, snapshots: verifiedSnapshots, duplicateSimulations,
    finalBeforeSimulations: before, finalAfterSimulations: after,
    sourceVerification: "pending-not-evidenced", coreDeploymentTransactions: "pending-not-evidenced",
    manualWalletObservations: "pending-not-evidenced", readinessGateAdvanced: false };
}

export async function writeEvidenceDirectory(directory, produce) {
  // Reserve first. Existing successful, failed, partial, or empty runs all fail.
  await mkdir(directory);
  try {
    const evidence = await produce();
    const report = `# Base Sepolia session evidence\n\nRun: ${evidence.session.runId}\n\nSource: ${evidence.session.sourceCommit}\n\n` +
      `Auction: ${evidence.session.auctionId}; chain: 84532.\n\nManifest SHA-256: ${evidence.manifest.checksum}\n\n` +
      `All 12 transactions and 11 phase snapshots verified. Five duplicate eth_call simulations returned the expected custom errors; final lifecycle passed afterward.\n\n` +
      `Public receipt/block/log data and historical phase checks are retained in public-evidence.json.\n\n` +
      `Source verification, core deployment receipts and manual browser/wallet observations remain pending/not evidenced. This package does not advance a readiness gate or issue an independent review verdict.\n`;
    await writeFile(path.join(directory, "REPORT.md"), report, { flag: "wx" });
    // The machine-readable success artifact is written last.
    await writeFile(path.join(directory, "public-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    await writeFile(path.join(directory, "failure.json"), `${JSON.stringify({ schemaVersion: 1,
      status: error instanceof EvidenceError ? error.status : "invalid",
      step: error instanceof EvidenceError ? error.step : "input-source-rpc-state-or-output",
      generatedAt: new Date().toISOString() }, null, 2)}\n`, { flag: "wx" });
    throw error;
  }
}

export function parseCollectorArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.slice(2);
    requireEvidence(argv[index]?.startsWith("--") && argv[index + 1] && !Object.hasOwn(args, key), "Invalid collector arguments.");
    args[key] = argv[index + 1];
  }
  exactKeys(args, ["rpc-url", "session", "transactions", "snapshots", "output"]);
  return args;
}

async function main() {
  const args = parseCollectorArgs(process.argv.slice(2));
  await writeEvidenceDirectory(path.resolve(args.output), async () => {
    const bundle = await loadSession(args.session);
    const input = JSON.parse(await readFile(args.transactions, "utf8"));
    const entries = await readdir(args.snapshots, { withFileTypes: true });
    check(entries.length === PHASES.length && entries.every((entry) => entry.isFile() && entry.name.endsWith(".json")), "snapshot directory contents");
    const snapshots = await Promise.all(entries.map(async (entry) => JSON.parse(await readFile(path.join(args.snapshots, entry.name), "utf8"))));
    return assembleEvidence(readOnlyClient(args["rpc-url"]), bundle, input, snapshots);
  });
  console.log("[OK] Complete public evidence written; independent review required.");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof EvidenceError ? `[FAIL] ${error.message}` : "[FAIL] Evidence input, source, RPC, state or create-only output check failed.");
    process.exitCode = 1;
  });
}
