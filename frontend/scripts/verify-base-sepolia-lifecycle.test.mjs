import test from "node:test";
import assert from "node:assert/strict";
import { toFunctionSelector } from "viem";
import { LEGACY_PROFILE, AMOUNT_RANK_PROFILE, AMOUNT_RANK_IDENTITY, SCORE_SCALE, MAX_AMOUNT,
  calculateAmountRankScores } from "./local-lifecycle-core.mjs";
import {
  BASE_SEPOLIA_CHAIN_ID,
  LifecycleVerificationError,
  assertBaseSepoliaChainId,
  assertLifecyclePhase,
  calculateCanonicalEconomics,
  validateDistinctRoleAddresses
} from "./verify-base-sepolia-lifecycle.mjs";

const address = (suffix) => `0x${suffix.toString(16).padStart(40, "0")}`;
const roles = { owner: address(1), seller: address(2), feeRecipient: address(3), bidderA: address(4), bidderB: address(5) };
const manifest = { chainId: BASE_SEPOLIA_CHAIN_ID, contracts: { auctionHouse: address(10), nftVault: address(11), escrowVault: address(12), distributionVault: address(13), paramsController: address(14), reputationAdapter: address(15) } };
const context = (phase, profile = LEGACY_PROFILE) => ({ phase, profile, roles, manifest, auctionId: "7", nft: address(20), tokenId: "1" });

function baseAuction(profile = LEGACY_PROFILE) {
  return {
    seller: roles.seller, nft: address(20), tokenId: "1", startPrice: "10000000000000000",
    duration: "7200", extensionsUsed: "0", state: "0", highestBidder: address(0), highestBid: "0",
    participantCount: "0", bidCount: "0", nftClaimed: false, feeRecipient: roles.feeRecipient,
    modules: { nftVault: manifest.contracts.nftVault, escrowVault: manifest.contracts.escrowVault, distributionVault: manifest.contracts.distributionVault, reputationAdapter: manifest.contracts.reputationAdapter },
    params: { ...(profile === AMOUNT_RANK_PROFILE ? { rankSoftness: "4" } : {}), bidbackFeeBps: "500", redistributionBps: "5000", minParticipants: "2", alphaBps: "6000", betaBps: "3000", gammaBps: "1000", minBidIncrementBps: "500", perUserRewardCapBps: "4000", maxParticipants: "64", maxInteractionCount: "5", minAuctionDuration: "3600", antiSnipeWindow: "600", antiSnipeExtension: "600", maxAntiSnipeExtensions: "6", minExposure: "300", minPremiumNet: "10000000000000000", efCap: "1000000000000000000", etCap: "1000000000000000000", iiCap: "1000000000000000000" }
  };
}

function snapshot(phase, profile = LEGACY_PROFILE) {
  const rank = ["before-create", "after-create", "after-bid-a", "after-bid-b", "after-step-up", "after-finalize", "after-nft-claim", "after-refund", "after-reward", "after-seller-withdraw", "final"].indexOf(phase);
  const economics = calculateCanonicalEconomics(profile);
  const result = { chainId: "84532", nextAuctionId: rank === 0 ? "7" : "8", nft: { owner: rank >= 6 ? roles.bidderA : rank >= 1 ? manifest.contracts.nftVault : roles.seller, approved: rank === 0 ? manifest.contracts.nftVault : address(0) }, escrow: { balance: "0" } };
  if (rank === 0) return result;
  result.auction = baseAuction(profile); result.participants = []; result.bids = [];
  result.caps = { bidderA: "0", bidderB: "0" };
  result.lock = { nft: address(20), tokenId: "1", seller: roles.seller, locked: rank < 6, released: rank >= 6 };
  result.settlement = { finalized: false }; result.distribution = { opened: false };
  if (rank >= 2) { result.auction.highestBidder = roles.bidderA; result.auction.highestBid = economics.bidderAInitialCap.toString(); result.auction.participantCount = "1"; result.auction.bidCount = "1"; result.participants = [roles.bidderA]; result.bids = [{ bidder: roles.bidderA, amount: economics.bidderAInitialCap.toString() }]; result.caps.bidderA = economics.bidderAInitialCap.toString(); result.escrow.balance = economics.bidderAInitialCap.toString(); }
  if (rank >= 3) { result.auction.highestBidder = roles.bidderB; result.auction.highestBid = economics.bidderBCap.toString(); result.auction.participantCount = "2"; result.auction.bidCount = "2"; result.participants.push(roles.bidderB); result.bids.push({ bidder: roles.bidderB, amount: economics.bidderBCap.toString() }); result.caps.bidderB = economics.bidderBCap.toString(); result.escrow.balance = (economics.bidderAInitialCap + economics.bidderBCap).toString(); }
  if (rank >= 4) { result.auction.highestBidder = roles.bidderA; result.auction.highestBid = economics.bidderAFinalCap.toString(); result.auction.bidCount = "3"; result.bids.push({ bidder: roles.bidderA, amount: economics.bidderAFinalCap.toString() }); result.caps.bidderA = economics.bidderAFinalCap.toString(); result.escrow.balance = economics.totalDeposits.toString(); }
  if (rank >= 5) {
    result.auction.state = "2"; result.auction.nftClaimed = rank >= 6;
    result.settlement = { finalized: true, winner: roles.bidderA, distributionVault: manifest.contracts.distributionVault, finalPrice: economics.bidderAFinalCap.toString(), sellerProceeds: economics.sellerProceeds.toString(), feeAmount: economics.protocolFee.toString(), distributionReserve: rank >= 8 ? "0" : economics.rewardBidderB.toString() };
    result.refunds = { bidderA: { amount: "0", claimed: false }, bidderB: { amount: economics.refundBidderB.toString(), claimed: rank >= 7 } };
    result.rewards = { bidderA: { entitlement: "0", claimed: false }, bidderB: { entitlement: economics.rewardBidderB.toString(), claimed: rank >= 8 } };
    result.distribution = { opened: true, totalAssigned: economics.rewardBidderB.toString(), totalClaimed: rank >= 8 ? economics.rewardBidderB.toString() : "0", escrow: manifest.contracts.escrowVault };
    result.credits = { seller: rank >= 9 ? "0" : economics.sellerProceeds.toString(), feeRecipient: rank >= 10 ? "0" : economics.protocolFee.toString() };
    result.escrow.balance = rank < 7 ? economics.totalDeposits.toString() : rank === 7 ? economics.bidderAFinalCap.toString() : rank === 8 ? (economics.sellerProceeds + economics.protocolFee).toString() : rank === 9 ? economics.protocolFee.toString() : "0";
  }
  if (profile === AMOUNT_RANK_PROFILE) {
    const scores = calculateAmountRankScores({ bidderCount: 2, h: 4n,
      bids: result.bids.map((bid) => ({ bidderIndex: bid.bidder === roles.bidderA ? 0 : 1, newCapWei: BigInt(bid.amount) })) }).scores;
    result.scores = { bidderA: scores[0].toString(), bidderB: scores[1].toString() };
  }
  return result;
}

test("refuses every chain other than Base Sepolia 84532", () => {
  assert.doesNotThrow(() => assertBaseSepoliaChainId(84532));
  for (const chainId of [1, 31337, 8453]) assert.throws(() => assertBaseSepoliaChainId(chainId), LifecycleVerificationError);
});

test("calculates the canonical economics with Solidity-compatible bigint division", () => {
  assert.deepEqual(calculateCanonicalEconomics(), {
    startPrice: 10000000000000000n, bidderAInitialCap: 12000000000000000n, bidderBCap: 15000000000000000n,
    bidderAFinalCap: 30000000000000000n, stepUpValue: 18000000000000000n, grossPremium: 20000000000000000n,
    protocolFee: 1000000000000000n, netPremium: 19000000000000000n, candidateDistribution: 9500000000000000n,
    rewardBidderB: 3800000000000000n, sellerProceeds: 25200000000000000n, refundBidderB: 15000000000000000n,
    totalDeposits: 45000000000000000n
  });
});

test("requires five valid distinct public role addresses", () => {
  assert.doesNotThrow(() => validateDistinctRoleAddresses(roles));
  assert.throws(() => validateDistinctRoleAddresses({ ...roles, bidderB: roles.bidderA }), /five distinct role addresses/);
});

for (const phase of ["before-create", "after-step-up", "after-finalize", "final"]) {
  test(`accepts a complete canonical ${phase} snapshot`, () => {
    assert.doesNotThrow(() => assertLifecyclePhase(snapshot(phase), context(phase)));
  });
}

test("reports step, expected and observed values", () => {
  const invalid = snapshot("after-step-up"); invalid.caps.bidderA = "1";
  assert.throws(() => assertLifecyclePhase(invalid, context("after-step-up")), (error) => error.message.includes("caps.bidderA") && error.message.includes("expected") && error.message.includes("observed 1"));
});

test("never silently accepts missing phase data", () => {
  const incomplete = snapshot("after-finalize"); delete incomplete.rewards;
  assert.throws(() => assertLifecyclePhase(incomplete, context("after-finalize")), /missing/);
});

// Reused deterministic fixtures for the collector integration suite. No RPC.
export { roles, manifest, context, snapshot };

export function lifecycleClient(profile = LEGACY_PROFILE) {
  const pinnedReads = [];
  const blockHash = (number) => `0x${number.toString(16).padStart(64, "0")}`;
  const client = {
    pinnedReads,
    rawWidth: profile === AMOUNT_RANK_PROFILE ? 640 : 608,
    identity: { FORMULA_ID: AMOUNT_RANK_IDENTITY.formulaId, ARITHMETIC_ID: AMOUNT_RANK_IDENTITY.arithmeticId,
      ROUNDING_ID: AMOUNT_RANK_IDENTITY.roundingId, SCORE_SCALE, MAX_AMOUNT },
    async call(args) {
      pinnedReads.push(args.blockNumber);
      assert.ok([toFunctionSelector("params()"), toFunctionSelector("getAuctionParams(uint256)")].includes(args.data.slice(0, 10)));
      return { data: `0x${"00".repeat(client.rawWidth)}` };
    },
    async getChainId() { return 84532; },
    async getBlock({ blockNumber = 112n } = {}) { return { number: blockNumber, hash: blockHash(blockNumber), timestamp: 1800000000n + blockNumber }; },
    async getBytecode(args) { pinnedReads.push(args.blockNumber); return "0x6000"; },
    async getBalance(args) { pinnedReads.push(args.blockNumber); return BigInt(snapshotForBlock(args.blockNumber, profile).escrow.balance); },
    async readContract(args) {
      pinnedReads.push(args.blockNumber);
      const s = snapshotForBlock(args.blockNumber, profile);
      const bidder = String(args.args?.[1]).toLowerCase() === roles.bidderA.toLowerCase() ? "bidderA" : "bidderB";
      const fn = args.functionName;
      if (Object.hasOwn(client.identity, fn)) return client.identity[fn];
      if (fn === "bidderScores") return BigInt(s.scores[bidder]);
      if (fn === "owner") return roles.owner;
      if (fn === "feeRecipient" || fn === "getAuctionFeeRecipient") return roles.feeRecipient;
      if (fn === "auctionHouse") return manifest.contracts.auctionHouse;
      if (Object.hasOwn(manifest.contracts, fn)) return manifest.contracts[fn];
      if (fn === "paused") return false;
      if (fn === "params" || fn === "getAuctionParams") {
        const entry = args.abi.find((item) => item.name === fn);
        assert.equal(entry.outputs[0].components.length, profile === AMOUNT_RANK_PROFILE ? 20 : 19);
        return baseAuction(profile).params;
      }
      if (fn === "nextAuctionId") return BigInt(s.nextAuctionId);
      if (fn === "ownerOf") return s.nft.owner;
      if (fn === "getApproved") return s.nft.approved;
      if (fn === "getAuction") return { ...s.auction, startTime: 1800000000n, initialEndTime: 1800007200n, endTime: 1800007200n };
      if (fn === "getAuctionModules") return s.auction.modules;
      if (fn === "getParticipants") return s.participants;
      if (fn === "getBidCount") return BigInt(s.bids.length);
      if (fn === "getBid") return { ...s.bids[Number(args.args[1])], timestamp: 1800000000n + args.args[1] };
      if (fn === "capOf") return BigInt(s.caps[bidder]);
      if (fn === "locks") return s.lock;
      if (fn === "settlements") return { winner: address(0), distributionVault: address(0), finalPrice: "0", sellerProceeds: "0", feeAmount: "0", distributionReserve: "0", ...s.settlement };
      if (fn === "refundableAmount") return BigInt(s.refunds?.[bidder]?.amount ?? "0");
      if (fn === "refundClaimed") return s.refunds?.[bidder]?.claimed ?? false;
      if (fn === "distributions") return { totalAssigned: "0", totalClaimed: "0", ...s.distribution };
      if (fn === "entitlementOf") return BigInt(s.rewards?.[bidder]?.entitlement ?? "0");
      if (fn === "claimed") return s.rewards?.[bidder]?.claimed ?? false;
      if (fn === "escrowForAuction") return s.distribution.escrow ?? address(0);
      if (fn === "sellerCredits") return BigInt(s.credits?.seller ?? "0");
      if (fn === "protocolFeeCredits") return BigInt(s.credits?.feeRecipient ?? "0");
      if (fn === "reputationBps") return 10000n;
      throw new Error(`Unexpected fixture read: ${fn}`);
    }
  };
  return client;
}

function snapshotForBlock(number, profile) {
  const phases = ["before-create", "after-create", "after-bid-a", "after-bid-b", "after-step-up", "after-finalize", "after-nft-claim", "after-refund", "after-reward", "after-seller-withdraw", "final"];
  return snapshot(phases[Math.min(10, Number(number) - 101)], profile);
}

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PHASES, parseArgs, verifyPhase, writeSnapshot } from "./verify-base-sepolia-lifecycle.mjs";

test("all eleven phases use existing assertions and block-pinned reads", async () => {
  for (const [index, phase] of PHASES.entries()) {
    const client = lifecycleClient();
    const blockNumber = 101n + BigInt(index);
    const result = await verifyPhase(client, manifest, context(phase), blockNumber);
    assert.equal(result.block.number, blockNumber.toString());
    assert.ok(client.pinnedReads.length > 10);
    assert.ok(client.pinnedReads.every((number) => number === blockNumber));
    assertLifecyclePhase(result.lifecycle, context(phase));
  }
});

test("session CLI rejects overrides and requires persisted output; explicit invocation still parses", () => {
  assert.equal(parseArgs(["--rpc-url", "https://example.invalid", "--session", "session.json", "--phase", "final", "--output", "new.json"]).session, "session.json");
  assert.throws(() => parseArgs(["--rpc-url", "x", "--session", "s", "--phase", "final"]));
  assert.throws(() => parseArgs(["--rpc-url", "x", "--session", "s", "--phase", "final", "--output", "o", "--owner", roles.owner]));
  const args = { "rpc-url": "https://example.invalid", "auction-id": "7", owner: roles.owner, seller: roles.seller,
    "fee-recipient": roles.feeRecipient, "bidder-a": roles.bidderA, "bidder-b": roles.bidderB, nft: address(20), "token-id": "1", phase: "final", manifest: "manifest.json", profile: LEGACY_PROFILE };
  assert.deepEqual(parseArgs(Object.entries(args).flatMap(([key, value]) => [`--${key}`, value])), args);
});

test("snapshot persistence never overwrites an existing file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bidback-phase-"));
  try {
    const filename = path.join(directory, "phase.json");
    await writeSnapshot(filename, { public: true });
    await assert.rejects(writeSnapshot(filename, { replacement: true }), { code: "EEXIST" });
    assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), { public: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("reorg during phase verification is rejected", async () => {
  const client = lifecycleClient();
  let reads = 0;
  const getBlock = client.getBlock;
  client.getBlock = async (args) => ({ ...await getBlock(args), ...(reads++ ? { hash: `0x${"f".repeat(64)}` } : {}) });
  await assert.rejects(verifyPhase(client, manifest, context("final"), 112n), /Block changed/);
});

test("amount-rank economics assigns the whole pool without changing fees or refunds", () => {
  const old = calculateCanonicalEconomics(LEGACY_PROFILE);
  const current = calculateCanonicalEconomics(AMOUNT_RANK_PROFILE);
  assert.equal(current.rewardBidderB, 9500000000000000n);
  assert.equal(current.sellerProceeds, 19500000000000000n);
  for (const key of ["protocolFee", "refundBidderB", "totalDeposits", "candidateDistribution"]) assert.equal(current[key], old[key]);
  assert.throws(() => calculateCanonicalEconomics("unknown"));
});

test("all amount-rank phases verify 20 fields, five identities and both raw bidder scores at one block", async () => {
  for (const [index, phase] of PHASES.entries()) {
    const client = lifecycleClient(AMOUNT_RANK_PROFILE);
    const blockNumber = 101n + BigInt(index);
    const result = await verifyPhase(client, manifest, context(phase, AMOUNT_RANK_PROFILE), blockNumber);
    assert.deepEqual(result.deployment.observedFormula, AMOUNT_RANK_IDENTITY);
    assert.equal(result.deployment.params.rankSoftness, "4");
    assert.ok(client.pinnedReads.every((number) => number === blockNumber));
    if (index > 0) {
      assert.equal(result.lifecycle.auction.params.rankSoftness, "4");
      assert.deepEqual(result.lifecycle.scores, snapshot(phase, AMOUNT_RANK_PROFILE).scores);
    }
    if (index >= 5) {
      assert.equal(result.lifecycle.rewards.bidderA.entitlement, "0");
      assert.ok(BigInt(result.lifecycle.scores.bidderA) > 0n);
      assert.equal(result.lifecycle.rewards.bidderB.entitlement, "9500000000000000");
    }
  }
});

test("profile selection cannot be inferred from missing getters, width or RPC failures, including before-create", async () => {
  for (const profile of [LEGACY_PROFILE, AMOUNT_RANK_PROFILE]) {
    const client = lifecycleClient(profile);
    client.rawWidth = profile === LEGACY_PROFILE ? 640 : 608;
    await assert.rejects(verifyPhase(client, manifest, context("before-create", profile), 101n), /raw tuple bytes/);
  }
  for (const getter of ["FORMULA_ID", "ARITHMETIC_ID", "ROUNDING_ID", "SCORE_SCALE", "MAX_AMOUNT"]) {
    const client = lifecycleClient(AMOUNT_RANK_PROFILE);
    client.identity[getter] = typeof client.identity[getter] === "bigint" ? 1n : "unknown";
    await assert.rejects(verifyPhase(client, manifest, context("before-create", AMOUNT_RANK_PROFILE), 101n), /formula identity/);
    const missing = lifecycleClient(AMOUNT_RANK_PROFILE);
    const read = missing.readContract;
    missing.readContract = async (args) => { if (args.functionName === getter) throw new Error("unsupported or RPC timeout"); return read(args); };
    await assert.rejects(verifyPhase(missing, manifest, context("before-create", AMOUNT_RANK_PROFILE), 101n));
  }
  const failed = lifecycleClient(AMOUNT_RANK_PROFILE);
  failed.call = async () => { throw new Error("RPC timeout"); };
  await assert.rejects(verifyPhase(failed, manifest, context("final", AMOUNT_RANK_PROFILE), 112n));
  await assert.rejects(verifyPhase(lifecycleClient(), manifest, { ...context("final"), profile: undefined }, 112n), /profile/);
});

test("new verification rejects missing or wrong captured softness, changed winner history and reorgs", async () => {
  for (const mutate of [
    (args, result) => args.functionName === "getAuctionParams" ? { ...result, rankSoftness: undefined } : result,
    (args, result) => args.functionName === "getAuctionParams" ? { ...result, rankSoftness: "5" } : result,
    (args, result) => args.functionName === "params" ? { ...result, rankSoftness: "5" } : result,
    (args, result) => args.functionName === "bidderScores" && args.args[1] === roles.bidderA ? result + 1n : result
  ]) {
    const client = lifecycleClient(AMOUNT_RANK_PROFILE);
    const read = client.readContract;
    client.readContract = async (args) => mutate(args, await read(args));
    await assert.rejects(verifyPhase(client, manifest, context("after-finalize", AMOUNT_RANK_PROFILE), 106n));
  }
  const client = lifecycleClient(AMOUNT_RANK_PROFILE);
  const block = client.getBlock;
  let calls = 0;
  client.getBlock = async (args) => ({ ...await block(args), ...(calls++ ? { hash: `0x${"f".repeat(64)}` } : {}) });
  await assert.rejects(verifyPhase(client, manifest, context("final", AMOUNT_RANK_PROFILE), 112n), /Block changed/);
});

test("direct CLI requires profile and persisted session forbids profile overrides", () => {
  const direct = { "rpc-url": "https://example.invalid", "auction-id": "7", owner: roles.owner, seller: roles.seller,
    "fee-recipient": roles.feeRecipient, "bidder-a": roles.bidderA, "bidder-b": roles.bidderB, nft: address(20),
    "token-id": "1", phase: "final", manifest: "manifest.json" };
  const argv = Object.entries(direct).flatMap(([key, value]) => [`--${key}`, value]);
  assert.throws(() => parseArgs(argv), /profile/);
  assert.throws(() => parseArgs([...argv, "--profile", "unknown"]));
  assert.equal(parseArgs([...argv, "--profile", AMOUNT_RANK_PROFILE]).profile, AMOUNT_RANK_PROFILE);
  assert.throws(() => parseArgs(["--rpc-url", "x", "--session", "s", "--phase", "final", "--output", "o", "--profile", AMOUNT_RANK_PROFILE]));
});
