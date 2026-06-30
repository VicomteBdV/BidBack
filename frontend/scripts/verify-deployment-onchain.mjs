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

function readParamField(params, key, index) {
  if (Array.isArray(params)) return params[index];
  if (params && typeof params === "object") return params[key];
  return undefined;
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

    try {
      const bytecode = await client.getBytecode({ address });

      if (bytecodePresent(bytecode)) {
        ok(key, `${address} bytecode present`);
      } else {
        fail(key, `${address} bytecode missing`);
        failureCount += 1;
      }
    } catch (error) {
      fail(key, `${address} bytecode check failed: ${errorMessage(error)}`);
      failureCount += 1;
    }
  }

  if (contracts.localNft) {
    try {
      const bytecode = await client.getBytecode({ address: contracts.localNft });

      if (bytecodePresent(bytecode)) {
        ok("localNft", `${contracts.localNft} bytecode present`);
      } else {
        fail("localNft", `${contracts.localNft} bytecode missing`);
        failureCount += 1;
      }
    } catch (error) {
      fail("localNft", `${contracts.localNft} bytecode check failed: ${errorMessage(error)}`);
      failureCount += 1;
    }
  } else {
    ok("localNft", "not present in deployment JSON; skipped");
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

  try {
    const params = await client.readContract({
      address: contracts.paramsController,
      abi: paramsControllerAbi,
      functionName: "params"
    });

    const minAuctionDuration = readParamField(params, "minAuctionDuration", 10);
    ok(
      "ParamsController.params()",
      minAuctionDuration === undefined
        ? "decoded"
        : `decoded, minAuctionDuration=${minAuctionDuration.toString()}`
    );
  } catch (error) {
    fail("ParamsController.params()", errorMessage(error));
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
  const linkageFailures = await verifyModuleLinkage(client, payload.contracts);
  const failureCount = bytecodeFailures + readFailures + linkageFailures;

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