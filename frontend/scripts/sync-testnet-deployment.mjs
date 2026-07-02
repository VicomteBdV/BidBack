import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function usage() {
  console.error("Usage: npm run sync:deployment:testnet -- <chainId>");
}

function parseChainId(value) {
  if (!value || !/^\d+$/.test(value)) {
    usage();
    process.exit(1);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    console.error("chainId must be a positive safe integer.");
    process.exit(1);
  }

  return String(parsed);
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

const chainId = parseChainId(process.argv[2]);
const frontendRoot = process.cwd().endsWith("frontend")
  ? process.cwd()
  : path.join(process.cwd(), "frontend");

const repoRoot = path.dirname(frontendRoot);
const broadcastPath = path.join(repoRoot, "broadcast", "DeployTestnet.s.sol", chainId, "run-latest.json");
const outputDir = path.join(frontendRoot, "public", "deployments");
const outputPath = path.join(outputDir, `${chainId}.json`);

const contractKeys = {
  ParamsController: "paramsController",
  NFTVault: "nftVault",
  EscrowVault: "escrowVault",
  DistributionVault: "distributionVault",
  ReputationAdapter: "reputationAdapter",
  AuctionHouse: "auctionHouse"
};

if (!existsSync(broadcastPath)) {
  console.error(`Missing Foundry broadcast file: ${broadcastPath}`);
  console.error("Run the testnet deployment script before syncing frontend deployments.");
  process.exit(1);
}

const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));
const contracts = {};
const duplicates = [];

for (const tx of broadcast.transactions ?? []) {
  if (tx.transactionType !== "CREATE") continue;
  if (!tx.contractName || !tx.contractAddress) continue;

  const key = contractKeys[tx.contractName];
  if (!key) continue;

  if (contracts[key]) {
    duplicates.push(key);
    continue;
  }

  contracts[key] = tx.contractAddress;
}

if (duplicates.length > 0) {
  console.error(`Ambiguous deployment broadcast. Duplicate core contracts found: ${duplicates.join(", ")}`);
  process.exit(1);
}

const requiredKeys = Object.values(contractKeys);
const missing = requiredKeys.filter((key) => !contracts[key]);

if (missing.length > 0) {
  console.error(`Missing deployed core contract addresses: ${missing.join(", ")}`);
  process.exit(1);
}

const invalid = requiredKeys.filter((key) => !isAddress(contracts[key]));

if (invalid.length > 0) {
  console.error(`Invalid deployed core contract addresses: ${invalid.join(", ")}`);
  process.exit(1);
}

const deployment = {
  chainId: Number(chainId),
  generatedAt: new Date().toISOString(),
  source: "foundry-broadcast:DeployTestnet.s.sol",
  contracts
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
