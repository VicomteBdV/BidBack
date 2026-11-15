import { encodeDeployData, encodeFunctionData, keccak256, type Abi, type Address, type Hex } from "viem";
import approvedArtifacts from "@/contracts/testnetDeploymentArtifacts.json";

export const deploymentChainId = 84532 as const;
const modules = ["ParamsController", "NFTVault", "EscrowVault", "DistributionVault", "ReputationAdapter", "AuctionHouse"] as const;
export type DeploymentModule = typeof modules[number];
export type DeploymentRoles = Readonly<{ deployer: Address; finalOwner: Address; feeRecipient: Address }>;
export type DeploymentContext = Readonly<{ chainId: number; account: Address; nonce: number }>;
export type UnsignedDeploymentIntent = Readonly<{
  stepId: string; index: number; module: DeploymentModule; kind: "create" | "link" | "ownership";
  chainId: 84532; account: Address; nonce: number; to: Address | null; data: Hex; value: 0n;
}>;
export type DeploymentObservation = Readonly<{
  stepId: string;
  transaction: Readonly<{ hash: Hex; from: Address; to: Address | null; input: Hex; value: bigint; nonce: number;
    chainId: number; blockHash: Hex; blockNumber: bigint; transactionIndex: number }>;
  receipt: Readonly<{ transactionHash: Hex; from: Address; to: Address | null; contractAddress: Address | null;
    status: "success" | "reverted"; blockHash: Hex; blockNumber: bigint; transactionIndex: number }>;
}>;

const anchors: Readonly<Record<DeploymentModule, Hex>> = Object.freeze({
  ParamsController: "0x2729a2c61c3c4bd2435d0c1d80b0fdea35643eee63a0c3545d0ccdac3ba493e3",
  NFTVault: "0xe034978d43263996329ac4f337f4ece74dce8d39220b80313f0098c1e8cda7e5",
  EscrowVault: "0xbbe235c4348e9da7caa909620f6f7167217fa8240591551940ef5d29e193c5af",
  DistributionVault: "0x7e62a37bd9a20aeed7a60f5a369ab61820fd03414d206b8869197d1d0b022f42",
  ReputationAdapter: "0xd5f2170fb2bd7fe18ebe7ba592c6d898e4fb9e2422b08c36bbf16e1d30f48003",
  AuctionHouse: "0x1ee3d4700f7de99707ca1676fa218831da4629bb88b693be4e36059f6c0ec1ab"
});
const constructorAbi = (count: number): Abi => [{ type: "constructor", stateMutability: "nonpayable",
  inputs: Array.from({ length: count }, () => ({ type: "address" })) }];
const writeAbi = [{ type: "function", name: "setAuctionHouse", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] },
  { type: "function", name: "transferOwnership", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] }] as const;

function fail(): never { throw new Error("Unsigned testnet deployment input is inconsistent or unsupported."); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function address(value: unknown): value is Address {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
}
function hex(value: unknown): value is Hex { return typeof value === "string" && /^0x(?:[0-9a-f]{2})*$/i.test(value); }
function hash(value: unknown): value is Hex { return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0{64}$/i.test(value); }
function same(a: unknown, b: unknown) { return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase(); }
function target(a: unknown, b: Address | null) { return b === null ? a === null : address(a) && same(a, b); }
function safeNonce(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function nonnegative(value: unknown): value is bigint { return typeof value === "bigint" && value >= 0n; }

function verifiedBytecodes(value: unknown): Readonly<Record<DeploymentModule, Hex>> {
  if (!record(value) || value.schemaVersion !== 1 || value.chainId !== deploymentChainId ||
    value.sourceCommit !== "5ee8f2e70c7200f7e2fdddb952144363bb5504b3" ||
    value.sourceTree !== "3ddeb79367395be8a8dcc122863251807f0607ce" ||
    value.compiler !== "0.8.24+commit.e11b9ed9" || value.optimizerRuns !== 200 || value.viaIR !== true || value.evmVersion !== "cancun" ||
    !exactKeys(value.contracts, modules)) fail();
  const result = {} as Record<DeploymentModule, Hex>;
  for (const name of modules) {
    const artifact = value.contracts[name];
    if (!record(artifact) || !hex(artifact.creationBytecode) || artifact.creationBytecode.length <= 2 ||
      artifact.creationBytecode.length > 2 + 49_152 * 2 || !same(artifact.creationBytecodeKeccak256, anchors[name]) ||
      !same(keccak256(artifact.creationBytecode), anchors[name]) || !Array.isArray(artifact.constructorAbi) || artifact.constructorAbi.length !== 1) fail();
    const constructor = artifact.constructorAbi[0];
    if (!record(constructor) || constructor.type !== "constructor" || constructor.stateMutability !== "nonpayable" ||
      !Array.isArray(constructor.inputs) || constructor.inputs.length !== (name === "AuctionHouse" ? 7 : 1) ||
      !constructor.inputs.every(input => record(input) && input.type === "address")) fail();
    // Encode using our fixed constructor schema, never caller-supplied ABI names or extra fields.
    result[name] = artifact.creationBytecode;
  }
  return Object.freeze(result);
}

const transactionKeys = ["hash", "from", "to", "input", "value", "nonce", "chainId", "blockHash", "blockNumber", "transactionIndex"] as const;
const receiptKeys = ["transactionHash", "from", "to", "contractAddress", "status", "blockHash", "blockNumber", "transactionIndex"] as const;

/**
 * Offline consistency planner only. This neither sends nor confirms transactions.
 * A future selected-wallet adapter must obtain canonical observations, verify code/state,
 * and reject unsupported transaction authorizations BEFORE using this normalized model.
 * In particular this does not certify EIP-7702 capability, nonce behavior, or an empty account code.
 */
export function createUnsignedTestnetDeploymentPlan(
  config: Readonly<{ chainId: number; roles: DeploymentRoles; startingNonce: number }>,
  artifacts: unknown = approvedArtifacts
) {
  if (!exactKeys(config, ["chainId", "roles", "startingNonce"]) || config.chainId !== deploymentChainId ||
    !exactKeys(config.roles, ["deployer", "finalOwner", "feeRecipient"]) ||
    !address(config.roles.deployer) || !address(config.roles.finalOwner) || !address(config.roles.feeRecipient) ||
    !safeNonce(config.startingNonce) || config.startingNonce > Number.MAX_SAFE_INTEGER - 15) fail();
  const roles = Object.freeze({ deployer: config.roles.deployer, finalOwner: config.roles.finalOwner, feeRecipient: config.roles.feeRecipient });
  const startingNonce = config.startingNonce;
  const bytecodes = verifiedBytecodes(artifacts);

  function intent(index: number, created: Partial<Record<DeploymentModule, Address>>): UnsignedDeploymentIntent {
    let module: DeploymentModule, kind: UnsignedDeploymentIntent["kind"], to: Address | null, data: Hex;
    if (index < 6) {
      module = modules[index]; kind = "create"; to = null;
      const args = module === "AuctionHouse"
        ? [roles.deployer, ...modules.slice(0, 5).map(name => { const result = created[name]; if (!address(result)) fail(); return result; }), roles.feeRecipient]
        : [roles.deployer];
      data = encodeDeployData({ abi: constructorAbi(args.length), bytecode: bytecodes[module], args });
    } else {
      kind = index < 9 ? "link" : "ownership";
      module = index < 9 ? modules[index - 5] : modules[index - 9];
      const destination = created[module]; if (!address(destination)) fail(); to = destination;
      const argument = kind === "link" ? created.AuctionHouse : roles.finalOwner; if (!address(argument)) fail();
      data = encodeFunctionData({ abi: writeAbi, functionName: kind === "link" ? "setAuctionHouse" : "transferOwnership", args: [argument] });
    }
    return Object.freeze({ stepId: `${index}:${kind}:${module}`, index, module, kind, chainId: deploymentChainId,
      account: roles.deployer, nonce: startingNonce + index, to, data, value: 0n });
  }

  function next(context: DeploymentContext, observations: readonly DeploymentObservation[] = []): UnsignedDeploymentIntent | null {
    if (!exactKeys(context, ["chainId", "account", "nonce"]) || context.chainId !== deploymentChainId ||
      !same(context.account, roles.deployer) || !safeNonce(context.nonce) || !Array.isArray(observations) ||
      observations.length > 15 || context.nonce !== startingNonce + observations.length) fail();
    const created: Partial<Record<DeploymentModule, Address>> = {};
    const usedAddresses = new Set<string>([roles.deployer.toLowerCase(), roles.finalOwner.toLowerCase(), roles.feeRecipient.toLowerCase()]);
    const usedHashes = new Set<string>();
    const observedBlocks = new Map<string, bigint>();
    let priorBlock = -1n, priorIndex = -1, priorBlockHash: Hex | undefined;
    for (let index = 0; index < observations.length; index++) {
      const observed: unknown = observations[index];
      const expected = intent(index, created);
      if (!exactKeys(observed, ["stepId", "transaction", "receipt"]) || observed.stepId !== expected.stepId ||
        !exactKeys(observed.transaction, transactionKeys) || !exactKeys(observed.receipt, receiptKeys)) fail();
      const tx = observed.transaction, receipt = observed.receipt;
      if (!hash(tx.hash) || usedHashes.has(tx.hash.toLowerCase()) || !same(tx.from, roles.deployer) ||
        !target(tx.to, expected.to) || !hex(tx.input) || !same(tx.input, expected.data) || tx.value !== 0n ||
        tx.nonce !== expected.nonce || tx.chainId !== deploymentChainId || !hash(tx.blockHash) ||
        !nonnegative(tx.blockNumber) || !safeNonce(tx.transactionIndex) ||
        receipt.status !== "success" || !same(receipt.transactionHash, tx.hash) || !same(receipt.from, tx.from) ||
        !target(receipt.to, expected.to) || !same(receipt.blockHash, tx.blockHash) || receipt.blockNumber !== tx.blockNumber ||
        receipt.transactionIndex !== tx.transactionIndex || tx.blockNumber < priorBlock ||
        (observedBlocks.has(tx.blockHash.toLowerCase()) && observedBlocks.get(tx.blockHash.toLowerCase()) !== tx.blockNumber) ||
        (tx.blockNumber === priorBlock && (!same(tx.blockHash, priorBlockHash) || tx.transactionIndex <= priorIndex))) fail();
      if (expected.kind === "create") {
        if (!address(receipt.contractAddress) || usedAddresses.has(receipt.contractAddress.toLowerCase())) fail();
        created[expected.module] = receipt.contractAddress;
        usedAddresses.add(receipt.contractAddress.toLowerCase());
      } else if (receipt.contractAddress !== null) fail();
      usedHashes.add(tx.hash.toLowerCase());
      observedBlocks.set(tx.blockHash.toLowerCase(), tx.blockNumber);
      priorBlock = tx.blockNumber; priorIndex = tx.transactionIndex; priorBlockHash = tx.blockHash;
    }
    return observations.length === 15 ? null : intent(observations.length, created);
  }
  return Object.freeze({ chainId: deploymentChainId, roles, startingNonce, operationCount: 15 as const,
    observationScope: "offline-consistency-only; not RPC, canonicality, code or wallet-capability verification" as const, next });
}
