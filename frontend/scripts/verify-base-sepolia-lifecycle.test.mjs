import test from "node:test";
import assert from "node:assert/strict";
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
const context = (phase) => ({ phase, roles, manifest, auctionId: "7", nft: address(20), tokenId: "1" });

function baseAuction() {
  return {
    seller: roles.seller, nft: address(20), tokenId: "1", startPrice: "10000000000000000",
    duration: "7200", extensionsUsed: "0", state: "0", highestBidder: address(0), highestBid: "0",
    participantCount: "0", bidCount: "0", nftClaimed: false, feeRecipient: roles.feeRecipient,
    modules: { nftVault: manifest.contracts.nftVault, escrowVault: manifest.contracts.escrowVault, distributionVault: manifest.contracts.distributionVault, reputationAdapter: manifest.contracts.reputationAdapter },
    params: { bidbackFeeBps: "500", redistributionBps: "5000", minParticipants: "2", alphaBps: "6000", betaBps: "3000", gammaBps: "1000", minBidIncrementBps: "500", perUserRewardCapBps: "4000", maxParticipants: "64", maxInteractionCount: "5", minAuctionDuration: "3600", antiSnipeWindow: "600", antiSnipeExtension: "600", maxAntiSnipeExtensions: "6", minExposure: "300", minPremiumNet: "10000000000000000", efCap: "1000000000000000000", etCap: "1000000000000000000", iiCap: "1000000000000000000" }
  };
}

function snapshot(phase) {
  const rank = ["before-create", "after-create", "after-bid-a", "after-bid-b", "after-step-up", "after-finalize", "after-nft-claim", "after-refund", "after-reward", "after-seller-withdraw", "final"].indexOf(phase);
  const economics = calculateCanonicalEconomics();
  const result = { chainId: "84532", nextAuctionId: rank === 0 ? "7" : "8", nft: { owner: rank >= 6 ? roles.bidderA : rank >= 1 ? manifest.contracts.nftVault : roles.seller, approved: rank === 0 ? manifest.contracts.nftVault : address(0) }, escrow: { balance: "0" } };
  if (rank === 0) return result;
  result.auction = baseAuction(); result.participants = []; result.bids = [];
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
