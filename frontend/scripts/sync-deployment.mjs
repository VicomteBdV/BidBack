import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const chainId = "31337";
const frontendRoot = process.cwd().endsWith("frontend")
  ? process.cwd()
  : path.join(process.cwd(), "frontend");

const repoRoot = path.dirname(frontendRoot);
const broadcastPath = path.join(repoRoot, "broadcast", "DeployLocal.s.sol", chainId, "run-latest.json");
const outputDir = path.join(frontendRoot, "public", "deployments");
const outputPath = path.join(outputDir, `${chainId}.json`);

const contractKeys = {
  ParamsController: "paramsController",
  NFTVault: "nftVault",
  EscrowVault: "escrowVault",
  DistributionVault: "distributionVault",
  ReputationAdapter: "reputationAdapter",
  AuctionHouse: "auctionHouse",
  LocalERC721: "localNft"
};

if (!existsSync(broadcastPath)) {
  console.error(`Missing Foundry broadcast file: ${broadcastPath}`);
  console.error("Run the local deployment script before syncing frontend deployments.");
  process.exit(1);
}

const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));
const contracts = {};

for (const tx of broadcast.transactions ?? []) {
  if (tx.transactionType !== "CREATE") continue;
  if (!tx.contractName || !tx.contractAddress) continue;

  const key = contractKeys[tx.contractName];
  if (key) {
    contracts[key] = tx.contractAddress;
  }
}

const requiredKeys = Object.values(contractKeys);
const missing = requiredKeys.filter((key) => !contracts[key]);

if (missing.length > 0) {
  console.error(`Missing deployed contract addresses: ${missing.join(", ")}`);
  process.exit(1);
}

const deployment = {
  chainId: Number(chainId),
  generatedAt: new Date().toISOString(),
  source: "foundry-broadcast",
  contracts
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);