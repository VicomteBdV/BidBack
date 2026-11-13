import { encodeFunctionData } from "viem";
import { assertValidDeploymentJson, coreContractKeys } from "./deployment-json-validator.mjs";

export const LOCAL_ANVIL_CHAIN_ID = 31337;
export const BPS = 10_000n;
export const WEI_PER_ETH = 10n ** 18n;

const REQUIRED_LOCAL_CONTRACT_KEYS = [...coreContractKeys, "localNft"];

export class LifecycleSmokeError extends Error {
  constructor(step, expected, observed) {
    super(`[FAIL] ${step}: expected ${formatObserved(expected)}, observed ${formatObserved(observed)}`);
    this.name = "LifecycleSmokeError";
    this.step = step;
    this.expected = expected;
    this.observed = observed;
  }
}

function formatObserved(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeRpcChainId(value) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^(?:0x[0-9a-f]+|\d+)$/i.test(value)) {
    const parsed = Number.parseInt(value, value.toLowerCase().startsWith("0x") ? 16 : 10);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new LifecycleSmokeError("RPC chain ID", LOCAL_ANVIL_CHAIN_ID, value);
}

export function assertLocalChainId(value) {
  const chainId = normalizeRpcChainId(value);
  assertEqual("RPC chain ID", chainId, LOCAL_ANVIL_CHAIN_ID);
  return chainId;
}

export function assertLoopbackRpcUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new LifecycleSmokeError("RPC URL", "a valid loopback HTTP URL", value);
  }

  const hostname = parsed.hostname.toLowerCase();
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  const supportedProtocol = parsed.protocol === "http:" || parsed.protocol === "https:";

  if (!loopback || !supportedProtocol || parsed.username || parsed.password) {
    throw new LifecycleSmokeError("RPC URL", "a credential-free loopback HTTP URL", value);
  }

  return parsed.toString();
}

export function validateLocalDeployment(payload) {
  try {
    assertValidDeploymentJson(payload, LOCAL_ANVIL_CHAIN_ID);
  } catch (error) {
    throw new LifecycleSmokeError(
      "deployment JSON",
      "valid local deployment on chain 31337",
      error instanceof Error ? error.message : String(error)
    );
  }

  for (const key of REQUIRED_LOCAL_CONTRACT_KEYS) {
    if (!payload.contracts?.[key]) {
      throw new LifecycleSmokeError("deployment contracts", key, "missing");
    }
  }

  return payload;
}

export function assertEqual(step, observed, expected) {
  if (observed !== expected) {
    throw new LifecycleSmokeError(step, expected, observed);
  }
  return observed;
}

export function assertAddressEqual(step, observed, expected) {
  return assertEqual(step, String(observed).toLowerCase(), String(expected).toLowerCase());
}

export function assertTrue(step, observed) {
  if (!observed) throw new LifecycleSmokeError(step, true, observed);
}

export function toBigInt(value, step = "bigint conversion") {
  try {
    return typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new LifecycleSmokeError(step, "a bigint-compatible value", value);
  }
}

export function tupleValue(tuple, key, index) {
  if (Array.isArray(tuple)) return tuple[index];
  return tuple?.[key];
}

export function paramsFromTuple(raw, profile = LEGACY_PROFILE) {
  assertLifecycleProfile(profile);
  const params = {
    bidbackFeeBps: toBigInt(tupleValue(raw, "bidbackFeeBps", 0)),
    redistributionBps: toBigInt(tupleValue(raw, "redistributionBps", 1)),
    minParticipants: toBigInt(tupleValue(raw, "minParticipants", 2)),
    alphaBps: toBigInt(tupleValue(raw, "alphaBps", 3)),
    betaBps: toBigInt(tupleValue(raw, "betaBps", 4)),
    gammaBps: toBigInt(tupleValue(raw, "gammaBps", 5)),
    minBidIncrementBps: toBigInt(tupleValue(raw, "minBidIncrementBps", 6)),
    perUserRewardCapBps: toBigInt(tupleValue(raw, "perUserRewardCapBps", 7)),
    maxParticipants: toBigInt(tupleValue(raw, "maxParticipants", 8)),
    maxInteractionCount: toBigInt(tupleValue(raw, "maxInteractionCount", 9)),
    minAuctionDuration: toBigInt(tupleValue(raw, "minAuctionDuration", 10)),
    antiSnipeWindow: toBigInt(tupleValue(raw, "antiSnipeWindow", 11)),
    antiSnipeExtension: toBigInt(tupleValue(raw, "antiSnipeExtension", 12)),
    maxAntiSnipeExtensions: toBigInt(tupleValue(raw, "maxAntiSnipeExtensions", 13)),
    minExposure: toBigInt(tupleValue(raw, "minExposure", 14)),
    minPremiumNet: toBigInt(tupleValue(raw, "minPremiumNet", 15)),
    efCap: toBigInt(tupleValue(raw, "efCap", 16)),
    etCap: toBigInt(tupleValue(raw, "etCap", 17)),
    iiCap: toBigInt(tupleValue(raw, "iiCap", 18))
  };
  if (profile === AMOUNT_RANK_PROFILE) params.rankSoftness = assertRankSoftness(toBigInt(tupleValue(raw, "rankSoftness", 19)));
  return params;
}

export function assertExpectedLocalParams(label, params, profile = LEGACY_PROFILE) {
  assertLifecycleProfile(profile);
  const expected = {
    bidbackFeeBps: 500n,
    redistributionBps: 5_000n,
    minParticipants: 2n,
    alphaBps: 6_000n,
    betaBps: 3_000n,
    gammaBps: 1_000n,
    minBidIncrementBps: 500n,
    perUserRewardCapBps: 4_000n,
    maxParticipants: 64n,
    maxInteractionCount: 5n,
    minAuctionDuration: 60n * 60n,
    antiSnipeWindow: 10n * 60n,
    antiSnipeExtension: 10n * 60n,
    maxAntiSnipeExtensions: 6n,
    minExposure: 5n * 60n,
    minPremiumNet: WEI_PER_ETH / 100n,
    efCap: WEI_PER_ETH,
    etCap: WEI_PER_ETH,
    iiCap: WEI_PER_ETH
  };

  if (profile === AMOUNT_RANK_PROFILE) expected.rankSoftness = 4n;
  for (const [key, value] of Object.entries(expected)) {
    assertEqual(`${label}.${key}`, params[key], value);
  }
  return params;
}

export function mulDivDown(value, multiplier, denominator) {
  if (denominator === 0n) throw new LifecycleSmokeError("integer division", "non-zero denominator", 0);
  return (value * multiplier) / denominator;
}

export function calculateSingleLoserEconomics({
  startPrice,
  finalPrice,
  feeBps,
  redistributionBps,
  perUserRewardCapBps,
  minPremiumNet,
  participantCount,
  minParticipants,
  initialDuration,
  minAuctionDuration,
  winnerCap,
  losingCap
}) {
  const grossPremium = finalPrice > startPrice ? finalPrice - startPrice : 0n;
  const protocolFee = grossPremium === 0n ? 0n : mulDivDown(grossPremium, feeBps, BPS);
  const netPremium = grossPremium - protocolFee;
  const eligible =
    netPremium >= minPremiumNet &&
    participantCount >= minParticipants &&
    initialDuration >= minAuctionDuration;
  const candidateDistribution = eligible ? mulDivDown(netPremium, redistributionBps, BPS) : 0n;
  const perUserRewardCap = mulDivDown(candidateDistribution, perUserRewardCapBps, BPS);
  const assignedReward = candidateDistribution < perUserRewardCap ? candidateDistribution : perUserRewardCap;
  const sellerProceeds = finalPrice - protocolFee - assignedReward;
  const winnerSurplusRefund = winnerCap > finalPrice ? winnerCap - finalPrice : 0n;

  return {
    grossPremium,
    protocolFee,
    netPremium,
    candidateDistribution,
    assignedReward,
    sellerProceeds,
    losingRefund: losingCap,
    winnerSurplusRefund,
    totalDeposits: winnerCap + losingCap
  };
}

export function formatEth(value) {
  const amount = toBigInt(value, "ETH formatting");
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / WEI_PER_ETH;
  const fraction = (absolute % WEI_PER_ETH).toString().padStart(18, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""} ETH`;
}


// Tooling profiles are selected by input, never by an RPC result.
export const LEGACY_PROFILE = "legacy-capped-v1";
export const AMOUNT_RANK_PROFILE = "amount-rank-v1";
export const SCORE_SCALE = 1n << 136n;
export const MAX_AMOUNT = (1n << 112n) - 1n;
export const AMOUNT_RANK_IDENTITY = Object.freeze({
  formulaId: AMOUNT_RANK_PROFILE,
  arithmeticId: "floor-delta-q136-muldiv512-v1",
  roundingId: "hamilton-first-participation-v1",
  scoreScale: SCORE_SCALE.toString(),
  maxAmount: MAX_AMOUNT.toString()
});
const identityGetters = [
  ["formulaId", "FORMULA_ID", "string"], ["arithmeticId", "ARITHMETIC_ID", "string"],
  ["roundingId", "ROUNDING_ID", "string"], ["scoreScale", "SCORE_SCALE", "uint256"],
  ["maxAmount", "MAX_AMOUNT", "uint256"]
];
export const formulaIdentityAbi = identityGetters.map(([, name, type]) => ({
  type: "function", name, stateMutability: "view", inputs: [], outputs: [{ name: "", type }]
}));
export const bidderScoresAbi = [{ type: "function", name: "bidderScores", stateMutability: "view",
  inputs: [{ name: "auctionId", type: "uint256" }, { name: "bidder", type: "address" }],
  outputs: [{ name: "", type: "uint256" }] }];

export function assertLifecycleProfile(profile) {
  if (![LEGACY_PROFILE, AMOUNT_RANK_PROFILE].includes(profile)) {
    throw new LifecycleSmokeError("lifecycle profile", "an explicit supported profile", profile);
  }
  return profile;
}

export function assertFormulaIdentity(identity) {
  assertEqual("formula identity field count", Object.keys(identity ?? {}).length, 5);
  for (const [key, expected] of Object.entries(AMOUNT_RANK_IDENTITY)) {
    assertEqual(`formula identity ${key}`, identity?.[key], expected);
  }
  return identity;
}

export async function readFormulaIdentity(client, auctionHouse, blockNumber) {
  const values = await Promise.all(identityGetters.map(([, functionName]) =>
    client.readContract({ address: auctionHouse, abi: formulaIdentityAbi, functionName, blockNumber })));
  const identity = Object.fromEntries(identityGetters.map(([key, , type], index) => {
    assertEqual(`formula identity type ${key}`, typeof values[index], type === "string" ? "string" : "bigint");
    return [key, values[index].toString()];
  }));
  // Reported constants identify the selected rule; they do not verify bytecode.
  return assertFormulaIdentity(identity);
}

export async function assertParameterTupleWidths(client, contracts, auctionId, profile, blockNumber) {
  assertLifecycleProfile(profile);
  const bytes = profile === AMOUNT_RANK_PROFILE ? 640 : 608;
  for (const [to, name, inputs, args] of [
    [contracts.paramsController, "params", [], []],
    [contracts.auctionHouse, "getAuctionParams", [{ name: "auctionId", type: "uint256" }], [BigInt(auctionId)]]
  ]) {
    const abi = [{ type: "function", name, stateMutability: "view", inputs, outputs: [] }];
    const response = await client.call({ to, data: encodeFunctionData({ abi, functionName: name, args }), blockNumber });
    const data = response?.data;
    assertTrue(`${name} raw tuple data`, typeof data === "string" && /^0x[0-9a-f]*$/i.test(data));
    assertEqual(`${name} raw tuple bytes`, (data.length - 2) / 2, bytes);
  }
}

export function assertRankSoftness(h) {
  assertTrue("rankSoftness", typeof h === "bigint" && h >= 1n && h <= 65_535n);
  return h;
}

export function calculateAmountRankScores({ bids, bidderCount, h }) {
  assertRankSoftness(h);
  assertTrue("bounded participant count", Number.isInteger(bidderCount) && bidderCount >= 0 && bidderCount <= 256);
  const caps = Array(bidderCount).fill(0n);
  const scores = Array(bidderCount).fill(0n);
  const participants = [];
  for (const [index, bid] of bids.entries()) {
    const bidder = bid.bidderIndex;
    assertTrue("bidder index", Number.isInteger(bidder) && bidder >= 0 && bidder < bidderCount);
    assertTrue("bid cap", typeof bid.newCapWei === "bigint" && bid.newCapWei > caps[bidder] && bid.newCapWei <= MAX_AMOUNT);
    if (caps[bidder] === 0n) participants.push(bidder);
    scores[bidder] += (bid.newCapWei - caps[bidder]) * SCORE_SCALE * h / (h + BigInt(index));
    caps[bidder] = bid.newCapWei;
  }
  return { scores, caps, participants };
}

export function allocateAmountRankRewards({ scores, pool, winnerIndex, participants = scores.map((_, index) => index) }) {
  assertTrue("pool", typeof pool === "bigint" && pool >= 0n);
  assertTrue("bounded scores", scores.length <= 256 && scores.every((score) => typeof score === "bigint" && score >= 0n));
  assertTrue("winner index", Number.isInteger(winnerIndex) && winnerIndex >= 0 && (winnerIndex < scores.length || scores.length === 0 && winnerIndex === 0));
  assertTrue("participant order", new Set(participants).size === participants.length &&
    participants.every((index) => Number.isInteger(index) && index >= 0 && index < scores.length) &&
    scores.every((score, index) => score === 0n || participants.includes(index)));
  const losingScores = scores.map((score, index) => index === winnerIndex ? 0n : score);
  const denominator = losingScores.reduce((sum, score) => sum + score, 0n);
  const rewards = scores.map(() => 0n);
  const remainders = scores.map(() => 0n);
  if (pool === 0n || denominator === 0n) return { rewards, remainders, denominator, assigned: 0n, unallocated: pool };
  for (const index of participants) {
    rewards[index] = pool * losingScores[index] / denominator;
    remainders[index] = pool * losingScores[index] % denominator;
  }
  const originalRemainders = [...remainders];
  let residual = pool - rewards.reduce((sum, reward) => sum + reward, 0n);
  while (residual > 0n) {
    let best = -1;
    for (const index of participants) if (best === -1 || remainders[index] > remainders[best]) best = index;
    assertTrue("positive allocation remainder", best >= 0 && remainders[best] > 0n);
    rewards[best] += 1n;
    remainders[best] = 0n;
    residual -= 1n;
  }
  return { rewards, remainders: originalRemainders, denominator, assigned: pool, unallocated: 0n };
}

export function calculateAmountRankEconomics(input) {
  assertTrue("starting amount", typeof input.startPrice === "bigint" && input.startPrice >= 0n && input.startPrice <= MAX_AMOUNT);
  assertTrue("final amount", typeof input.finalPrice === "bigint" && input.finalPrice >= input.startPrice && input.finalPrice <= MAX_AMOUNT);
  const grossPremium = input.finalPrice - input.startPrice;
  const protocolFee = grossPremium === 0n ? 0n : mulDivDown(grossPremium, input.feeBps, BPS);
  const netPremium = grossPremium - protocolFee;
  const eligible = netPremium >= input.minPremiumNet && input.participantCount >= input.minParticipants &&
    input.initialDuration >= input.minAuctionDuration;
  const candidateDistribution = eligible ? mulDivDown(netPremium, input.redistributionBps, BPS) : 0n;
  const scored = calculateAmountRankScores(input);
  const allocation = allocateAmountRankRewards({ ...scored, pool: candidateDistribution, winnerIndex: input.winnerIndex });
  return { grossPremium, protocolFee, netPremium, candidateDistribution, assignedReward: allocation.assigned,
    sellerProceeds: input.finalPrice - protocolFee - allocation.assigned,
    losingRefund: input.losingCap, winnerSurplusRefund: input.winnerCap > input.finalPrice ? input.winnerCap - input.finalPrice : 0n,
    totalDeposits: input.winnerCap + input.losingCap, ...scored, ...allocation };
}

export function parseLocalLifecycleArgs(argv) {
  const preflightOnly = argv.includes("--preflight-only");
  const rest = argv.filter((arg) => arg !== "--preflight-only");
  assertTrue("local lifecycle arguments", argv.filter((arg) => arg === "--preflight-only").length <= 1 &&
    (rest.length === 2 && rest[0] === "--profile"));
  const profile = assertLifecycleProfile(rest[1]);
  return { preflightOnly, profile };
}

const parameterComponents = [
  ["bidbackFeeBps", "uint16"], ["redistributionBps", "uint16"], ["minParticipants", "uint16"],
  ["alphaBps", "uint16"], ["betaBps", "uint16"], ["gammaBps", "uint16"],
  ["minBidIncrementBps", "uint16"], ["perUserRewardCapBps", "uint16"], ["maxParticipants", "uint16"],
  ["maxInteractionCount", "uint16"], ["minAuctionDuration", "uint64"], ["antiSnipeWindow", "uint64"],
  ["antiSnipeExtension", "uint64"], ["maxAntiSnipeExtensions", "uint8"], ["minExposure", "uint64"],
  ["minPremiumNet", "uint256"], ["efCap", "uint256"], ["etCap", "uint256"], ["iiCap", "uint256"],
  ["rankSoftness", "uint16"]
];

export function normalizeLifecycleParameterAbi(abi, functionName, profile) {
  assertLifecycleProfile(profile);
  assertTrue("parameter ABI function", ["params", "getAuctionParams"].includes(functionName));
  assertTrue(`${functionName} artifact ABI`, Array.isArray(abi));
  const entries = abi.filter((entry) => entry?.type === "function" && entry.name === functionName);
  assertEqual(`${functionName} artifact function count`, entries.length, 1);
  const entry = entries[0];
  assertEqual(`${functionName} artifact mutability`, entry.stateMutability, "view");
  assertTrue(`${functionName} artifact inputs`, Array.isArray(entry.inputs) &&
    (functionName === "params" ? entry.inputs.length === 0 : entry.inputs.length === 1 && entry.inputs[0]?.type === "uint256"));
  assertTrue(`${functionName} artifact output tuple`, Array.isArray(entry.outputs) && entry.outputs.length === 1 &&
    entry.outputs[0]?.type === "tuple" && Array.isArray(entry.outputs[0].components));
  const components = entry.outputs[0].components;
  assertTrue(`${functionName} artifact field count`, components.length === 20 || profile === LEGACY_PROFILE && components.length === 19);
  for (const [index, component] of components.entries()) {
    const [name, type] = parameterComponents[index];
    assertEqual(`${functionName} artifact field ${index} name`, component?.name, name);
    assertEqual(`${functionName} artifact field ${index} type`, component?.type, type);
    assertTrue(`${functionName} artifact scalar field ${index}`, !Object.hasOwn(component, "components"));
  }
  // New cycles require both artifacts to decode all captured parameters before
  // any wallet exists. Legacy may use a recognized newer artifact, narrowed to
  // its historical ABI; the independent raw-return guard rejects a new target.
  const width = profile === LEGACY_PROFILE ? 19 : 20;
  const normalized = { ...entry, outputs: [{ ...entry.outputs[0], components: components.slice(0, width).map((component) => ({ ...component })) }] };
  return abi.map((item) => item === entry ? normalized : item);
}
