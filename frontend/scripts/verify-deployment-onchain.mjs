#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";
import {
  DeploymentValidationError,
  assertValidDeploymentJson,
  coreContractKeys
} from "./deployment-json-validator.mjs";

const ANVIL_CHAIN_ID = 31337;
const BASIS_POINTS = 10_000n;
const PARAM_CAP_SCALE = 10n ** 18n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const contractLabels = {
  auctionHouse: "AuctionHouse",
  nftVault: "NFTVault",
  escrowVault: "EscrowVault",
  distributionVault: "DistributionVault",
  paramsController: "ParamsController",
  reputationAdapter: "ReputationAdapter",
  localNft: "LocalERC721"
};

const auctionHouseAbi = [
  {
    type: "function",
    name: "nextAuctionId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "feeRecipient",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "nftVault",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "escrowVault",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "distributionVault",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "paramsController",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "reputationAdapter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
];

const ownableAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
];

const vaultAuctionHouseAbi = [
  {
    type: "function",
    name: "auctionHouse",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
];

const paramsControllerAbi = [
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "params",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "bidbackFeeBps", type: "uint16" },
          { name: "redistributionBps", type: "uint16" },
          { name: "minParticipants", type: "uint16" },
          { name: "alphaBps", type: "uint16" },
          { name: "betaBps", type: "uint16" },
          { name: "gammaBps", type: "uint16" },
          { name: "minBidIncrementBps", type: "uint16" },
          { name: "perUserRewardCapBps", type: "uint16" },
          { name: "maxParticipants", type: "uint16" },
          { name: "maxInteractionCount", type: "uint16" },
          { name: "minAuctionDuration", type: "uint64" },
          { name: "antiSnipeWindow", type: "uint64" },
          { name: "antiSnipeExtension", type: "uint64" },
          { name: "maxAntiSnipeExtensions", type: "uint8" },
          { name: "minExposure", type: "uint64" },
          { name: "minPremiumNet", type: "uint256" },
          { name: "efCap", type: "uint256" },
          { name: "etCap", type: "uint256" },
          { name: "iiCap", type: "uint256" }
        ]
      }
    ]
  }
];

function parseChainId(value) {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error("Usage: npm run verify:deployment:onchain -- <chainId>");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("chainId must be a positive safe integer.");
  }

  return parsed;
}

function cleanEnv(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalAddressEnv(name) {
  const value = cleanEnv(process.env[name]);

  if (!value) return undefined;

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid Ethereum address.`);
  }

  return value;
}

function rpcUrlForChain(chainId) {
  if (chainId === ANVIL_CHAIN_ID) {
    return cleanEnv(process.env.ANVIL_RPC_URL) ?? "http://127.0.0.1:8545";
  }

  const rpcUrl = cleanEnv(process.env.BIDBACK_RPC_URL);

  if (!rpcUrl) {
    throw new Error(
      `BIDBACK_RPC_URL is required for on-chain verification of non-local chain ${chainId}.`
    );
  }

  return rpcUrl;
}

function makeChain(chainId, rpcUrl) {
  return {
    id: chainId,
    name: chainId === ANVIL_CHAIN_ID ? "Anvil Local" : `BidBack Target ${chainId}`,
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH"
    },
    rpcUrls: {
      default: {
        http: [rpcUrl]
      }
    }
  };
}

function bytecodePresent(bytecode) {
  return typeof bytecode === "string" && bytecode !== "0x" && bytecode.length > 2;
}

function short(value) {
  if (typeof value !== "string") return String(value);
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function normalizeAddress(value) {
  return String(value).toLowerCase();
}

function addressesEqual(actual, expected) {
  return normalizeAddress(actual) === normalizeAddress(expected);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  throw new Error(`Cannot convert parameter value to bigint: ${String(value)}`);
}

function ok(label, detail = "") {
  console.log(`OK   ${label}${detail ? ` - ${detail}` : ""}`);
}

function fail(label, detail = "") {
  console.log(`FAIL ${label}${detail ? ` - ${detail}` : ""}`);
}

function warn(label, detail = "") {
  console.warn(`WARN ${label}${detail ? ` - ${detail}` : ""}`);
}

function skip(label, detail = "") {
  console.log(`SKIP ${label}${detail ? ` - ${detail}` : ""}`);
}

function check(label, condition, detail) {
  if (condition) {
    ok(label, detail);
    return 0;
  }

  fail(label, detail);
  return 1;
}

function readParamField(params, key, index) {
  if (Array.isArray(params)) return params[index];
  if (params && typeof params === "object") return params[key];
  return undefined;
}

function readParamBigInt(params, key, index) {
  const value = readParamField(params, key, index);

  if (value === undefined) {
    throw new Error(`ParamsController.params() did not return ${key}.`);
  }

  return toBigInt(value);
}

async function readDeploymentFile(chainId) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(scriptDir, "..");
  const deploymentPath = path.join(frontendRoot, "public", "deployments", `${chainId}.json`);

  let raw;

  try {
    raw = await readFile(deploymentPath, "utf8");
  } catch (error) {
    throw new Error(`Deployment file not found or unreadable: ${deploymentPath}\n${errorMessage(error)}`);
  }

  let payload;

  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Deployment file is not valid JSON: ${deploymentPath}\n${errorMessage(error)}`);
  }

  return { deploymentPath, payload };
}

async function verifyBytecode(client, contracts) {
  let failureCount = 0;

  console.log("\nBytecode checks");

  for (const key of coreContractKeys) {
    const address = contracts[key];
    const label = contractLabels[key] ?? key;

    try {
      const bytecode = await client.getBytecode({ address });

      if (bytecodePresent(bytecode)) {
        ok(label, `${address} bytecode present`);
      } else {
        fail(label, `${address} bytecode missing`);
        failureCount += 1;
      }
    } catch (error) {
      fail(label, `${address} bytecode check failed: ${errorMessage(error)}`);
      failureCount += 1;
    }
  }

  if (contracts.localNft) {
    try {
      const bytecode = await client.getBytecode({ address: contracts.localNft });

      if (bytecodePresent(bytecode)) {
        ok("LocalERC721", `${contracts.localNft} bytecode present`);
      } else {
        fail("LocalERC721", `${contracts.localNft} bytecode missing`);
        failureCount += 1;
      }
    } catch (error) {
      fail("LocalERC721", `${contracts.localNft} bytecode check failed: ${errorMessage(error)}`);
      failureCount += 1;
    }
  } else {
    ok("LocalERC721", "not present in deployment JSON; skipped");
  }

  return failureCount;
}

async function verifyReadChecks(client, contracts) {
  let failureCount = 0;

  console.log("\nCritical read checks");

  try {
    const nextAuctionId = await client.readContract({
      address: contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "nextAuctionId"
    });

    ok("AuctionHouse.nextAuctionId()", nextAuctionId.toString());
  } catch (error) {
    fail("AuctionHouse.nextAuctionId()", errorMessage(error));
    failureCount += 1;
  }

  try {
    const paused = await client.readContract({
      address: contracts.paramsController,
      abi: paramsControllerAbi,
      functionName: "paused"
    });

    ok("ParamsController.paused()", String(paused));
  } catch (error) {
    fail("ParamsController.paused()", errorMessage(error));
    failureCount += 1;
  }

  return failureCount;
}

async function verifyOwners(client, contracts, expectedOwner) {
  let failureCount = 0;

  console.log("\nOwner checks");

  if (expectedOwner) {
    console.log(`Expected owner: ${expectedOwner}`);
  } else {
    console.log("Expected owner: not provided; owners are reported without comparison.");
  }

  for (const key of coreContractKeys) {
    const label = contractLabels[key] ?? key;
    const address = contracts[key];

    try {
      const actualOwner = await client.readContract({
        address,
        abi: ownableAbi,
        functionName: "owner"
      });

      if (addressesEqual(actualOwner, ZERO_ADDRESS)) {
        fail(`${label}.owner()`, "owner is the zero address");
        failureCount += 1;
      } else if (expectedOwner && !addressesEqual(actualOwner, expectedOwner)) {
        fail(`${label}.owner()`, `expected ${expectedOwner}, on-chain ${actualOwner}`);
        failureCount += 1;
      } else if (expectedOwner) {
        ok(`${label}.owner()`, `matches ${short(expectedOwner)}`);
      } else {
        ok(`${label}.owner()`, actualOwner);
      }
    } catch (error) {
      fail(`${label}.owner()`, `read failed: ${errorMessage(error)}`);
      failureCount += 1;
    }
  }

  return failureCount;
}

async function verifyFeeRecipient(client, contracts, expectedFeeRecipient) {
  let failureCount = 0;

  console.log("\nFee recipient checks");

  if (expectedFeeRecipient) {
    console.log(`Expected fee recipient: ${expectedFeeRecipient}`);
  } else {
    console.log("Expected fee recipient: not provided; value is reported without comparison.");
  }

  try {
    const feeRecipient = await client.readContract({
      address: contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "feeRecipient"
    });

    if (addressesEqual(feeRecipient, ZERO_ADDRESS)) {
      fail("AuctionHouse.feeRecipient()", "fee recipient is the zero address");
      failureCount += 1;
    } else if (expectedFeeRecipient && !addressesEqual(feeRecipient, expectedFeeRecipient)) {
      fail(
        "AuctionHouse.feeRecipient()",
        `expected ${expectedFeeRecipient}, on-chain ${feeRecipient}`
      );
      failureCount += 1;
    } else if (expectedFeeRecipient) {
      ok("AuctionHouse.feeRecipient()", `matches ${short(expectedFeeRecipient)}`);
    } else {
      ok("AuctionHouse.feeRecipient()", feeRecipient);
    }
  } catch (error) {
    fail("AuctionHouse.feeRecipient()", `read failed: ${errorMessage(error)}`);
    failureCount += 1;
  }

  return failureCount;
}

async function verifyParams(client, contracts) {
  let failureCount = 0;

  console.log("\nParameter sanity checks");

  let params;

  try {
    params = await client.readContract({
      address: contracts.paramsController,
      abi: paramsControllerAbi,
      functionName: "params"
    });

    ok("ParamsController.params()", "decoded");
  } catch (error) {
    fail("ParamsController.params()", errorMessage(error));
    return failureCount + 1;
  }

  try {
    const bidbackFeeBps = readParamBigInt(params, "bidbackFeeBps", 0);
    const redistributionBps = readParamBigInt(params, "redistributionBps", 1);
    const minParticipants = readParamBigInt(params, "minParticipants", 2);
    const alphaBps = readParamBigInt(params, "alphaBps", 3);
    const betaBps = readParamBigInt(params, "betaBps", 4);
    const gammaBps = readParamBigInt(params, "gammaBps", 5);
    const minBidIncrementBps = readParamBigInt(params, "minBidIncrementBps", 6);
    const perUserRewardCapBps = readParamBigInt(params, "perUserRewardCapBps", 7);
    const maxParticipants = readParamBigInt(params, "maxParticipants", 8);
    const maxInteractionCount = readParamBigInt(params, "maxInteractionCount", 9);
    const minAuctionDuration = readParamBigInt(params, "minAuctionDuration", 10);
    const antiSnipeWindow = readParamBigInt(params, "antiSnipeWindow", 11);
    const antiSnipeExtension = readParamBigInt(params, "antiSnipeExtension", 12);
    const maxAntiSnipeExtensions = readParamBigInt(params, "maxAntiSnipeExtensions", 13);
    const minExposure = readParamBigInt(params, "minExposure", 14);
    const minPremiumNet = readParamBigInt(params, "minPremiumNet", 15);
    const efCap = readParamBigInt(params, "efCap", 16);
    const etCap = readParamBigInt(params, "etCap", 17);
    const iiCap = readParamBigInt(params, "iiCap", 18);

    failureCount += check(
      "Params.bidbackFeeBps",
      bidbackFeeBps <= 2_000n,
      `${bidbackFeeBps.toString()} <= 2000`
    );
    failureCount += check(
      "Params.redistributionBps",
      redistributionBps <= BASIS_POINTS,
      `${redistributionBps.toString()} <= ${BASIS_POINTS.toString()}`
    );
    failureCount += check(
      "Params.minParticipants",
      minParticipants >= 2n,
      `${minParticipants.toString()} >= 2`
    );
    failureCount += check(
      "Params.SCR weights ordering",
      alphaBps > betaBps && betaBps >= gammaBps,
      `alpha=${alphaBps.toString()}, beta=${betaBps.toString()}, gamma=${gammaBps.toString()}`
    );
    failureCount += check(
      "Params.SCR weights sum",
      alphaBps + betaBps + gammaBps === BASIS_POINTS,
      `${(alphaBps + betaBps + gammaBps).toString()} == ${BASIS_POINTS.toString()}`
    );
    failureCount += check(
      "Params.minBidIncrementBps",
      minBidIncrementBps > 0n && minBidIncrementBps <= BASIS_POINTS,
      `${minBidIncrementBps.toString()} in 1..${BASIS_POINTS.toString()}`
    );
    failureCount += check(
      "Params.perUserRewardCapBps",
      perUserRewardCapBps > 0n && perUserRewardCapBps <= BASIS_POINTS,
      `${perUserRewardCapBps.toString()} in 1..${BASIS_POINTS.toString()}`
    );
    failureCount += check(
      "Params.maxParticipants",
      maxParticipants >= minParticipants && maxParticipants <= 256n,
      `max=${maxParticipants.toString()}, min=${minParticipants.toString()}, cap=256`
    );
    failureCount += check(
      "Params.maxInteractionCount",
      maxInteractionCount > 0n,
      `${maxInteractionCount.toString()} > 0`
    );
    failureCount += check(
      "Params.minAuctionDuration",
      minAuctionDuration > 0n,
      `${minAuctionDuration.toString()} > 0`
    );
    failureCount += check(
      "Params.antiSnipeWindow",
      antiSnipeWindow > 0n,
      `${antiSnipeWindow.toString()} > 0`
    );
    failureCount += check(
      "Params.antiSnipeExtension",
      antiSnipeExtension > 0n,
      `${antiSnipeExtension.toString()} > 0`
    );
    failureCount += check(
      "Params.maxAntiSnipeExtensions",
      maxAntiSnipeExtensions <= 20n,
      `${maxAntiSnipeExtensions.toString()} <= 20`
    );
    failureCount += check(
      "Params.minExposure",
      minExposure <= minAuctionDuration,
      `${minExposure.toString()} <= ${minAuctionDuration.toString()}`
    );
    ok("Params.minPremiumNet", minPremiumNet.toString());
    failureCount += check(
      "Params.efCap",
      efCap > 0n && efCap <= PARAM_CAP_SCALE,
      `${efCap.toString()} in 1..${PARAM_CAP_SCALE.toString()}`
    );
    failureCount += check(
      "Params.etCap",
      etCap > 0n && etCap <= PARAM_CAP_SCALE,
      `${etCap.toString()} in 1..${PARAM_CAP_SCALE.toString()}`
    );
    failureCount += check(
      "Params.iiCap",
      iiCap > 0n && iiCap <= PARAM_CAP_SCALE,
      `${iiCap.toString()} in 1..${PARAM_CAP_SCALE.toString()}`
    );
  } catch (error) {
    fail("ParamsController.params()", `decode failed: ${errorMessage(error)}`);
    failureCount += 1;
  }

  return failureCount;
}

async function verifyAddressLink({ client, sourceAddress, abi, functionName, expectedAddress, label }) {
  try {
    const actualAddress = await client.readContract({
      address: sourceAddress,
      abi,
      functionName
    });

    if (addressesEqual(actualAddress, expectedAddress)) {
      ok(label, `matches ${short(expectedAddress)}`);
      return 0;
    }

    fail(label, `expected ${expectedAddress}, on-chain ${actualAddress}`);
    return 1;
  } catch (error) {
    fail(label, `read failed: ${errorMessage(error)}`);
    return 1;
  }
}

async function verifyModuleLinkage(client, contracts) {
  let failureCount = 0;

  console.log("\nModule linkage checks");

  failureCount += await verifyAddressLink({
    client,
    sourceAddress: contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "nftVault",
    expectedAddress: contracts.nftVault,
    label: "AuctionHouse.nftVault()"
  });

  failureCount += await verifyAddressLink({
    client,
    sourceAddress: contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "escrowVault",
    expectedAddress: contracts.escrowVault,
    label: "AuctionHouse.escrowVault()"
  });

  failureCount += await verifyAddressLink({
    client,
    sourceAddress: contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "distributionVault",
    expectedAddress: contracts.distributionVault,
    label: "AuctionHouse.distributionVault()"
  });

  failureCount += await verifyAddressLink({
    client,
    sourceAddress: contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "paramsController",
    expectedAddress: contracts.paramsController,
    label: "AuctionHouse.paramsController()"
  });

  failureCount += await verifyAddressLink({
    client,
    sourceAddress: contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "reputationAdapter",
    expectedAddress: contracts.reputationAdapter,
    label: "AuctionHouse.reputationAdapter()"
  });

  failureCount += await verifyAddressLink({
    client,
    sourceAddress: contracts.nftVault,
    abi: vaultAuctionHouseAbi,
    functionName: "auctionHouse",
    expectedAddress: contracts.auctionHouse,
    label: "NFTVault.auctionHouse()"
  });

  failureCount += await verifyAddressLink({
    client,
    sourceAddress: contracts.escrowVault,
    abi: vaultAuctionHouseAbi,
    functionName: "auctionHouse",
    expectedAddress: contracts.auctionHouse,
    label: "EscrowVault.auctionHouse()"
  });

  failureCount += await verifyAddressLink({
    client,
    sourceAddress: contracts.distributionVault,
    abi: vaultAuctionHouseAbi,
    functionName: "auctionHouse",
    expectedAddress: contracts.auctionHouse,
    label: "DistributionVault.auctionHouse()"
  });

  skip(
    "DistributionVault.escrowForAuction(auctionId)",
    "auction-scoped; not checked in this deployment-level verification"
  );
  skip(
    "AuctionHouse.getAuctionModules(auctionId)",
    "auction-scoped snapshot; not checked in this deployment-level verification"
  );

  return failureCount;
}

async function main() {
  const chainId = parseChainId(process.argv[2]);
  const expectedOwner = optionalAddressEnv("EXPECTED_OWNER");
  const expectedFeeRecipient = optionalAddressEnv("EXPECTED_FEE_RECIPIENT");
  const { deploymentPath, payload } = await readDeploymentFile(chainId);

  console.log(`Deployment on-chain verification`);
  console.log(`Deployment file: ${deploymentPath}`);

  const validation = assertValidDeploymentJson(payload, chainId);

  ok("Deployment JSON", "shape and address format valid");

  for (const warning of validation.warnings) {
    warn("Deployment JSON", warning);
  }

  const rpcUrl = rpcUrlForChain(chainId);
  const chain = makeChain(chainId, rpcUrl);
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });

  console.log(`RPC URL: ${rpcUrl}`);

  let rpcChainId;

  try {
    rpcChainId = await client.getChainId();
  } catch (error) {
    throw new Error(`RPC unreachable: ${rpcUrl}\n${errorMessage(error)}`);
  }

  console.log("\nChain checks");
  console.log(`Expected chainId: ${chainId}`);
  console.log(`RPC chainId:      ${rpcChainId}`);

  if (rpcChainId !== chainId) {
    fail("RPC chainId", `expected ${chainId}, got ${rpcChainId}`);
    process.exit(1);
  }

  ok("RPC chainId", `matches ${chainId}`);

  const bytecodeFailures = await verifyBytecode(client, payload.contracts);
  const readFailures = await verifyReadChecks(client, payload.contracts);
  const ownerFailures = await verifyOwners(client, payload.contracts, expectedOwner);
  const feeRecipientFailures = await verifyFeeRecipient(
    client,
    payload.contracts,
    expectedFeeRecipient
  );
  const paramFailures = await verifyParams(client, payload.contracts);
  const linkageFailures = await verifyModuleLinkage(client, payload.contracts);
  const failureCount =
    bytecodeFailures +
    readFailures +
    ownerFailures +
    feeRecipientFailures +
    paramFailures +
    linkageFailures;

  console.log("\nSummary");

  if (failureCount > 0) {
    fail("Deployment on-chain verification", `${failureCount} failure(s)`);
    process.exit(1);
  }

  ok("Deployment on-chain verification", "all checks passed");
}

main().catch((error) => {
  if (error instanceof DeploymentValidationError) {
    console.error(error.message);

    if (error.warnings.length > 0) {
      console.error("Warnings:");
      for (const warning of error.warnings) {
        console.error(`- ${warning}`);
      }
    }
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }

  process.exit(1);
});