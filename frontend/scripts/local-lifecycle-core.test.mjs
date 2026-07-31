import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_ANVIL_CHAIN_ID,
  LifecycleSmokeError,
  WEI_PER_ETH,
  assertEqual,
  assertExpectedLocalParams,
  assertLocalChainId,
  assertLoopbackRpcUrl,
  calculateSingleLoserEconomics,
  mulDivDown,
  paramsFromTuple,
  validateLocalDeployment
} from "./local-lifecycle-core.mjs";

const address = (suffix) => `0x${suffix.toString(16).padStart(40, "0")}`;

function deployment(chainId = LOCAL_ANVIL_CHAIN_ID) {
  return {
    chainId,
    generatedAt: "2026-07-31T00:00:00.000Z",
    source: "test",
    contracts: {
      auctionHouse: address(1),
      nftVault: address(2),
      escrowVault: address(3),
      distributionVault: address(4),
      paramsController: address(5),
      reputationAdapter: address(6),
      localNft: address(7)
    }
  };
}

test("accepts IPv4, localhost and IPv6 loopback RPC URLs", () => {
  assert.doesNotThrow(() => assertLoopbackRpcUrl("http://127.0.0.1:8545"));
  assert.doesNotThrow(() => assertLoopbackRpcUrl("http://localhost:8545"));
  assert.doesNotThrow(() => assertLoopbackRpcUrl("http://[::1]:8545"));
});

test("rejects non-loopback and credential-bearing RPC URLs", () => {
  assert.throws(() => assertLoopbackRpcUrl("https://sepolia.base.org"), LifecycleSmokeError);
  assert.throws(() => assertLoopbackRpcUrl("http://192.168.1.20:8545"), LifecycleSmokeError);
  assert.throws(() => assertLoopbackRpcUrl("http://user:password@localhost:8545"), LifecycleSmokeError);
});

test("accepts only Anvil chain ID 31337", () => {
  assert.equal(assertLocalChainId("0x7a69"), 31337);
  assert.equal(assertLocalChainId(31337), 31337);
  for (const chainId of [1, 84532, 31338]) {
    assert.throws(() => assertLocalChainId(chainId), LifecycleSmokeError);
  }
});

test("uses Solidity-compatible integer division", () => {
  assert.equal(mulDivDown(5n, 1n, 2n), 2n);
  assert.equal(mulDivDown(10n, 3333n, 10_000n), 3n);
});

test("calculates the exact lifecycle economics with bigint arithmetic", () => {
  const economics = calculateSingleLoserEconomics({
    startPrice: 1n * WEI_PER_ETH,
    finalPrice: 2n * WEI_PER_ETH,
    feeBps: 500n,
    redistributionBps: 5_000n,
    perUserRewardCapBps: 4_000n,
    minPremiumNet: WEI_PER_ETH / 100n,
    participantCount: 2n,
    minParticipants: 2n,
    initialDuration: 2n * 60n * 60n,
    minAuctionDuration: 60n * 60n,
    winnerCap: 2n * WEI_PER_ETH,
    losingCap: 15n * WEI_PER_ETH / 10n
  });

  assert.deepEqual(economics, {
    grossPremium: 1n * WEI_PER_ETH,
    protocolFee: 5n * WEI_PER_ETH / 100n,
    netPremium: 95n * WEI_PER_ETH / 100n,
    candidateDistribution: 475n * WEI_PER_ETH / 1000n,
    assignedReward: 19n * WEI_PER_ETH / 100n,
    sellerProceeds: 176n * WEI_PER_ETH / 100n,
    losingRefund: 15n * WEI_PER_ETH / 10n,
    winnerSurplusRefund: 0n,
    totalDeposits: 35n * WEI_PER_ETH / 10n
  });
});

test("validates the exact local economic parameter profile", () => {
  const params = paramsFromTuple([
    500n, 5_000n, 2n, 6_000n, 3_000n, 1_000n, 500n, 4_000n, 64n, 5n,
    3_600n, 600n, 600n, 6n, 300n, WEI_PER_ETH / 100n, WEI_PER_ETH, WEI_PER_ETH, WEI_PER_ETH
  ]);
  assert.doesNotThrow(() => assertExpectedLocalParams("params", params));
  assert.throws(
    () => assertExpectedLocalParams("params", { ...params, bidbackFeeBps: 501n }),
    /params\.bidbackFeeBps/
  );
});

test("assertion failures include step, expected value and observed value", () => {
  assert.throws(
    () => assertEqual("seller proceeds", 1n, 2n),
    (error) =>
      error instanceof LifecycleSmokeError &&
      error.message.includes("seller proceeds") &&
      error.message.includes("expected 2") &&
      error.message.includes("observed 1")
  );
});

test("accepts a complete local deployment and rejects another chain", () => {
  assert.equal(validateLocalDeployment(deployment()).chainId, 31337);
  assert.throws(() => validateLocalDeployment(deployment(84532)), /chainId mismatch/i);
});
