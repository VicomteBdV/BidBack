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

export function paramsFromTuple(raw) {
  return {
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
}

export function assertExpectedLocalParams(label, params) {
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
