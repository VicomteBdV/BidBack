import { decodeFunctionResult, encodeFunctionData, sha256, type Abi, type Address, type Hex } from "viem";
import artifacts from "@/contracts/testnetDeploymentArtifacts.json";
import { amountRankParamsControllerAbi } from "@/contracts/paramsControllerAbi";
import { createUnsignedTestnetDeploymentPlan, deploymentChainId, type DeploymentContext, type DeploymentModule,
  type DeploymentObservation, type DeploymentRoles, type UnsignedDeploymentIntent } from "./testnetDeploymentPlan";

export type DeploymentReadMethod = "eth_chainId" | "eth_getBlockByNumber" | "eth_getTransactionByHash" |
  "eth_getTransactionReceipt" | "eth_getCode" | "eth_call" | "eth_getTransactionCount";
/** Use one explicitly selected RPC transport with bounded request deadlines; no wallet transport or retry loop. */
export type DeploymentReadClient = Readonly<{
  request: (request: Readonly<{ method: DeploymentReadMethod; params: readonly unknown[] }>) => Promise<unknown>;
}>;
export type DeploymentConfirmationConfig = Readonly<{ chainId: number; roles: DeploymentRoles; startingNonce: number }>;
export type DeploymentBlockedReason = "input" | "rpc" | "chain" | "transaction" | "canonicality" | "nonce" | "code" | "state";
export type DeploymentConfirmationResult = Readonly<{ status: "blocked"; reason: DeploymentBlockedReason }> |
  Readonly<{ status: "verified"; anchor: Readonly<{ number: bigint; hash: Hex }>;
    observations: readonly DeploymentObservation[]; next: UnsignedDeploymentIntent | null;
    scope: "trusted-rpc-observation; not-wallet-capability-or-L1-finality" }>;

const modules = ["ParamsController", "NFTVault", "EscrowVault", "DistributionVault", "ReputationAdapter", "AuctionHouse"] as const;
const runtimeHashes: Readonly<Record<DeploymentModule, Hex>> = Object.freeze({
  ParamsController: "0xdb96e363a63af447cabe6d2dddd8aa0b73e0501870d0eababf0143bf9f4df4df",
  NFTVault: "0xcf450dd869ea740a9d19826cec267122e0fdb5316a6b9ceccf2387e90e12fa66",
  EscrowVault: "0x215bcdb9cd0e5574ac04a511409e79a97f1c868139d0a16810a4d02020d389f9",
  DistributionVault: "0x4b993cfb508ad4b52f1e373c206f318725273f3092321ef8c631fbb6f78a5057",
  ReputationAdapter: "0x122433baecaf2a0c75c2ccadcd3d4da03f8674b6a7c5f7b67d3792f34f86e4fb",
  AuctionHouse: "0x56b7047b4c7a947f165970e67eaeee93be4f16bf33583478c4d662bbbe56832b"
});
const zero = "0x0000000000000000000000000000000000000000" as Address;
const addressViews = ["owner", "auctionHouse", "paramsController", "nftVault", "escrowVault", "distributionVault", "reputationAdapter", "feeRecipient"];
const viewAbi: Abi = [
  ...addressViews.map(name => ({ type: "function" as const, name, stateMutability: "view" as const, inputs: [], outputs: [{ type: "address" }] })),
  ...["FORMULA_ID", "ARITHMETIC_ID", "ROUNDING_ID"].map(name => ({ type: "function" as const, name, stateMutability: "view" as const, inputs: [], outputs: [{ type: "string" }] })),
  { type: "function", name: "nextAuctionId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }
];
// Exact existing constructor defaults; this verifier never selects or writes parameters.
const defaults = Object.freeze({ bidbackFeeBps: 500, redistributionBps: 5_000, minParticipants: 2,
  alphaBps: 6_000, betaBps: 3_000, gammaBps: 1_000, minBidIncrementBps: 500, perUserRewardCapBps: 4_000,
  maxParticipants: 64, maxInteractionCount: 5, minAuctionDuration: 3_600n, antiSnipeWindow: 600n,
  antiSnipeExtension: 600n, maxAntiSnipeExtensions: 6, minExposure: 300n, minPremiumNet: 10_000_000_000_000_000n,
  efCap: 1_000_000_000_000_000_000n, etCap: 1_000_000_000_000_000_000n, iiCap: 1_000_000_000_000_000_000n, rankSoftness: 4 });

class Blocked extends Error { constructor(readonly reason: DeploymentBlockedReason) { super(reason); } }
function fail(reason: DeploymentBlockedReason): never { throw new Blocked(reason); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function same(a: unknown, b: unknown) { return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase(); }
function address(value: unknown): value is Address { return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value); }
function hash(value: unknown): value is Hex { return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0{64}$/i.test(value); }
function data(value: unknown): value is Hex { return typeof value === "string" && /^0x(?:[0-9a-f]{2})*$/i.test(value); }
function quantity(value: unknown, reason: DeploymentBlockedReason): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) fail(reason);
  return BigInt(value);
}
function integer(value: unknown, reason: DeploymentBlockedReason): number {
  const parsed = quantity(value, reason); if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) fail(reason); return Number(parsed);
}
function noAuthorization(value: Record<string, unknown>) {
  if ("authorizationList" in value || "authorization_list" in value) fail("transaction");
}
type Block = Readonly<{ number: bigint; hash: Hex; transactions: readonly Hex[] }>;
function block(value: unknown): Block {
  if (!record(value) || !hash(value.hash) || !Array.isArray(value.transactions) || !value.transactions.every(hash) ||
    new Set(value.transactions.map(value => value.toLowerCase())).size !== value.transactions.length) fail("canonicality");
  return Object.freeze({ number: quantity(value.number, "canonicality"), hash: value.hash,
    transactions: Object.freeze([...value.transactions]) });
}
function observation(rawTransaction: unknown, rawReceipt: unknown, stepId: string, requestedHash: Hex): DeploymentObservation {
  if (!record(rawTransaction) || !record(rawReceipt)) fail("transaction");
  const tx = rawTransaction, receipt = rawReceipt;
  noAuthorization(tx); noAuthorization(receipt);
  if (quantity(tx.type, "transaction") !== 2n || quantity(receipt.type, "transaction") !== 2n ||
    !hash(tx.hash) || !same(tx.hash, requestedHash) || !address(tx.from) || !(tx.to === null || address(tx.to)) || !data(tx.input) ||
    !hash(tx.blockHash) || !hash(receipt.transactionHash) || !address(receipt.from) || !(receipt.to === null || address(receipt.to)) ||
    !(receipt.contractAddress === null || address(receipt.contractAddress)) || !hash(receipt.blockHash) ||
    quantity(receipt.status, "transaction") !== 1n) fail("transaction");
  return Object.freeze({ stepId,
    transaction: Object.freeze({ hash: tx.hash, from: tx.from, to: tx.to, input: tx.input,
      value: quantity(tx.value, "transaction"), nonce: integer(tx.nonce, "transaction"), chainId: integer(tx.chainId, "transaction"),
      blockHash: tx.blockHash, blockNumber: quantity(tx.blockNumber, "transaction"), transactionIndex: integer(tx.transactionIndex, "transaction") }),
    receipt: Object.freeze({ transactionHash: receipt.transactionHash, from: receipt.from, to: receipt.to, contractAddress: receipt.contractAddress,
      status: "success", blockHash: receipt.blockHash, blockNumber: quantity(receipt.blockNumber, "transaction"),
      transactionIndex: integer(receipt.transactionIndex, "transaction") }) });
}

/**
 * Read-only observations from the explicitly trusted RPC, never a send authorization.
 * This is a dated observation, not an atomic reservation of a nonce. Before any later signature the caller must
 * recheck its active connector's account/network and the pending nonce; a verified result cannot authorize sending.
 * Two observed confirmations are not L1 finality or proof against a consistently dishonest RPC.
 * Only EIP-1559 type 2 is supported; this does not certify direct creation in MetaMask or alter EIP-7702 delegation.
 */
export async function confirmTestnetDeployment(
  client: DeploymentReadClient,
  config: DeploymentConfirmationConfig,
  selectedContext: DeploymentContext,
  transactionHashes: readonly Hex[]
): Promise<DeploymentConfirmationResult> {
  try {
    // Capture every caller-controlled input and the request function before the first await.
    const plan = createUnsignedTestnetDeploymentPlan(config);
    const context = Object.freeze({ ...selectedContext });
    if (!Array.isArray(transactionHashes) || transactionHashes.length > 15 || !transactionHashes.every(hash)) fail("input");
    const hashes = Object.freeze([...transactionHashes]);
    if (new Set(hashes.map(value => value.toLowerCase())).size !== hashes.length || context.nonce !== plan.startingNonce + hashes.length) fail("input");
    try { plan.next({ ...context, nonce: plan.startingNonce }); } catch { fail("input"); }
    // This compiled profile has no immutables. A different profile needs a separate substitution verifier.
    for (const module of modules) {
      const artifact = artifacts.contracts[module];
      if (!record(artifact.immutableReferences) || Object.keys(artifact.immutableReferences).length !== 0 ||
        `0x${artifact.runtimeTemplateSha256}` !== runtimeHashes[module]) fail("code");
    }
    const request = client.request.bind(client);
    async function read(method: DeploymentReadMethod, params: readonly unknown[] = []): Promise<unknown> {
      try { return await request(Object.freeze({ method, params: Object.freeze([...params]) })); } catch { fail("rpc"); }
    }
    async function checkChain() { if (quantity(await read("eth_chainId"), "chain") !== BigInt(deploymentChainId)) fail("chain"); }
    await checkChain();
    const anchor = block(await read("eth_getBlockByNumber", ["latest", false]));
    const selector = Object.freeze({ blockHash: anchor.hash, requireCanonical: true as const });
    const blocks = new Map<bigint, Block>();
    const blockHeights = new Map<string, bigint>([[anchor.hash.toLowerCase(), anchor.number]]);
    const observations: DeploymentObservation[] = [];
    for (let index = 0; index < hashes.length; index++) {
      const expected = plan.next({ ...context, nonce: plan.startingNonce + index }, observations)!;
      const tx = await read("eth_getTransactionByHash", [hashes[index]]);
      const receipt = await read("eth_getTransactionReceipt", [hashes[index]]);
      const observed = observation(tx, receipt, expected.stepId, hashes[index]);
      try { plan.next({ ...context, nonce: plan.startingNonce + index + 1 }, [...observations, observed]); } catch { fail("transaction"); }
      if (observed.transaction.blockNumber >= anchor.number) fail("canonicality"); // At least two observed confirmations.
      let canonical = blocks.get(observed.transaction.blockNumber);
      if (!canonical) {
        canonical = block(await read("eth_getBlockByNumber", [`0x${observed.transaction.blockNumber.toString(16)}`, false]));
        blocks.set(canonical.number, canonical);
      }
      if (canonical.number !== observed.transaction.blockNumber || !same(canonical.hash, observed.transaction.blockHash) ||
        !same(canonical.transactions[observed.transaction.transactionIndex], hashes[index])) fail("canonicality");
      const knownHeight = blockHeights.get(canonical.hash.toLowerCase());
      if (knownHeight !== undefined && knownHeight !== canonical.number) fail("canonicality");
      blockHeights.set(canonical.hash.toLowerCase(), canonical.number);
      observations.push(observed);
    }
    const created: Partial<Record<DeploymentModule, Address>> = {};
    for (let index = 0; index < Math.min(6, observations.length); index++) created[modules[index]] = observations[index].receipt.contractAddress!;
    async function view(to: Address, functionName: string, abi: Abi = viewAbi): Promise<unknown> {
      const input = encodeFunctionData({ abi, functionName });
      const output = await read("eth_call", [Object.freeze({ to, data: input }), selector]);
      if (!data(output)) fail("state");
      try { return decodeFunctionResult({ abi, functionName, data: output }); } catch { fail("state"); }
    }
    async function expectedAddress(to: Address, name: string, expected: Address) {
      if (!same(await view(to, name), expected)) fail("state");
    }
    for (let index = 0; index < Math.min(6, observations.length); index++) {
      const module = modules[index], deployed = created[module]!;
      const code = await read("eth_getCode", [deployed, selector]);
      if (!data(code) || !same(sha256(code), runtimeHashes[module])) fail("code");
      await expectedAddress(deployed, "owner", observations.length > 9 + index ? plan.roles.finalOwner : plan.roles.deployer);
    }
    for (let index = 1; index <= 3; index++) {
      const vault = created[modules[index]];
      if (vault) await expectedAddress(vault, "auctionHouse", observations.length > index + 5 ? created.AuctionHouse! : zero);
    }
    if (created.ParamsController) {
      if (await view(created.ParamsController, "paused", amountRankParamsControllerAbi) !== false) fail("state");
      const params = await view(created.ParamsController, "params", amountRankParamsControllerAbi);
      if (!record(params) || Object.entries(defaults).some(([key, value]) => params[key] !== value)) fail("state");
    }
    if (created.AuctionHouse) {
      for (const [index, name] of ["paramsController", "nftVault", "escrowVault", "distributionVault", "reputationAdapter"].entries()) {
        await expectedAddress(created.AuctionHouse, name, created[modules[index]]!);
      }
      await expectedAddress(created.AuctionHouse, "feeRecipient", plan.roles.feeRecipient);
      for (const [name, value] of [["FORMULA_ID", "amount-rank-v1"], ["ARITHMETIC_ID", "floor-delta-q136-muldiv512-v1"],
        ["ROUNDING_ID", "hamilton-first-participation-v1"]]) {
        if (await view(created.AuctionHouse, name) !== value) fail("state");
      }
      if (await view(created.AuctionHouse, "nextAuctionId") !== 1n) fail("state");
    }
    const nextNonce = BigInt(plan.startingNonce + observations.length);
    if (quantity(await read("eth_getTransactionCount", [plan.roles.deployer, selector]), "nonce") !== nextNonce) fail("nonce");
    // A cached block is only a prior observation. Re-read every receipt block and the anchor before success.
    for (const previous of [...blocks.values(), anchor]) {
      const current = block(await read("eth_getBlockByNumber", [`0x${previous.number.toString(16)}`, false]));
      if (current.number !== previous.number || !same(current.hash, previous.hash) || current.transactions.length !== previous.transactions.length ||
        current.transactions.some((value, index) => !same(value, previous.transactions[index]))) fail("canonicality");
    }
    // Read pending only after the potentially longer block rechecks to reduce the freshness window.
    if (quantity(await read("eth_getTransactionCount", [plan.roles.deployer, "pending"]), "nonce") !== nextNonce) fail("nonce");
    await checkChain();
    const next = plan.next(context, observations);
    return Object.freeze({ status: "verified", anchor: Object.freeze({ number: anchor.number, hash: anchor.hash }),
      observations: Object.freeze(observations), next, scope: "trusted-rpc-observation; not-wallet-capability-or-L1-finality" });
  } catch (error) {
    return Object.freeze({ status: "blocked", reason: error instanceof Blocked ? error.reason : "input" });
  }
}
