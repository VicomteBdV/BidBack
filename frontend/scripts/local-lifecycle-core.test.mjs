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

import { readFile, mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  LEGACY_PROFILE, AMOUNT_RANK_PROFILE, AMOUNT_RANK_IDENTITY, MAX_AMOUNT, SCORE_SCALE,
  assertFormulaIdentity, assertParameterTupleWidths, readFormulaIdentity,
  calculateAmountRankScores, allocateAmountRankRewards, calculateAmountRankEconomics,
  parseLocalLifecycleArgs, normalizeLifecycleParameterAbi
} from "./local-lifecycle-core.mjs";

test("all 28 public arithmetic vectors match integer scores and Hamilton allocation losslessly", async () => {
  // Node 22's source context preserves integers before Number rounding.
  const fixture = JSON.parse(await readFile(new URL("../../test/fixtures/amount-rank-vectors.json", import.meta.url), "utf8"),
    (_key, value, context) => typeof value === "number" ? BigInt(context.source) : value);
  assert.equal(fixture.scoreScale, SCORE_SCALE);
  assert.equal(fixture.maxAmount, MAX_AMOUNT);
  assert.equal(fixture.vectorCount, 28n);
  assert.equal(fixture.vectors.length, 28);
  for (const vector of fixture.vectors) {
    const scored = calculateAmountRankScores({ bidderCount: Number(vector.bidderCount), h: vector.h,
      bids: vector.bids.map((bid) => ({ bidderIndex: Number(bid.bidderIndex), newCapWei: bid.newCapWei })) });
    assert.deepEqual(scored.scores, vector.expectedScores, `${vector.id} raw scores`);
    const allocated = allocateAmountRankRewards({ ...scored, pool: vector.poolWei, winnerIndex: Number(vector.winnerIndex) });
    assert.equal(allocated.denominator, vector.expectedDenominator, `${vector.id} denominator`);
    assert.deepEqual(allocated.rewards, vector.expectedRewards, `${vector.id} rewards`);
    assert.deepEqual(allocated.remainders, vector.expectedRemainders, `${vector.id} remainders`);
    assert.equal(allocated.assigned, vector.expectedAllocated, `${vector.id} assigned`);
    assert.equal(allocated.unallocated, vector.expectedUnallocated, `${vector.id} unallocated`);
  }
});

test("new canonical funding assigns the whole available pool and preserves refunds", () => {
  const economics = calculateAmountRankEconomics({ startPrice: WEI_PER_ETH, finalPrice: 2n * WEI_PER_ETH,
    feeBps: 500n, redistributionBps: 5000n, perUserRewardCapBps: 4000n, minPremiumNet: WEI_PER_ETH / 100n,
    participantCount: 2n, minParticipants: 2n, initialDuration: 7200n, minAuctionDuration: 3600n,
    winnerCap: 2n * WEI_PER_ETH, losingCap: 15n * WEI_PER_ETH / 10n, h: 4n, bidderCount: 2, winnerIndex: 0,
    bids: [{ bidderIndex: 0, newCapWei: 12n * WEI_PER_ETH / 10n }, { bidderIndex: 1, newCapWei: 15n * WEI_PER_ETH / 10n },
      { bidderIndex: 0, newCapWei: 2n * WEI_PER_ETH }] });
  assert.equal(economics.assignedReward, 475n * WEI_PER_ETH / 1000n);
  assert.equal(economics.sellerProceeds, 1475n * WEI_PER_ETH / 1000n);
  assert.equal(economics.losingRefund, 15n * WEI_PER_ETH / 10n);
  assert.equal(economics.rewards[0], 0n);
  assert.equal(economics.rewards[1], economics.assignedReward);
  assert.ok(economics.scores[0] > 0n, "winner raw history is retained");
});

test("captured softness is required and bounded; the 20th parameter is never guessed", () => {
  const raw = [500n, 5000n, 2n, 6000n, 3000n, 1000n, 500n, 4000n, 64n, 5n,
    3600n, 600n, 600n, 6n, 300n, WEI_PER_ETH / 100n, WEI_PER_ETH, WEI_PER_ETH, WEI_PER_ETH];
  assert.throws(() => paramsFromTuple(raw, AMOUNT_RANK_PROFILE));
  const params = paramsFromTuple([...raw, 4n], AMOUNT_RANK_PROFILE);
  assertExpectedLocalParams("captured", params, AMOUNT_RANK_PROFILE);
  for (const h of [undefined, 0n, 65536n]) {
    assert.throws(() => calculateAmountRankScores({ bids: [], bidderCount: 2, h }));
  }
  for (const h of [1n, 65535n]) assert.doesNotThrow(() => calculateAmountRankScores({ bids: [], bidderCount: 2, h }));
  assert.throws(() => assertExpectedLocalParams("captured", { ...params, rankSoftness: 5n }, AMOUNT_RANK_PROFILE));
  assert.throws(() => calculateAmountRankScores({ bidderCount: 1, h: 4n,
    bids: [{ bidderIndex: 0, newCapWei: MAX_AMOUNT + 1n }] }));
});

test("formula identity requires all five exact typed values at one address and block", async () => {
  const values = { FORMULA_ID: AMOUNT_RANK_IDENTITY.formulaId, ARITHMETIC_ID: AMOUNT_RANK_IDENTITY.arithmeticId,
    ROUNDING_ID: AMOUNT_RANK_IDENTITY.roundingId, SCORE_SCALE, MAX_AMOUNT };
  const calls = [];
  const client = { readContract: async (args) => { calls.push(args); return values[args.functionName]; } };
  assert.deepEqual(await readFormulaIdentity(client, address(1), 7n), AMOUNT_RANK_IDENTITY);
  assert.equal(calls.length, 5);
  assert.ok(calls.every((args) => args.address === address(1) && args.blockNumber === 7n));
  for (const key of Object.keys(AMOUNT_RANK_IDENTITY)) {
    assert.throws(() => assertFormulaIdentity({ ...AMOUNT_RANK_IDENTITY, [key]: "unknown" }));
    const missing = { ...AMOUNT_RANK_IDENTITY }; delete missing[key];
    assert.throws(() => assertFormulaIdentity(missing));
  }
  values.SCORE_SCALE = SCORE_SCALE.toString();
  await assert.rejects(readFormulaIdentity(client, address(1), 7n), /type/);
  await assert.rejects(readFormulaIdentity({ readContract: async () => { throw new Error("RPC unavailable"); } }, address(1), 7n));
});

test("raw tuple guards reject truncated, extra, empty and crossed profile returns", async () => {
  for (const [profile, width] of [[LEGACY_PROFILE, 608], [AMOUNT_RANK_PROFILE, 640]]) {
    const calls = [];
    const client = { call: async (args) => { calls.push(args); return { data: `0x${"00".repeat(width)}` }; } };
    await assertParameterTupleWidths(client, { paramsController: address(2), auctionHouse: address(1) }, 7n, profile, 9n);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.to), [address(2), address(1)]);
    assert.ok(calls.every((call) => call.blockNumber === 9n));
    for (const badWidth of [0, width - 1, width + 1, profile === LEGACY_PROFILE ? 640 : 608]) {
      await assert.rejects(assertParameterTupleWidths({ call: async () => ({ data: `0x${"00".repeat(badWidth)}` }) },
        { paramsController: address(2), auctionHouse: address(1) }, 7n, profile, 9n));
    }
  }
  await assert.rejects(assertParameterTupleWidths({ call: async () => { throw new Error("timeout"); } }, {}, 1n, LEGACY_PROFILE, 1n));
});

test("local CLI requires exactly one supported profile even for preflight", () => {
  for (const profile of [LEGACY_PROFILE, AMOUNT_RANK_PROFILE]) {
    assert.deepEqual(parseLocalLifecycleArgs(["--profile", profile]), { preflightOnly: false, profile });
    assert.deepEqual(parseLocalLifecycleArgs(["--preflight-only", "--profile", profile]), { preflightOnly: true, profile });
  }
  for (const args of [[], ["--preflight-only"], ["--profile"], ["--profile", "unknown"],
    ["--profile", LEGACY_PROFILE, "--profile", AMOUNT_RANK_PROFILE], ["--profile", LEGACY_PROFILE, "--extra"],
    ["--preflight-only", "--preflight-only", "--profile", LEGACY_PROFILE]]) assert.throws(() => parseLocalLifecycleArgs(args));
});

test("root wrapper validates before npm, preserves profile and stops on preflight boundaries", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bidback-wrapper-"));
  try {
    const journal = path.join(directory, "npm-args.log");
    const stub = path.join(directory, "npm");
    await writeFile(stub, '#!/bin/bash\nprintf "%s\\n" "$*" >> "$TEST_NPM_JOURNAL"\nif [[ "$*" == *"preflight:local-lifecycle"* && "${TEST_PREFLIGHT_FAIL:-0}" == 1 ]]; then exit 1; fi\n');
    await chmod(stub, 0o700);
    const run = async (args, fail = "0") => {
      await writeFile(journal, "");
      const result = spawnSync("/bin/bash", [new URL("../../scripts/local-lifecycle-smoke.sh", import.meta.url).pathname, ...args],
        { encoding: "utf8", env: { PATH: `${directory}:/usr/bin:/bin`, TEST_NPM_JOURNAL: journal, TEST_PREFLIGHT_FAIL: fail } });
      return { result, calls: (await readFile(journal, "utf8")).trim().split("\n").filter(Boolean) };
    };
    for (const args of [[], ["--profile"], ["--profile", "unknown"], ["--preflight-only"],
      ["--profile", LEGACY_PROFILE, "--profile", AMOUNT_RANK_PROFILE], ["--profile", LEGACY_PROFILE, "--unknown"]]) {
      const { result, calls } = await run(args);
      assert.notEqual(result.status, 0); assert.deepEqual(calls, []);
    }
    for (const profile of [LEGACY_PROFILE, AMOUNT_RANK_PROFILE]) {
      const preflight = `--prefix frontend run preflight:local-lifecycle -- --profile ${profile}`;
      const failed = await run(["--profile", profile, "--preflight-only"], "1");
      assert.notEqual(failed.result.status, 0);
      assert.deepEqual(failed.calls, ["--prefix frontend run test:local-lifecycle", preflight]);
      const only = await run(["--profile", profile, "--preflight-only"]);
      assert.equal(only.result.status, 0);
      assert.deepEqual(only.calls, ["--prefix frontend run test:local-lifecycle", preflight]);
      const full = await run(["--profile", profile]);
      if (profile === LEGACY_PROFILE) {
        assert.notEqual(full.result.status, 0);
        assert.deepEqual(full.calls, []);
      } else {
        assert.equal(full.result.status, 0);
        assert.deepEqual(full.calls, ["--prefix frontend run test:local-lifecycle", preflight, "run local:deploy",
          "run validate:deployment -- 31337", "run verify:deployment:onchain -- 31337",
          `--prefix frontend run smoke:local:lifecycle -- --profile ${profile}`]);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Artifact fixtures exercise decoding layout before smoke creates any wallet.
function parameterArtifact(functionName, width) {
  const components = [
    ["bidbackFeeBps", "uint16"], ["redistributionBps", "uint16"], ["minParticipants", "uint16"],
    ["alphaBps", "uint16"], ["betaBps", "uint16"], ["gammaBps", "uint16"], ["minBidIncrementBps", "uint16"],
    ["perUserRewardCapBps", "uint16"], ["maxParticipants", "uint16"], ["maxInteractionCount", "uint16"],
    ["minAuctionDuration", "uint64"], ["antiSnipeWindow", "uint64"], ["antiSnipeExtension", "uint64"],
    ["maxAntiSnipeExtensions", "uint8"], ["minExposure", "uint64"], ["minPremiumNet", "uint256"],
    ["efCap", "uint256"], ["etCap", "uint256"], ["iiCap", "uint256"], ["rankSoftness", "uint16"]
  ].slice(0, width).map(([name, type]) => ({ name, type, internalType: type }));
  return [{ type: "function", name: functionName, stateMutability: "view",
    inputs: functionName === "params" ? [] : [{ name: "auctionId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", internalType: "struct ParamsController.Params", components }] }];
}

test("new cycles reject either legacy artifact before wallet creation, including crossed artifact versions", () => {
  for (const [auctionWidth, controllerWidth] of [[19, 19], [19, 20], [20, 19]]) {
    const artifacts = [parameterArtifact("getAuctionParams", auctionWidth), parameterArtifact("params", controllerWidth)];
    assert.throws(() => artifacts.map((abi, index) => normalizeLifecycleParameterAbi(abi,
      index === 0 ? "getAuctionParams" : "params", AMOUNT_RANK_PROFILE)), /artifact field count/);
  }
  const artifacts = [parameterArtifact("getAuctionParams", 20), parameterArtifact("params", 20)];
  for (const [index, abi] of artifacts.entries()) {
    const normalized = normalizeLifecycleParameterAbi(abi, index === 0 ? "getAuctionParams" : "params", AMOUNT_RANK_PROFILE);
    assert.equal(normalized[0].outputs[0].components.length, 20);
    assert.equal(normalized[0].outputs[0].components[19].name, "rankSoftness");
  }
});

test("legacy normalizes only recognized 19/20-field artifacts without mutating their source", () => {
  for (const name of ["params", "getAuctionParams"]) {
    for (const width of [19, 20]) {
      const original = parameterArtifact(name, width);
      original.push({ type: "function", name: "unrelated", stateMutability: "view", inputs: [], outputs: [] });
      const before = structuredClone(original);
      const normalized = normalizeLifecycleParameterAbi(original, name, LEGACY_PROFILE);
      assert.deepEqual(original, before);
      assert.equal(normalized[0].outputs[0].components.length, 19);
      assert.deepEqual(normalized[0].outputs[0].components, before[0].outputs[0].components.slice(0, 19));
      assert.equal(normalized[1], original[1]);
      normalized[0].outputs[0].components[0].name = "changed";
      assert.deepEqual(original, before);
    }
  }
});

test("both profiles reject malformed artifact signatures, tuples, field names, widths and scalar types", () => {
  const mutations = [
    (abi) => { abi.length = 0; }, (abi) => { abi.push(structuredClone(abi[0])); },
    (abi) => { abi[0].stateMutability = "nonpayable"; },
    (abi) => { abi[0].inputs = [{ name: "auctionId", type: "uint128" }]; },
    (abi) => { abi[0].outputs[0].type = "tuple[]"; },
    (abi) => { abi[0].outputs.push({ type: "uint256", name: "extra" }); },
    (abi) => { abi[0].outputs[0].components.pop(); abi[0].outputs[0].components.pop(); },
    (abi) => { abi[0].outputs[0].components.push({ name: "unknown", type: "uint256" }); },
    (abi) => { abi[0].outputs[0].components[0].name = "unknown"; },
    (abi) => { abi[0].outputs[0].components[0].type = "uint256"; },
    (abi) => { abi[0].outputs[0].components[19].name = "assumedSoftness"; },
    (abi) => { abi[0].outputs[0].components[19].type = "uint256"; },
    (abi) => { abi[0].outputs[0].components[0].components = []; },
    (abi) => { const fields = abi[0].outputs[0].components; [fields[0], fields[1]] = [fields[1], fields[0]]; }
  ];
  for (const profile of [LEGACY_PROFILE, AMOUNT_RANK_PROFILE]) {
    for (const name of ["params", "getAuctionParams"]) {
      for (const mutate of mutations) {
        const abi = parameterArtifact(name, 20); mutate(abi);
        assert.throws(() => normalizeLifecycleParameterAbi(abi, name, profile));
      }
    }
  }
});
