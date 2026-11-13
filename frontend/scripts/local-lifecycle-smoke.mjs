#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodeFunctionData,
  toFunctionSelector,
  http
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
  AMOUNT_RANK_PROFILE, AMOUNT_RANK_IDENTITY, normalizeLifecycleParameterAbi,
  assertParameterTupleWidths, readFormulaIdentity, parseLocalLifecycleArgs,
  calculateAmountRankEconomics, calculateAmountRankScores, bidderScoresAbi,
  LOCAL_ANVIL_CHAIN_ID,
  LifecycleSmokeError,
  WEI_PER_ETH,
  assertAddressEqual,
  assertEqual,
  assertExactRevertCall,
  assertExpectedLocalParams,
  assertLocalChainId,
  assertLoopbackRpcUrl,
  assertTrue,
  calculateSingleLoserEconomics,
  formatEth,
  paramsFromTuple,
  toBigInt,
  tupleValue,
  validateLocalDeployment
} from "./local-lifecycle-core.mjs";

const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TOKEN_ID = 2n;
const START_PRICE = 1n * WEI_PER_ETH;
const DURATION = 2n * 60n * 60n;
const BIDDER_A_INITIAL_CAP = 12n * WEI_PER_ETH / 10n;
const BIDDER_B_CAP = 15n * WEI_PER_ETH / 10n;
const BIDDER_A_FINAL_CAP = 2n * WEI_PER_ETH;
const BIDDER_A_STEP_UP_DELTA = BIDDER_A_FINAL_CAP - BIDDER_A_INITIAL_CAP;
let activeStep = "initialization";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(frontendRoot, "..");

function ok(label, detail = "") {
  console.log(`[OK] ${label}${detail ? `: ${detail}` : ""}`);
}

function readableError(error) {
  if (error && typeof error === "object" && "shortMessage" in error && typeof error.shortMessage === "string") {
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

async function readJson(filePath, step) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new LifecycleSmokeError(step, `readable JSON at ${filePath}`, readableError(error));
  }
}

async function loadArtifact(sourceName, contractName, profile) {
  const artifactPath = path.join(repoRoot, "out", `${sourceName}.sol`, `${contractName}.json`);
  const artifact = await readJson(artifactPath, `${contractName} artifact`);
  assertTrue(`${contractName} ABI`, Array.isArray(artifact.abi));
  if (contractName === "AuctionHouse") return normalizeLifecycleParameterAbi(artifact.abi, "getAuctionParams", profile);
  if (contractName === "ParamsController") return normalizeLifecycleParameterAbi(artifact.abi, "params", profile);
  return artifact.abi;
}

function createLocalActors() {
  // Public, insecure default Anvil development mnemonic. LOCAL ANVIL ONLY.
  const mnemonic = "test test test test test test test test test test test junk";
  const owner = mnemonicToAccount(mnemonic, { addressIndex: 0 });
  const bidderA = mnemonicToAccount(mnemonic, { addressIndex: 1 });
  const bidderB = mnemonicToAccount(mnemonic, { addressIndex: 2 });

  assertAddressEqual("Anvil account #0", owner.address, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  assertAddressEqual("Anvil account #1", bidderA.address, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  assertAddressEqual("Anvil account #2", bidderB.address, "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
  return { owner, bidderA, bidderB };
}

function auctionFromTuple(raw) {
  return {
    seller: tupleValue(raw, "seller", 0),
    nft: tupleValue(raw, "nft", 1),
    tokenId: toBigInt(tupleValue(raw, "tokenId", 2)),
    startPrice: toBigInt(tupleValue(raw, "startPrice", 3)),
    startTime: toBigInt(tupleValue(raw, "startTime", 4)),
    initialEndTime: toBigInt(tupleValue(raw, "initialEndTime", 5)),
    endTime: toBigInt(tupleValue(raw, "endTime", 6)),
    extensionsUsed: Number(tupleValue(raw, "extensionsUsed", 7)),
    state: Number(tupleValue(raw, "state", 8)),
    highestBidder: tupleValue(raw, "highestBidder", 9),
    highestBid: toBigInt(tupleValue(raw, "highestBid", 10)),
    participantCount: toBigInt(tupleValue(raw, "participantCount", 11)),
    bidCount: toBigInt(tupleValue(raw, "bidCount", 12)),
    nftClaimed: Boolean(tupleValue(raw, "nftClaimed", 13))
  };
}

function lockFromTuple(raw) {
  return {
    nft: tupleValue(raw, "nft", 0),
    tokenId: toBigInt(tupleValue(raw, "tokenId", 1)),
    seller: tupleValue(raw, "seller", 2),
    locked: Boolean(tupleValue(raw, "locked", 3)),
    released: Boolean(tupleValue(raw, "released", 4))
  };
}

function settlementFromTuple(raw) {
  return {
    finalized: Boolean(tupleValue(raw, "finalized", 0)),
    winner: tupleValue(raw, "winner", 1),
    distributionVault: tupleValue(raw, "distributionVault", 2),
    finalPrice: toBigInt(tupleValue(raw, "finalPrice", 3)),
    sellerProceeds: toBigInt(tupleValue(raw, "sellerProceeds", 4)),
    feeAmount: toBigInt(tupleValue(raw, "feeAmount", 5)),
    distributionReserve: toBigInt(tupleValue(raw, "distributionReserve", 6))
  };
}

function distributionFromTuple(raw) {
  return {
    opened: Boolean(tupleValue(raw, "opened", 0)),
    totalAssigned: toBigInt(tupleValue(raw, "totalAssigned", 1)),
    totalClaimed: toBigInt(tupleValue(raw, "totalClaimed", 2))
  };
}

async function sendContract(publicClient, walletClient, request, step) {
  let hash;
  try {
    hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assertEqual(`${step} receipt`, receipt.status, "success");
    return { hash, receipt };
  } catch (error) {
    if (error instanceof LifecycleSmokeError) throw error;
    throw new LifecycleSmokeError(step, "successful transaction", readableError(error));
  }
}

async function main() {
  const { profile, preflightOnly } = parseLocalLifecycleArgs(process.argv.slice(2));
  console.log("LOCAL ANVIL ONLY");

  activeStep = "network preflight";
  const rpcUrl = assertLoopbackRpcUrl(process.env.LOCAL_ANVIL_RPC_URL?.trim() || DEFAULT_RPC_URL);
  const localChain = defineChain({
    id: LOCAL_ANVIL_CHAIN_ID,
    name: "Anvil Local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }
  });
  const publicClient = createPublicClient({ chain: localChain, transport: http(rpcUrl) });

  let rawChainId;
  try {
    rawChainId = await publicClient.request({ method: "eth_chainId" });
  } catch (error) {
    throw new LifecycleSmokeError("Anvil RPC", "reachable loopback RPC", readableError(error));
  }
  assertLocalChainId(rawChainId);

  if (preflightOnly) {
    ok("Local Anvil preflight", `chain ID ${LOCAL_ANVIL_CHAIN_ID}`);
    return;
  }

  activeStep = "deployment preflight";
  const deploymentPath = path.join(frontendRoot, "public", "deployments", "31337.json");
  const deployment = validateLocalDeployment(await readJson(deploymentPath, "deployment JSON"));

  for (const [key, contractAddress] of Object.entries(deployment.contracts)) {
    if (!["auctionHouse", "nftVault", "escrowVault", "distributionVault", "paramsController", "reputationAdapter", "localNft"].includes(key)) continue;
    const bytecode = await publicClient.getBytecode({ address: contractAddress });
    assertTrue(`${key} bytecode`, typeof bytecode === "string" && bytecode.length > 2);
  }
  ok("Deployment loaded");

  const [auctionHouseAbi, nftVaultAbi, escrowVaultAbi, distributionVaultAbi, paramsControllerAbi, reputationAdapterAbi, localNftAbi] =
    await Promise.all([
      loadArtifact("AuctionHouse", "AuctionHouse", profile),
      loadArtifact("NFTVault", "NFTVault", profile),
      loadArtifact("EscrowVault", "EscrowVault", profile),
      loadArtifact("DistributionVault", "DistributionVault", profile),
      loadArtifact("ParamsController", "ParamsController", profile),
      loadArtifact("ReputationAdapter", "ReputationAdapter", profile),
      loadArtifact("LocalERC721", "LocalERC721", profile)
    ]);

  const preflightBlock = await publicClient.getBlock({ blockTag: "latest" });
  const preflightBlockNumber = preflightBlock.number;
  const expectedAuctionId = toBigInt(await publicClient.readContract({
    address: deployment.contracts.auctionHouse, abi: auctionHouseAbi, functionName: "nextAuctionId", blockNumber: preflightBlockNumber
  }));
  await assertParameterTupleWidths(publicClient, deployment.contracts, expectedAuctionId, profile, preflightBlockNumber);
  if (profile === AMOUNT_RANK_PROFILE) {
    const observed = await readFormulaIdentity(publicClient, deployment.contracts.auctionHouse, preflightBlockNumber);
    ok("Formula identity", JSON.stringify({ expected: AMOUNT_RANK_IDENTITY, observed, blockNumber: preflightBlockNumber.toString() }));
  }
  const currentParams = paramsFromTuple(await publicClient.readContract({
    address: deployment.contracts.paramsController, abi: paramsControllerAbi, functionName: "params", blockNumber: preflightBlockNumber
  }), profile);
  assertExpectedLocalParams("current params", currentParams, profile);
  assertEqual("preflight block hash", (await publicClient.getBlock({ blockNumber: preflightBlockNumber })).hash, preflightBlock.hash);
  ok("Lifecycle profile", profile);

  // Wallet accounts and clients are intentionally created only after every network and deployment preflight guard.
  const actors = createLocalActors();
  const walletFor = (account) => createWalletClient({ account, chain: localChain, transport: http(rpcUrl) });
  const ownerWallet = walletFor(actors.owner);
  const bidderAWallet = walletFor(actors.bidderA);
  const bidderBWallet = walletFor(actors.bidderB);
  const testClient = createTestClient({ chain: localChain, mode: "anvil", transport: http(rpcUrl) });

  activeStep = "deployment assertions";
  const ownedContracts = [
    ["AuctionHouse", deployment.contracts.auctionHouse, auctionHouseAbi],
    ["NFTVault", deployment.contracts.nftVault, nftVaultAbi],
    ["EscrowVault", deployment.contracts.escrowVault, escrowVaultAbi],
    ["DistributionVault", deployment.contracts.distributionVault, distributionVaultAbi],
    ["ParamsController", deployment.contracts.paramsController, paramsControllerAbi],
    ["ReputationAdapter", deployment.contracts.reputationAdapter, reputationAdapterAbi]
  ];
  for (const [label, contractAddress, abi] of ownedContracts) {
    const owner = await publicClient.readContract({ address: contractAddress, abi, functionName: "owner" });
    assertAddressEqual(`${label} owner`, owner, actors.owner.address);
  }

  const currentFeeRecipient = await publicClient.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "feeRecipient"
  });
  assertAddressEqual("current fee recipient", currentFeeRecipient, actors.owner.address);

  assertEqual("current pause state", await publicClient.readContract({
    address: deployment.contracts.paramsController,
    abi: paramsControllerAbi,
    functionName: "paused"
  }), false);

  const checkScores = async (bidCount) => {
    if (profile !== AMOUNT_RANK_PROFILE) return;
    const block = await publicClient.getBlock({ blockTag: "latest" });
    const expected = calculateAmountRankScores({ bidderCount: 2, h: snapshot.rankSoftness,
      bids: [{ bidderIndex: 0, newCapWei: BIDDER_A_INITIAL_CAP }, { bidderIndex: 1, newCapWei: BIDDER_B_CAP },
        { bidderIndex: 0, newCapWei: BIDDER_A_FINAL_CAP }].slice(0, bidCount) }).scores;
    for (const [index, actor] of [actors.bidderA, actors.bidderB].entries()) {
      assertEqual(`bidder ${index} score after ${bidCount} bids`, await publicClient.readContract({
        address: deployment.contracts.auctionHouse, abi: bidderScoresAbi, functionName: "bidderScores",
        args: [auctionId, actor.address], blockNumber: block.number
      }), expected[index]);
    }
    assertEqual("score block hash", (await publicClient.getBlock({ blockNumber: block.number })).hash, block.hash);
  };

  activeStep = "NFT preparation";
  const ownerBefore = await publicClient.readContract({
    address: deployment.contracts.localNft,
    abi: localNftAbi,
    functionName: "ownerOf",
    args: [TOKEN_ID]
  });
  assertAddressEqual("test NFT owner", ownerBefore, actors.owner.address);

  const emptyLock = lockFromTuple(await publicClient.readContract({
    address: deployment.contracts.nftVault,
    abi: nftVaultAbi,
    functionName: "locks",
    args: [expectedAuctionId]
  }));
  assertEqual("future auction lock active", emptyLock.locked, false);
  assertEqual("future auction lock released", emptyLock.released, false);
  assertAddressEqual("future auction lock NFT", emptyLock.nft, ZERO_ADDRESS);
  ok("Test NFT available", `token #${TOKEN_ID}`);

  await sendContract(publicClient, ownerWallet, {
    address: deployment.contracts.localNft,
    abi: localNftAbi,
    functionName: "approve",
    args: [deployment.contracts.nftVault, TOKEN_ID]
  }, "NFTVault approval");
  const approved = await publicClient.readContract({
    address: deployment.contracts.localNft,
    abi: localNftAbi,
    functionName: "getApproved",
    args: [TOKEN_ID]
  });
  assertAddressEqual("NFTVault approval", approved, deployment.contracts.nftVault);
  ok("NFTVault approval verified");

  activeStep = "auction creation";
  const creation = await sendContract(publicClient, ownerWallet, {
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "createAuction",
    args: [deployment.contracts.localNft, TOKEN_ID, START_PRICE, DURATION]
  }, "auction creation");

  let eventAuctionId;
  for (const log of creation.receipt.logs) {
    if (log.address.toLowerCase() !== deployment.contracts.auctionHouse.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: auctionHouseAbi, data: log.data, topics: log.topics, strict: false });
      if (decoded.eventName === "AuctionCreated") eventAuctionId = toBigInt(decoded.args.auctionId);
    } catch {
      // Ignore unrelated AuctionHouse logs.
    }
  }
  assertTrue("AuctionCreated event", eventAuctionId !== undefined);
  assertEqual("derived auction ID", eventAuctionId, expectedAuctionId);
  const auctionId = eventAuctionId;
  const nextAuctionIdAfter = toBigInt(await publicClient.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "nextAuctionId"
  }));
  assertEqual("next auction ID after creation", nextAuctionIdAfter, auctionId + 1n);

  let auction = auctionFromTuple(await publicClient.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "getAuction",
    args: [auctionId]
  }));
  assertAddressEqual("auction seller", auction.seller, actors.owner.address);
  assertAddressEqual("auction NFT", auction.nft, deployment.contracts.localNft);
  assertEqual("auction token ID", auction.tokenId, TOKEN_ID);
  assertEqual("auction start price", auction.startPrice, START_PRICE);
  assertEqual("auction duration", auction.initialEndTime - auction.startTime, DURATION);
  assertEqual("auction end time", auction.endTime, auction.initialEndTime);
  assertEqual("auction state", auction.state, 0);
  assertEqual("auction participants", auction.participantCount, 0n);
  assertEqual("auction bids", auction.bidCount, 0n);

  const snapshotBlock = await publicClient.getBlock({ blockTag: "latest" });
  await assertParameterTupleWidths(publicClient, deployment.contracts, auctionId, profile, snapshotBlock.number);
  if (profile === AMOUNT_RANK_PROFILE) await readFormulaIdentity(publicClient, deployment.contracts.auctionHouse, snapshotBlock.number);
  const snapshot = paramsFromTuple(await publicClient.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "getAuctionParams",
    args: [auctionId], blockNumber: snapshotBlock.number
  }), profile);
  assertEqual("snapshot block hash", (await publicClient.getBlock({ blockNumber: snapshotBlock.number })).hash, snapshotBlock.hash);
  assertExpectedLocalParams("auction params snapshot", snapshot, profile);
  await checkScores(0);
  const snapshotFeeRecipient = await publicClient.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "getAuctionFeeRecipient",
    args: [auctionId]
  });
  assertAddressEqual("auction fee recipient snapshot", snapshotFeeRecipient, actors.owner.address);
  const modules = await publicClient.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "getAuctionModules",
    args: [auctionId]
  });
  assertAddressEqual("auction NFTVault snapshot", tupleValue(modules, "nftVault", 0), deployment.contracts.nftVault);
  assertAddressEqual("auction EscrowVault snapshot", tupleValue(modules, "escrowVault", 1), deployment.contracts.escrowVault);
  assertAddressEqual("auction DistributionVault snapshot", tupleValue(modules, "distributionVault", 2), deployment.contracts.distributionVault);
  assertAddressEqual("auction reputation snapshot", tupleValue(modules, "reputationAdapter", 3), deployment.contracts.reputationAdapter);

  let lock = lockFromTuple(await publicClient.readContract({
    address: deployment.contracts.nftVault,
    abi: nftVaultAbi,
    functionName: "locks",
    args: [auctionId]
  }));
  assertTrue("NFT lock active", lock.locked);
  assertEqual("NFT lock released", lock.released, false);
  assertAddressEqual("NFT custody owner", await publicClient.readContract({
    address: deployment.contracts.localNft,
    abi: localNftAbi,
    functionName: "ownerOf",
    args: [TOKEN_ID]
  }), deployment.contracts.nftVault);
  ok("Auction created", `#${auctionId}`);

  activeStep = "bidding";
  const initialEndTime = auction.endTime;
  await sendContract(publicClient, bidderAWallet, {
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "placeBid",
    args: [auctionId, BIDDER_A_INITIAL_CAP],
    value: BIDDER_A_INITIAL_CAP
  }, "bidder A initial bid");
  assertEqual("bidder A initial cap", toBigInt(await publicClient.readContract({
    address: deployment.contracts.escrowVault,
    abi: escrowVaultAbi,
    functionName: "capOf",
    args: [auctionId, actors.bidderA.address]
  })), BIDDER_A_INITIAL_CAP);
  auction = auctionFromTuple(await publicClient.readContract({ address: deployment.contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getAuction", args: [auctionId] }));
  assertAddressEqual("bidder A highest bidder", auction.highestBidder, actors.bidderA.address);
  assertEqual("bidder A highest bid", auction.highestBid, BIDDER_A_INITIAL_CAP);
  assertEqual("auction state after bidder A", auction.state, 0);
  assertEqual("participants after bidder A", auction.participantCount, 1n);
  assertEqual("bids after bidder A", auction.bidCount, 1n);
  assertEqual("end time after bidder A", auction.endTime, initialEndTime);
  assertEqual("escrow after bidder A", await publicClient.getBalance({ address: deployment.contracts.escrowVault }), BIDDER_A_INITIAL_CAP);
  await checkScores(1);
  ok("Bidder A cap", formatEth(BIDDER_A_INITIAL_CAP));

  await testClient.increaseTime({ seconds: 10 * 60 });
  await testClient.mine({ blocks: 1 });
  await sendContract(publicClient, bidderBWallet, {
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "placeBid",
    args: [auctionId, BIDDER_B_CAP],
    value: BIDDER_B_CAP
  }, "bidder B bid");
  assertEqual("bidder B cap", toBigInt(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "capOf", args: [auctionId, actors.bidderB.address] })), BIDDER_B_CAP);
  auction = auctionFromTuple(await publicClient.readContract({ address: deployment.contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getAuction", args: [auctionId] }));
  assertAddressEqual("bidder B highest bidder", auction.highestBidder, actors.bidderB.address);
  assertEqual("bidder B highest bid", auction.highestBid, BIDDER_B_CAP);
  assertEqual("auction state after bidder B", auction.state, 0);
  assertEqual("participants after bidder B", auction.participantCount, 2n);
  assertEqual("bids after bidder B", auction.bidCount, 2n);
  assertEqual("end time after bidder B", auction.endTime, initialEndTime);
  assertEqual("escrow after bidder B", await publicClient.getBalance({ address: deployment.contracts.escrowVault }), BIDDER_A_INITIAL_CAP + BIDDER_B_CAP);
  await checkScores(2);
  ok("Bidder B highest bid", formatEth(BIDDER_B_CAP));

  await testClient.increaseTime({ seconds: 10 * 60 });
  await testClient.mine({ blocks: 1 });
  const stepUp = await sendContract(publicClient, bidderAWallet, {
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "placeBid",
    args: [auctionId, BIDDER_A_FINAL_CAP],
    value: BIDDER_A_STEP_UP_DELTA
  }, "bidder A step-up");
  const stepUpTransaction = await publicClient.getTransaction({ hash: stepUp.hash });
  assertEqual("bidder A step-up transaction value", stepUpTransaction.value, BIDDER_A_STEP_UP_DELTA);
  assertEqual("bidder A final cap", toBigInt(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "capOf", args: [auctionId, actors.bidderA.address] })), BIDDER_A_FINAL_CAP);
  auction = auctionFromTuple(await publicClient.readContract({ address: deployment.contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getAuction", args: [auctionId] }));
  assertAddressEqual("final highest bidder", auction.highestBidder, actors.bidderA.address);
  assertEqual("final highest bid", auction.highestBid, BIDDER_A_FINAL_CAP);
  assertEqual("auction state after step-up", auction.state, 0);
  assertEqual("final participant count", auction.participantCount, 2n);
  assertEqual("final bid count", auction.bidCount, 3n);
  assertEqual("anti-sniping extensions", auction.extensionsUsed, 0);
  assertEqual("end time after step-up", auction.endTime, initialEndTime);
  assertEqual("total escrow deposits", await publicClient.getBalance({ address: deployment.contracts.escrowVault }), 35n * WEI_PER_ETH / 10n);
  await checkScores(3);
  ok("Bidder A step-up", `cap ${formatEth(BIDDER_A_FINAL_CAP)}, value ${formatEth(BIDDER_A_STEP_UP_DELTA)}`);

  activeStep = "finalization";
  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const secondsToEnd = auction.endTime + 1n - latestBlock.timestamp;
  if (secondsToEnd > 0n) {
    await testClient.increaseTime({ seconds: Number(secondsToEnd) });
  }
  await testClient.mine({ blocks: 1 });
  await sendContract(publicClient, bidderAWallet, {
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "finalizeAuction",
    args: [auctionId]
  }, "auction finalization");

  const economicInput = {
    startPrice: auction.startPrice,
    finalPrice: BIDDER_A_FINAL_CAP,
    feeBps: snapshot.bidbackFeeBps,
    redistributionBps: snapshot.redistributionBps,
    perUserRewardCapBps: snapshot.perUserRewardCapBps,
    minPremiumNet: snapshot.minPremiumNet,
    participantCount: auction.participantCount,
    minParticipants: snapshot.minParticipants,
    initialDuration: auction.initialEndTime - auction.startTime,
    minAuctionDuration: snapshot.minAuctionDuration,
    winnerCap: BIDDER_A_FINAL_CAP,
    losingCap: BIDDER_B_CAP,
    h: snapshot.rankSoftness,
    bidderCount: 2,
    winnerIndex: 0,
    bids: [{ bidderIndex: 0, newCapWei: BIDDER_A_INITIAL_CAP }, { bidderIndex: 1, newCapWei: BIDDER_B_CAP },
      { bidderIndex: 0, newCapWei: BIDDER_A_FINAL_CAP }]
  };
  const expectedEconomics = profile === AMOUNT_RANK_PROFILE
    ? calculateAmountRankEconomics(economicInput) : calculateSingleLoserEconomics(economicInput);
  assertEqual("expected protocol fee", expectedEconomics.protocolFee, 5n * WEI_PER_ETH / 100n);
  assertEqual("expected gross premium", expectedEconomics.grossPremium, 1n * WEI_PER_ETH);
  assertEqual("expected net premium", expectedEconomics.netPremium, 95n * WEI_PER_ETH / 100n);
  assertEqual("expected candidate distribution", expectedEconomics.candidateDistribution, 475n * WEI_PER_ETH / 1000n);
  assertEqual("expected assigned reward", expectedEconomics.assignedReward, profile === AMOUNT_RANK_PROFILE ? 475n * WEI_PER_ETH / 1000n : 19n * WEI_PER_ETH / 100n);
  assertEqual("expected seller proceeds", expectedEconomics.sellerProceeds, profile === AMOUNT_RANK_PROFILE ? 1475n * WEI_PER_ETH / 1000n : 176n * WEI_PER_ETH / 100n);
  assertEqual("expected losing refund", expectedEconomics.losingRefund, BIDDER_B_CAP);
  assertEqual("expected total deposits", expectedEconomics.totalDeposits, 35n * WEI_PER_ETH / 10n);

  auction = auctionFromTuple(await publicClient.readContract({ address: deployment.contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getAuction", args: [auctionId] }));
  assertEqual("finalized auction state", auction.state, 2);
  assertAddressEqual("finalized winner", auction.highestBidder, actors.bidderA.address);
  assertEqual("finalized price", auction.highestBid, BIDDER_A_FINAL_CAP);
  assertEqual("NFT claimed before claim", auction.nftClaimed, false);
  assertAddressEqual("NFT custody before claim", await publicClient.readContract({ address: deployment.contracts.localNft, abi: localNftAbi, functionName: "ownerOf", args: [TOKEN_ID] }), deployment.contracts.nftVault);

  let settlement = settlementFromTuple(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "settlements", args: [auctionId] }));
  assertTrue("settlement finalized", settlement.finalized);
  assertAddressEqual("settlement winner", settlement.winner, actors.bidderA.address);
  assertAddressEqual("settlement distribution vault", settlement.distributionVault, deployment.contracts.distributionVault);
  assertEqual("settlement final price", settlement.finalPrice, BIDDER_A_FINAL_CAP);
  assertEqual("settlement seller proceeds", settlement.sellerProceeds, expectedEconomics.sellerProceeds);
  assertEqual("settlement fee", settlement.feeAmount, expectedEconomics.protocolFee);
  assertEqual("settlement distribution reserve", settlement.distributionReserve, expectedEconomics.assignedReward);

  let distribution = distributionFromTuple(await publicClient.readContract({ address: deployment.contracts.distributionVault, abi: distributionVaultAbi, functionName: "distributions", args: [auctionId] }));
  assertTrue("distribution opened", distribution.opened);
  assertAddressEqual("distribution escrow snapshot", await publicClient.readContract({
    address: deployment.contracts.distributionVault,
    abi: distributionVaultAbi,
    functionName: "escrowForAuction",
    args: [auctionId]
  }), deployment.contracts.escrowVault);
  assertEqual("distribution assigned", distribution.totalAssigned, expectedEconomics.assignedReward);
  assertEqual("distribution claimed before claims", distribution.totalClaimed, 0n);
  assertEqual("bidder B refund", toBigInt(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "refundableAmount", args: [auctionId, actors.bidderB.address] })), expectedEconomics.losingRefund);
  assertEqual("bidder A refund", toBigInt(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "refundableAmount", args: [auctionId, actors.bidderA.address] })), expectedEconomics.winnerSurplusRefund);
  assertEqual("bidder B reward", toBigInt(await publicClient.readContract({ address: deployment.contracts.distributionVault, abi: distributionVaultAbi, functionName: "entitlementOf", args: [auctionId, actors.bidderB.address] })), expectedEconomics.assignedReward);
  assertEqual("bidder A reward", toBigInt(await publicClient.readContract({ address: deployment.contracts.distributionVault, abi: distributionVaultAbi, functionName: "entitlementOf", args: [auctionId, actors.bidderA.address] })), 0n);
  assertEqual("seller credit", toBigInt(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "sellerCredits", args: [actors.owner.address] })), expectedEconomics.sellerProceeds);
  assertEqual("protocol fee credit", toBigInt(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "protocolFeeCredits", args: [actors.owner.address] })), expectedEconomics.protocolFee);
  assertEqual("escrow after finalization", await publicClient.getBalance({ address: deployment.contracts.escrowVault }), expectedEconomics.totalDeposits);
  await checkScores(3);
  ok("Auction finalized");

  activeStep = "pull actions";
  await sendContract(publicClient, bidderAWallet, { address: deployment.contracts.auctionHouse, abi: auctionHouseAbi, functionName: "claimNft", args: [auctionId] }, "NFT claim");
  assertAddressEqual("NFT owner after claim", await publicClient.readContract({ address: deployment.contracts.localNft, abi: localNftAbi, functionName: "ownerOf", args: [TOKEN_ID] }), actors.bidderA.address);
  lock = lockFromTuple(await publicClient.readContract({ address: deployment.contracts.nftVault, abi: nftVaultAbi, functionName: "locks", args: [auctionId] }));
  assertEqual("NFT lock after claim", lock.locked, false);
  assertEqual("NFT released after claim", lock.released, true);
  ok("NFT claimed");

  await sendContract(publicClient, bidderBWallet, { address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "claimRefund", args: [auctionId] }, "refund claim");
  assertEqual("refund claimed flag", await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "refundClaimed", args: [auctionId, actors.bidderB.address] }), true);
  assertEqual("escrow after refund", await publicClient.getBalance({ address: deployment.contracts.escrowVault }), 2n * WEI_PER_ETH);
  ok("Refund claimed", formatEth(expectedEconomics.losingRefund));

  await sendContract(publicClient, bidderBWallet, { address: deployment.contracts.distributionVault, abi: distributionVaultAbi, functionName: "claim", args: [auctionId] }, "reward claim");
  assertEqual("reward claimed flag", await publicClient.readContract({ address: deployment.contracts.distributionVault, abi: distributionVaultAbi, functionName: "claimed", args: [auctionId, actors.bidderB.address] }), true);
  settlement = settlementFromTuple(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "settlements", args: [auctionId] }));
  assertEqual("distribution reserve after reward", settlement.distributionReserve, 0n);
  assertEqual("escrow after reward", await publicClient.getBalance({ address: deployment.contracts.escrowVault }), expectedEconomics.sellerProceeds + expectedEconomics.protocolFee);
  ok("Reward claimed", formatEth(expectedEconomics.assignedReward));

  await sendContract(publicClient, ownerWallet, { address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "withdrawSellerProceeds" }, "seller proceeds withdrawal");
  assertEqual("seller credit after withdrawal", toBigInt(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "sellerCredits", args: [actors.owner.address] })), 0n);
  assertEqual("escrow after seller withdrawal", await publicClient.getBalance({ address: deployment.contracts.escrowVault }), expectedEconomics.protocolFee);
  ok("Seller proceeds withdrawn", formatEth(expectedEconomics.sellerProceeds));

  await sendContract(publicClient, ownerWallet, { address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "withdrawProtocolFees" }, "protocol fee withdrawal");
  assertEqual("protocol fee credit after withdrawal", toBigInt(await publicClient.readContract({ address: deployment.contracts.escrowVault, abi: escrowVaultAbi, functionName: "protocolFeeCredits", args: [actors.owner.address] })), 0n);
  assertEqual("escrow after fee withdrawal", await publicClient.getBalance({ address: deployment.contracts.escrowVault }), 0n);
  ok("Protocol fees withdrawn", formatEth(expectedEconomics.protocolFee));

  activeStep = "duplicate-action checks";
  const duplicateBlock = await publicClient.getBlock({ blockTag: "latest" });
  const duplicateEvidence = [];
  for (const [step, account, to, abi, functionName, args, errorSignature] of [
    ["second NFT claim", actors.bidderA.address, deployment.contracts.auctionHouse, auctionHouseAbi, "claimNft", [auctionId], "NFTAlreadyClaimed()"],
    ["second refund claim", actors.bidderB.address, deployment.contracts.escrowVault, escrowVaultAbi, "claimRefund", [auctionId], "RefundAlreadyClaimed()"],
    ["second reward claim", actors.bidderB.address, deployment.contracts.distributionVault, distributionVaultAbi, "claim", [auctionId], "RewardAlreadyClaimed()"],
    ["second seller withdrawal", actors.owner.address, deployment.contracts.escrowVault, escrowVaultAbi, "withdrawSellerProceeds", [], "NothingToClaim()"],
    ["second protocol fee withdrawal", actors.owner.address, deployment.contracts.escrowVault, escrowVaultAbi, "withdrawProtocolFees", [], "NothingToClaim()"]
  ]) {
    const evidence = await assertExactRevertCall(publicClient, { account, to, data: encodeFunctionData({ abi, functionName, args }),
      blockNumber: duplicateBlock.number }, toFunctionSelector(errorSignature), step);
    duplicateEvidence.push({ step, ...evidence, block: { number: duplicateBlock.number.toString(), hash: duplicateBlock.hash } });
  }
  assertEqual("duplicate simulation block hash", (await publicClient.getBlock({ blockNumber: duplicateBlock.number })).hash, duplicateBlock.hash);
  for (const evidence of duplicateEvidence) ok("Duplicate call evidence", JSON.stringify(evidence));
  ok("Double claims and withdrawals rejected");

  activeStep = "final balance checks";
  distribution = distributionFromTuple(await publicClient.readContract({ address: deployment.contracts.distributionVault, abi: distributionVaultAbi, functionName: "distributions", args: [auctionId] }));
  auction = auctionFromTuple(await publicClient.readContract({ address: deployment.contracts.auctionHouse, abi: auctionHouseAbi, functionName: "getAuction", args: [auctionId] }));
  assertEqual("final NFT claimed state", auction.nftClaimed, true);
  assertEqual("final distribution claimed", distribution.totalClaimed, distribution.totalAssigned);
  assertEqual("final assigned reward", distribution.totalAssigned, expectedEconomics.assignedReward);
  assertEqual("final escrow balance", await publicClient.getBalance({ address: deployment.contracts.escrowVault }), 0n);
  ok("Final balances verified");
}

main().catch((error) => {
  if (error instanceof LifecycleSmokeError) {
    console.error(error.message);
  } else {
    console.error(`[FAIL] ${activeStep}: expected successful step, observed ${readableError(error)}`);
  }
  process.exitCode = 1;
});
