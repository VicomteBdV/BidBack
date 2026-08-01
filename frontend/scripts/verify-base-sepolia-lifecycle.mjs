#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicClient, getAddress, http, isAddress } from "viem";
import { assertValidDeploymentJson, coreContractKeys } from "./deployment-json-validator.mjs";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BPS = 10_000n;
export const WEI = 10n ** 18n;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const PHASES = [
  "before-create",
  "after-create",
  "after-bid-a",
  "after-bid-b",
  "after-step-up",
  "after-finalize",
  "after-nft-claim",
  "after-refund",
  "after-reward",
  "after-seller-withdraw",
  "final"
];

const START_PRICE = 10n ** 16n;
const BID_A_INITIAL = 12n * 10n ** 15n;
const BID_B = 15n * 10n ** 15n;
const BID_A_FINAL = 3n * 10n ** 16n;
const STEP_UP_VALUE = 18n * 10n ** 15n;
const AUCTION_DURATION = 7_200n;

const expectedParams = {
  bidbackFeeBps: "500",
  redistributionBps: "5000",
  minParticipants: "2",
  alphaBps: "6000",
  betaBps: "3000",
  gammaBps: "1000",
  minBidIncrementBps: "500",
  perUserRewardCapBps: "4000",
  maxParticipants: "64",
  maxInteractionCount: "5",
  minAuctionDuration: "3600",
  antiSnipeWindow: "600",
  antiSnipeExtension: "600",
  maxAntiSnipeExtensions: "6",
  minExposure: "300",
  minPremiumNet: (WEI / 100n).toString(),
  efCap: WEI.toString(),
  etCap: WEI.toString(),
  iiCap: WEI.toString()
};

const ownableAbi = [{
  type: "function", name: "owner", stateMutability: "view", inputs: [],
  outputs: [{ name: "", type: "address" }]
}];

const auctionHouseAbi = [
  { type: "function", name: "nextAuctionId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "feeRecipient", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "nftVault", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "escrowVault", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "distributionVault", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "paramsController", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "reputationAdapter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "function", name: "getAuction", stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "auction", type: "tuple", components: [
      { name: "seller", type: "address" }, { name: "nft", type: "address" },
      { name: "tokenId", type: "uint256" }, { name: "startPrice", type: "uint256" },
      { name: "startTime", type: "uint64" }, { name: "initialEndTime", type: "uint64" },
      { name: "endTime", type: "uint64" }, { name: "extensionsUsed", type: "uint8" },
      { name: "state", type: "uint8" }, { name: "highestBidder", type: "address" },
      { name: "highestBid", type: "uint256" }, { name: "participantCount", type: "uint256" },
      { name: "bidCount", type: "uint256" }, { name: "nftClaimed", type: "bool" }
    ] }]
  },
  {
    type: "function", name: "getAuctionParams", stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [
      { name: "bidbackFeeBps", type: "uint16" }, { name: "redistributionBps", type: "uint16" },
      { name: "minParticipants", type: "uint16" }, { name: "alphaBps", type: "uint16" },
      { name: "betaBps", type: "uint16" }, { name: "gammaBps", type: "uint16" },
      { name: "minBidIncrementBps", type: "uint16" }, { name: "perUserRewardCapBps", type: "uint16" },
      { name: "maxParticipants", type: "uint16" }, { name: "maxInteractionCount", type: "uint16" },
      { name: "minAuctionDuration", type: "uint64" }, { name: "antiSnipeWindow", type: "uint64" },
      { name: "antiSnipeExtension", type: "uint64" }, { name: "maxAntiSnipeExtensions", type: "uint8" },
      { name: "minExposure", type: "uint64" }, { name: "minPremiumNet", type: "uint256" },
      { name: "efCap", type: "uint256" }, { name: "etCap", type: "uint256" }, { name: "iiCap", type: "uint256" }
    ] }]
  },
  { type: "function", name: "getAuctionFeeRecipient", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  {
    type: "function", name: "getAuctionModules", stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [
      { name: "nftVault", type: "address" }, { name: "escrowVault", type: "address" },
      { name: "distributionVault", type: "address" }, { name: "reputationAdapter", type: "address" }
    ] }]
  },
  { type: "function", name: "getParticipants", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "", type: "address[]" }] },
  { type: "function", name: "getBidCount", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function", name: "getBid", stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }, { name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "bidder", type: "address" }, { name: "amount", type: "uint256" }, { name: "timestamp", type: "uint64" }
    ] }]
  }
];

const paramsAbi = [
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  auctionHouseAbi.find((item) => item.name === "getAuctionParams") && {
    ...auctionHouseAbi.find((item) => item.name === "getAuctionParams"),
    name: "params", inputs: []
  }
].filter(Boolean);

const vaultAbi = [{ type: "function", name: "auctionHouse", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] }];

const nftVaultAbi = [
  ...vaultAbi,
  {
    type: "function", name: "locks", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [{ name: "nft", type: "address" }, { name: "tokenId", type: "uint256" },
      { name: "seller", type: "address" }, { name: "locked", type: "bool" }, { name: "released", type: "bool" }]
  }
];

const escrowAbi = [
  ...vaultAbi,
  { type: "function", name: "capOf", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }, { name: "bidder", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "refundableAmount", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }, { name: "bidder", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "refundClaimed", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }, { name: "bidder", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "sellerCredits", stateMutability: "view", inputs: [{ name: "seller", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "protocolFeeCredits", stateMutability: "view", inputs: [{ name: "recipient", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function", name: "settlements", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [{ name: "finalized", type: "bool" }, { name: "winner", type: "address" },
      { name: "distributionVault", type: "address" }, { name: "finalPrice", type: "uint256" },
      { name: "sellerProceeds", type: "uint256" }, { name: "feeAmount", type: "uint256" },
      { name: "distributionReserve", type: "uint256" }]
  }
];

const distributionAbi = [
  ...vaultAbi,
  { type: "function", name: "distributions", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "opened", type: "bool" }, { name: "totalAssigned", type: "uint256" }, { name: "totalClaimed", type: "uint256" }] },
  { type: "function", name: "entitlementOf", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }, { name: "recipient", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "claimed", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }, { name: "recipient", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "escrowForAuction", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "", type: "address" }] }
];

const erc721Abi = [
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "getApproved", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }] }
];

const reputationAbi = [{ type: "function", name: "reputationBps", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] }];

export class LifecycleVerificationError extends Error {
  constructor(step, expected, observed) {
    super(`[FAIL] ${step}: expected ${format(expected)}, observed ${format(observed)}`);
    this.name = "LifecycleVerificationError";
    this.step = step;
    this.expected = expected;
    this.observed = observed;
  }
}

function format(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function field(tuple, key, index) {
  return Array.isArray(tuple) ? tuple[index] : tuple?.[key];
}

function decimal(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return BigInt(value).toString();
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value).toString();
  throw new LifecycleVerificationError("decimal serialization", "bigint-compatible value", value);
}

function normalizedAddress(value) {
  return String(value).toLowerCase();
}

export function assertObserved(step, observed, expected) {
  const normalizedObserved = typeof observed === "string" && observed.startsWith("0x")
    ? normalizedAddress(observed) : observed;
  const normalizedExpected = typeof expected === "string" && expected.startsWith("0x")
    ? normalizedAddress(expected) : expected;
  if (normalizedObserved !== normalizedExpected) {
    throw new LifecycleVerificationError(step, expected, observed);
  }
}

export function assertBaseSepoliaChainId(chainId) {
  assertObserved("RPC chain ID", Number(chainId), BASE_SEPOLIA_CHAIN_ID);
}

export function validateDistinctRoleAddresses(roles) {
  const entries = ["owner", "seller", "feeRecipient", "bidderA", "bidderB"].map((role) => {
    const value = roles[role];
    if (!isAddress(value)) throw new LifecycleVerificationError(`role address ${role}`, "valid address", value);
    return [role, getAddress(value)];
  });
  const unique = new Set(entries.map(([, value]) => value.toLowerCase()));
  assertObserved("five distinct role addresses", unique.size, 5);
  return Object.fromEntries(entries);
}

export function calculateCanonicalEconomics() {
  const grossPremium = BID_A_FINAL - START_PRICE;
  const protocolFee = (grossPremium * 500n) / BPS;
  const netPremium = grossPremium - protocolFee;
  const candidateDistribution = (netPremium * 5_000n) / BPS;
  const perUserCap = (candidateDistribution * 4_000n) / BPS;
  const rewardBidderB = candidateDistribution < perUserCap ? candidateDistribution : perUserCap;
  return {
    startPrice: START_PRICE,
    bidderAInitialCap: BID_A_INITIAL,
    bidderBCap: BID_B,
    bidderAFinalCap: BID_A_FINAL,
    stepUpValue: STEP_UP_VALUE,
    grossPremium,
    protocolFee,
    netPremium,
    candidateDistribution,
    rewardBidderB,
    sellerProceeds: BID_A_FINAL - protocolFee - rewardBidderB,
    refundBidderB: BID_B,
    totalDeposits: BID_A_FINAL + BID_B
  };
}

function getPath(source, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], source);
}

function expectedAuctionState(phase, roles, manifest, auctionId, nft, tokenId) {
  const rank = PHASES.indexOf(phase);
  if (rank < 0) throw new LifecycleVerificationError("phase", PHASES, phase);
  const economics = calculateCanonicalEconomics();
  const expected = [
    ["chainId", String(BASE_SEPOLIA_CHAIN_ID)],
    ["nextAuctionId", (BigInt(auctionId) + (rank === 0 ? 0n : 1n)).toString()],
    ["nft.owner", rank >= 6 ? roles.bidderA : rank >= 1 ? manifest.contracts.nftVault : roles.seller],
    ["escrow.balance", (rank < 2 ? 0n : rank === 2 ? BID_A_INITIAL : rank === 3 ? BID_A_INITIAL + BID_B : rank < 7 ? economics.totalDeposits : rank === 7 ? BID_A_FINAL : rank === 8 ? economics.sellerProceeds + economics.protocolFee : rank === 9 ? economics.protocolFee : 0n).toString()]
  ];
  if (rank === 0) {
    expected.push(["nft.approved", manifest.contracts.nftVault]);
    return expected;
  }

  const bidCount = rank < 2 ? 0 : rank === 2 ? 1 : rank === 3 ? 2 : 3;
  const participantCount = rank < 2 ? 0 : rank === 2 ? 1 : 2;
  const highestBidder = rank < 2 ? ZERO_ADDRESS : rank === 2 ? roles.bidderA : rank === 3 ? roles.bidderB : roles.bidderA;
  const highestBid = rank < 2 ? 0n : rank === 2 ? BID_A_INITIAL : rank === 3 ? BID_B : BID_A_FINAL;
  expected.push(
    ["auction.seller", roles.seller], ["auction.nft", nft], ["auction.tokenId", BigInt(tokenId).toString()],
    ["auction.startPrice", START_PRICE.toString()], ["auction.duration", AUCTION_DURATION.toString()],
    ["auction.extensionsUsed", "0"], ["auction.state", rank >= 5 ? "2" : "0"],
    ["auction.highestBidder", highestBidder], ["auction.highestBid", highestBid.toString()],
    ["auction.participantCount", String(participantCount)], ["auction.bidCount", String(bidCount)],
    ["participants.length", participantCount], ["bids.length", bidCount],
    ["auction.nftClaimed", rank >= 6], ["auction.feeRecipient", roles.feeRecipient],
    ["auction.modules.nftVault", manifest.contracts.nftVault],
    ["auction.modules.escrowVault", manifest.contracts.escrowVault],
    ["auction.modules.distributionVault", manifest.contracts.distributionVault],
    ["auction.modules.reputationAdapter", manifest.contracts.reputationAdapter],
    ["caps.bidderA", (rank < 2 ? 0n : rank < 4 ? BID_A_INITIAL : BID_A_FINAL).toString()],
    ["caps.bidderB", (rank < 3 ? 0n : BID_B).toString()],
    ["lock.nft", nft], ["lock.tokenId", BigInt(tokenId).toString()], ["lock.seller", roles.seller],
    ["lock.locked", rank < 6], ["lock.released", rank >= 6]
  );
  for (const [key, value] of Object.entries(expectedParams)) expected.push([`auction.params.${key}`, value]);
  if (participantCount >= 1) expected.push(["participants.0", roles.bidderA]);
  if (participantCount >= 2) expected.push(["participants.1", roles.bidderB]);
  if (bidCount >= 1) expected.push(["bids.0.bidder", roles.bidderA], ["bids.0.amount", BID_A_INITIAL.toString()]);
  if (bidCount >= 2) expected.push(["bids.1.bidder", roles.bidderB], ["bids.1.amount", BID_B.toString()]);
  if (bidCount >= 3) expected.push(["bids.2.bidder", roles.bidderA], ["bids.2.amount", BID_A_FINAL.toString()]);

  const finalized = rank >= 5;
  expected.push(["settlement.finalized", finalized], ["distribution.opened", finalized]);
  if (finalized) {
    expected.push(
      ["settlement.winner", roles.bidderA], ["settlement.distributionVault", manifest.contracts.distributionVault],
      ["settlement.finalPrice", BID_A_FINAL.toString()], ["settlement.sellerProceeds", economics.sellerProceeds.toString()],
      ["settlement.feeAmount", economics.protocolFee.toString()],
      ["settlement.distributionReserve", (rank >= 8 ? 0n : economics.rewardBidderB).toString()],
      ["refunds.bidderA.amount", "0"], ["refunds.bidderB.amount", economics.refundBidderB.toString()],
      ["refunds.bidderB.claimed", rank >= 7],
      ["rewards.bidderA.entitlement", "0"], ["rewards.bidderB.entitlement", economics.rewardBidderB.toString()],
      ["rewards.bidderB.claimed", rank >= 8],
      ["distribution.totalAssigned", economics.rewardBidderB.toString()],
      ["distribution.totalClaimed", (rank >= 8 ? economics.rewardBidderB : 0n).toString()],
      ["distribution.escrow", manifest.contracts.escrowVault],
      ["credits.seller", (rank >= 9 ? 0n : economics.sellerProceeds).toString()],
      ["credits.feeRecipient", (rank >= 10 ? 0n : economics.protocolFee).toString()]
    );
  }
  return expected;
}

export function assertLifecyclePhase(snapshot, context) {
  for (const [pathName, expected] of expectedAuctionState(
    context.phase, context.roles, context.manifest, context.auctionId, context.nft, context.tokenId
  )) {
    const observed = getPath(snapshot, pathName);
    if (observed === undefined || observed === null) {
      throw new LifecycleVerificationError(pathName, expected, "missing");
    }
    assertObserved(pathName, observed, expected);
  }
  return snapshot;
}

function serializeParams(raw) {
  const keys = Object.keys(expectedParams);
  return Object.fromEntries(keys.map((key, index) => [key, decimal(field(raw, key, index))]));
}

function serializeAuction(raw) {
  const startTime = BigInt(field(raw, "startTime", 4));
  const initialEndTime = BigInt(field(raw, "initialEndTime", 5));
  return {
    seller: field(raw, "seller", 0), nft: field(raw, "nft", 1), tokenId: decimal(field(raw, "tokenId", 2)),
    startPrice: decimal(field(raw, "startPrice", 3)), startTime: startTime.toString(),
    initialEndTime: initialEndTime.toString(), endTime: decimal(field(raw, "endTime", 6)),
    duration: (initialEndTime - startTime).toString(), extensionsUsed: decimal(field(raw, "extensionsUsed", 7)),
    state: decimal(field(raw, "state", 8)), highestBidder: field(raw, "highestBidder", 9),
    highestBid: decimal(field(raw, "highestBid", 10)), participantCount: decimal(field(raw, "participantCount", 11)),
    bidCount: decimal(field(raw, "bidCount", 12)), nftClaimed: Boolean(field(raw, "nftClaimed", 13))
  };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Arguments must use --name value pairs.");
    }
    values[key.slice(2)] = value;
  }
  const required = ["rpc-url", "auction-id", "owner", "seller", "fee-recipient", "bidder-a", "bidder-b", "nft", "token-id", "phase", "manifest"];
  for (const key of required) if (!values[key]) throw new Error(`Missing --${key}.`);
  if (!/^\d+$/.test(values["auction-id"]) || BigInt(values["auction-id"]) < 1n) throw new Error("--auction-id must be positive.");
  if (!/^\d+$/.test(values["token-id"])) throw new Error("--token-id must be non-negative.");
  if (!PHASES.includes(values.phase)) throw new Error(`--phase must be one of: ${PHASES.join(", ")}.`);
  return values;
}

async function readDeploymentChecks(client, manifest, roles) {
  const contracts = manifest.contracts;
  for (const key of coreContractKeys) {
    const code = await client.getBytecode({ address: contracts[key] });
    if (!code || code === "0x") throw new LifecycleVerificationError(`bytecode ${key}`, "present", code ?? "missing");
  }
  const owners = {};
  for (const key of coreContractKeys) {
    owners[key] = await client.readContract({ address: contracts[key], abi: ownableAbi, functionName: "owner" });
    assertObserved(`owner ${key}`, owners[key], roles.owner);
  }
  const [feeRecipient, nftVault, escrowVault, distributionVault, paramsController, reputationAdapter, paused, params] = await Promise.all([
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "feeRecipient" }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "nftVault" }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "escrowVault" }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "distributionVault" }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "paramsController" }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "reputationAdapter" }),
    client.readContract({ address: contracts.paramsController, abi: paramsAbi, functionName: "paused" }),
    client.readContract({ address: contracts.paramsController, abi: paramsAbi, functionName: "params" })
  ]);
  assertObserved("global fee recipient", feeRecipient, roles.feeRecipient);
  for (const [name, observed] of Object.entries({ nftVault, escrowVault, distributionVault, paramsController, reputationAdapter })) {
    assertObserved(`AuctionHouse.${name}`, observed, contracts[name]);
  }
  for (const key of ["nftVault", "escrowVault", "distributionVault"]) {
    const observed = await client.readContract({ address: contracts[key], abi: vaultAbi, functionName: "auctionHouse" });
    assertObserved(`${key}.auctionHouse`, observed, contracts.auctionHouse);
  }
  assertObserved("ParamsController.paused", paused, false);
  const serializedParams = serializeParams(params);
  for (const [key, value] of Object.entries(expectedParams)) assertObserved(`Params.${key}`, serializedParams[key], value);
  return { owners, feeRecipient, paused, params: serializedParams };
}

async function readLifecycleSnapshot(client, manifest, context) {
  const contracts = manifest.contracts;
  const auctionId = BigInt(context.auctionId);
  const tokenId = BigInt(context.tokenId);
  const [nextAuctionId, nftOwner, nftApproval, escrowBalance] = await Promise.all([
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "nextAuctionId" }),
    client.readContract({ address: context.nft, abi: erc721Abi, functionName: "ownerOf", args: [tokenId] }),
    client.readContract({ address: context.nft, abi: erc721Abi, functionName: "getApproved", args: [tokenId] }),
    client.getBalance({ address: contracts.escrowVault })
  ]);
  const snapshot = {
    chainId: String(BASE_SEPOLIA_CHAIN_ID), phase: context.phase, nextAuctionId: nextAuctionId.toString(),
    roles: context.roles, nft: { address: context.nft, tokenId: tokenId.toString(), owner: nftOwner, approved: nftApproval },
    escrow: { balance: escrowBalance.toString() }
  };
  if (context.phase === "before-create") return snapshot;

  const [auctionRaw, paramsRaw, feeRecipient, modulesRaw, participants, bidCount, capA, capB, lockRaw,
    settlementRaw, refundA, refundB, refundClaimedA, refundClaimedB, distributionRaw, entitlementA,
    entitlementB, claimedA, claimedB, distributionEscrow, sellerCredit, feeCredit, reputationB] = await Promise.all([
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getAuction", args: [auctionId] }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getAuctionParams", args: [auctionId] }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getAuctionFeeRecipient", args: [auctionId] }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getAuctionModules", args: [auctionId] }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getParticipants", args: [auctionId] }),
    client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getBidCount", args: [auctionId] }),
    client.readContract({ address: contracts.escrowVault, abi: escrowAbi, functionName: "capOf", args: [auctionId, context.roles.bidderA] }),
    client.readContract({ address: contracts.escrowVault, abi: escrowAbi, functionName: "capOf", args: [auctionId, context.roles.bidderB] }),
    client.readContract({ address: contracts.nftVault, abi: nftVaultAbi, functionName: "locks", args: [auctionId] }),
    client.readContract({ address: contracts.escrowVault, abi: escrowAbi, functionName: "settlements", args: [auctionId] }),
    client.readContract({ address: contracts.escrowVault, abi: escrowAbi, functionName: "refundableAmount", args: [auctionId, context.roles.bidderA] }),
    client.readContract({ address: contracts.escrowVault, abi: escrowAbi, functionName: "refundableAmount", args: [auctionId, context.roles.bidderB] }),
    client.readContract({ address: contracts.escrowVault, abi: escrowAbi, functionName: "refundClaimed", args: [auctionId, context.roles.bidderA] }),
    client.readContract({ address: contracts.escrowVault, abi: escrowAbi, functionName: "refundClaimed", args: [auctionId, context.roles.bidderB] }),
    client.readContract({ address: contracts.distributionVault, abi: distributionAbi, functionName: "distributions", args: [auctionId] }),
    client.readContract({ address: contracts.distributionVault, abi: distributionAbi, functionName: "entitlementOf", args: [auctionId, context.roles.bidderA] }),
    client.readContract({ address: contracts.distributionVault, abi: distributionAbi, functionName: "entitlementOf", args: [auctionId, context.roles.bidderB] }),
    client.readContract({ address: contracts.distributionVault, abi: distributionAbi, functionName: "claimed", args: [auctionId, context.roles.bidderA] }),
    client.readContract({ address: contracts.distributionVault, abi: distributionAbi, functionName: "claimed", args: [auctionId, context.roles.bidderB] }),
    client.readContract({ address: contracts.distributionVault, abi: distributionAbi, functionName: "escrowForAuction", args: [auctionId] }),
    client.readContract({ address: contracts.escrowVault, abi: escrowAbi, functionName: "sellerCredits", args: [context.roles.seller] }),
    client.readContract({ address: contracts.escrowVault, abi: escrowAbi, functionName: "protocolFeeCredits", args: [context.roles.feeRecipient] }),
    client.readContract({ address: contracts.reputationAdapter, abi: reputationAbi, functionName: "reputationBps", args: [context.roles.bidderB] })
  ]);
  assertObserved("bidder B reputation", decimal(reputationB), "10000");
  const auction = serializeAuction(auctionRaw);
  auction.params = serializeParams(paramsRaw);
  auction.feeRecipient = feeRecipient;
  auction.modules = {
    nftVault: field(modulesRaw, "nftVault", 0), escrowVault: field(modulesRaw, "escrowVault", 1),
    distributionVault: field(modulesRaw, "distributionVault", 2), reputationAdapter: field(modulesRaw, "reputationAdapter", 3)
  };
  const bids = [];
  if (BigInt(bidCount) > 3n) throw new LifecycleVerificationError("bounded bid count", "at most 3", bidCount);
  for (let index = 0n; index < BigInt(bidCount); index += 1n) {
    const raw = await client.readContract({ address: contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getBid", args: [auctionId, index] });
    bids.push({ bidder: field(raw, "bidder", 0), amount: decimal(field(raw, "amount", 1)), timestamp: decimal(field(raw, "timestamp", 2)) });
  }
  return {
    ...snapshot, auction, participants, bids,
    caps: { bidderA: decimal(capA), bidderB: decimal(capB) },
    lock: { nft: field(lockRaw, "nft", 0), tokenId: decimal(field(lockRaw, "tokenId", 1)), seller: field(lockRaw, "seller", 2), locked: Boolean(field(lockRaw, "locked", 3)), released: Boolean(field(lockRaw, "released", 4)) },
    settlement: { finalized: Boolean(field(settlementRaw, "finalized", 0)), winner: field(settlementRaw, "winner", 1), distributionVault: field(settlementRaw, "distributionVault", 2), finalPrice: decimal(field(settlementRaw, "finalPrice", 3)), sellerProceeds: decimal(field(settlementRaw, "sellerProceeds", 4)), feeAmount: decimal(field(settlementRaw, "feeAmount", 5)), distributionReserve: decimal(field(settlementRaw, "distributionReserve", 6)) },
    refunds: { bidderA: { amount: decimal(refundA), claimed: refundClaimedA }, bidderB: { amount: decimal(refundB), claimed: refundClaimedB } },
    rewards: { bidderA: { entitlement: decimal(entitlementA), claimed: claimedA }, bidderB: { entitlement: decimal(entitlementB), claimed: claimedB } },
    distribution: { opened: Boolean(field(distributionRaw, "opened", 0)), totalAssigned: decimal(field(distributionRaw, "totalAssigned", 1)), totalClaimed: decimal(field(distributionRaw, "totalClaimed", 2)), escrow: distributionEscrow },
    credits: { seller: decimal(sellerCredit), feeRecipient: decimal(feeCredit) },
    escrow: { balance: escrowBalance.toString() }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const roles = validateDistinctRoleAddresses({ owner: args.owner, seller: args.seller, feeRecipient: args["fee-recipient"], bidderA: args["bidder-a"], bidderB: args["bidder-b"] });
  if (!isAddress(args.nft)) throw new LifecycleVerificationError("NFT address", "valid address", args.nft);
  const manifestPath = path.resolve(args.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assertValidDeploymentJson(manifest, BASE_SEPOLIA_CHAIN_ID);
  const chain = { id: BASE_SEPOLIA_CHAIN_ID, name: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [args["rpc-url"]] } } };
  const client = createPublicClient({ chain, transport: http(args["rpc-url"]) });
  assertBaseSepoliaChainId(await client.getChainId());
  console.log("[OK] Base Sepolia chain ID");
  const nftCode = await client.getBytecode({ address: getAddress(args.nft) });
  if (!nftCode || nftCode === "0x") throw new LifecycleVerificationError("NFT bytecode", "present", nftCode ?? "missing");
  console.log("[OK] NFT bytecode");
  const deployment = await readDeploymentChecks(client, manifest, roles);
  console.log("[OK] Deployment bytecode, ownership, parameters and wiring");
  const context = { phase: args.phase, roles, manifest, auctionId: args["auction-id"], nft: getAddress(args.nft), tokenId: args["token-id"] };
  const lifecycle = await readLifecycleSnapshot(client, manifest, context);
  assertLifecyclePhase(lifecycle, context);
  console.log(`[OK] Lifecycle phase ${args.phase}`);
  const output = { generatedAt: new Date().toISOString(), manifestPath, deployment, lifecycle };
  if (args.output) {
    await writeFile(path.resolve(args.output), `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
    console.log(`[OK] Snapshot written to ${path.resolve(args.output)}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

const invokedAsScript = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message.startsWith("[FAIL]") ? message : `[FAIL] verifier: ${message}`);
    process.exitCode = 1;
  });
}
