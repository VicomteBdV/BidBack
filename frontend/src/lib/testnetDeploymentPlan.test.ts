import { describe, expect, it } from "vitest";
import { decodeAbiParameters, decodeFunctionData, keccak256, type Address, type Hex } from "viem";
import artifacts from "@/contracts/testnetDeploymentArtifacts.json";
import { createUnsignedTestnetDeploymentPlan, type DeploymentContext, type DeploymentObservation,
  type UnsignedDeploymentIntent } from "./testnetDeploymentPlan";

const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const roles = { deployer: addr(1), finalOwner: addr(2), feeRecipient: addr(3) };
const config = () => ({ chainId: 84532, roles: { ...roles }, startingNonce: 37 });
const context = (completed = 0): DeploymentContext => ({ chainId: 84532, account: roles.deployer, nonce: 37 + completed });
const created = Array.from({ length: 6 }, (_, i) => addr(700 + i * 19));
const functionsAbi = [
  { type: "function", name: "setAuctionHouse", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] },
  { type: "function", name: "transferOwnership", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] }
] as const;

function observation(intent: UnsignedDeploymentIntent): DeploymentObservation {
  return {
    stepId: intent.stepId,
    transaction: { hash: hash(100 + intent.index), from: intent.account, to: intent.to, input: intent.data,
      value: intent.value, nonce: intent.nonce, chainId: intent.chainId, blockHash: hash(1000 + intent.index),
      blockNumber: BigInt(2000 + intent.index), transactionIndex: 0 },
    receipt: { transactionHash: hash(100 + intent.index), from: intent.account, to: intent.to,
      contractAddress: intent.kind === "create" ? created[intent.index] : null, status: "success",
      blockHash: hash(1000 + intent.index), blockNumber: BigInt(2000 + intent.index), transactionIndex: 0 }
  };
}
function fixture(count: number) {
  const plan = createUnsignedTestnetDeploymentPlan(config());
  const observations: DeploymentObservation[] = [];
  for (let i = 0; i < count; i++) observations.push(observation(plan.next(context(i), observations)!));
  return { plan, observations };
}

describe("offline testnet deployment plan", () => {
  it("encodes constructors from explicit roles and receipt-created addresses, then links and transfers every module", () => {
    const plan = createUnsignedTestnetDeploymentPlan(config());
    const observations: DeploymentObservation[] = [];
    const expectedModules = ["ParamsController", "NFTVault", "EscrowVault", "DistributionVault", "ReputationAdapter", "AuctionHouse"] as const;
    for (let i = 0; i < 15; i++) {
      const next = plan.next(context(i), observations)!;
      expect(next.value).toBe(0n);
      expect(next.nonce).toBe(37 + i);
      if (i < 6) {
        expect(next.to).toBeNull();
        const artifact = artifacts.contracts[expectedModules[i]];
        expect(next.data.startsWith(artifact.creationBytecode)).toBe(true);
        const constructorData = `0x${next.data.slice(artifact.creationBytecode.length)}` as Hex;
        const decoded = decodeAbiParameters(Array.from({ length: i === 5 ? 7 : 1 }, () => ({ type: "address" as const })), constructorData);
        expect(decoded.map(x => String(x).toLowerCase())).toEqual((i === 5 ? [roles.deployer, ...created.slice(0, 5), roles.feeRecipient] : [roles.deployer]).map(x => x.toLowerCase()));
      } else {
        const decoded = decodeFunctionData({ abi: functionsAbi, data: next.data });
        expect(decoded.functionName).toBe(i < 9 ? "setAuctionHouse" : "transferOwnership");
        expect(decoded.args[0].toLowerCase()).toBe((i < 9 ? created[5] : roles.finalOwner).toLowerCase());
        expect(next.to?.toLowerCase()).toBe(created[i < 9 ? i - 5 : i - 9].toLowerCase());
      }
      observations.push(observation(next));
    }
    expect(plan.next(context(15), observations)).toBeNull();
    expect(plan.observationScope).toContain("offline-consistency-only");
  });

  it("snapshots role and bytecode inputs and returns immutable intents without retaining caller history", () => {
    const mutableConfig = config(), mutableArtifacts = structuredClone(artifacts);
    const plan = createUnsignedTestnetDeploymentPlan(mutableConfig, mutableArtifacts);
    const initial = plan.next(context())!;
    mutableConfig.roles.deployer = addr(88);
    mutableArtifacts.contracts.ParamsController.creationBytecode = "0x00";
    expect(plan.next(context())).toEqual(initial);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.roles)).toBe(true);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(() => { (initial as { value: bigint }).value = 1n; }).toThrow();
    const completed = [observation(initial)];
    const original = structuredClone(completed);
    plan.next(context(1), completed);
    expect(completed).toEqual(original);
  });

  it.each([0, 31337, 8453, NaN, "84532", undefined])("rejects unsupported configured chain %s", chainId => {
    expect(() => createUnsignedTestnetDeploymentPlan({ ...config(), chainId } as never)).toThrow();
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER - 14, "37", undefined])("rejects unsafe starting nonce %s", startingNonce => {
    expect(() => createUnsignedTestnetDeploymentPlan({ ...config(), startingNonce } as never)).toThrow();
  });
  it.each(["deployer", "finalOwner", "feeRecipient"] as const)("requires a valid explicit nonzero %s", key => {
    for (const invalid of [undefined, "0x", addr(0), "0x1234", `${addr(4)}z`]) {
      const c = config();
      expect(() => createUnsignedTestnetDeploymentPlan({ ...c, roles: { ...c.roles, [key]: invalid } } as never)).toThrow();
    }
  });
  it("allows explicitly equal roles without imposing an unapproved identity policy", () => {
    const plan = createUnsignedTestnetDeploymentPlan({ ...config(), roles: { deployer: roles.deployer, finalOwner: roles.deployer, feeRecipient: roles.deployer } });
    expect(plan.next(context())?.account).toBe(roles.deployer);
  });

  it("rejects caller-rehashed bytecode instead of trusting its matching self-reported checksum", () => {
    const bad = structuredClone(artifacts);
    bad.contracts.ParamsController.creationBytecode += "00";
    bad.contracts.ParamsController.creationBytecodeKeccak256 = keccak256(bad.contracts.ParamsController.creationBytecode as Hex);
    expect(() => createUnsignedTestnetDeploymentPlan(config(), bad)).toThrow();
  });
  it.each(["schemaVersion", "chainId", "sourceCommit", "sourceTree", "compiler", "optimizerRuns", "viaIR", "evmVersion"])("rejects altered provenance %s", key => {
    const bad = structuredClone(artifacts) as Record<string, unknown>;
    bad[key] = null;
    expect(() => createUnsignedTestnetDeploymentPlan(config(), bad)).toThrow();
  });
  it("rejects missing/extra modules and a constructor schema with changed argument types", () => {
    const missing = structuredClone(artifacts) as unknown as { contracts: Record<string, unknown> };
    delete missing.contracts.NFTVault;
    expect(() => createUnsignedTestnetDeploymentPlan(config(), missing)).toThrow();
    const extra = structuredClone(artifacts) as unknown as { contracts: Record<string, unknown> };
    extra.contracts.Factory = {};
    expect(() => createUnsignedTestnetDeploymentPlan(config(), extra)).toThrow();
    const wrongAbi = structuredClone(artifacts);
    wrongAbi.contracts.AuctionHouse.constructorAbi[0].inputs[0].type = "uint256";
    expect(() => createUnsignedTestnetDeploymentPlan(config(), wrongAbi)).toThrow();
  });

  it.each([
    { chainId: 8453 }, { account: addr(9) }, { nonce: 38 }, { nonce: -1 }, { authorizationList: [] }
  ])("rejects changed or unsupported signing context %o", changes => {
    const { plan } = fixture(0);
    expect(() => plan.next({ ...context(), ...changes })).toThrow();
    expect(plan.next(context())?.nonce).toBe(37);
  });

  const txChanges: Array<[string, Record<string, unknown>]> = [
    ["hash", { hash: hash(0) }], ["sender", { from: addr(44) }], ["chain", { chainId: 8453 }],
    ["nonce", { nonce: 38 }], ["target", { to: addr(55) }], ["data", { input: "0x1234" }],
    ["value", { value: 1n }], ["numeric value", { value: 0 }], ["block hash", { blockHash: hash(0) }],
    ["block number", { blockNumber: -1n }], ["block number type", { blockNumber: 2000 }],
    ["transaction index", { transactionIndex: -1 }], ["hidden authorization", { authorizationList: [] }]
  ];
  it.each(txChanges)("rejects altered provided transaction %s and accepts the unaltered history on retry", (_, changes) => {
    const { plan, observations } = fixture(1);
    const bad = structuredClone(observations);
    Object.assign(bad[0].transaction, changes);
    expect(() => plan.next(context(1), bad)).toThrow();
    expect(plan.next(context(1), observations)?.module).toBe("NFTVault");
  });
  const receiptChanges: Array<[string, Record<string, unknown>]> = [
    ["hash", { transactionHash: hash(99) }], ["sender", { from: addr(9) }], ["destination", { to: addr(5) }],
    ["status", { status: "reverted" }], ["missing status", { status: undefined }],
    ["block hash", { blockHash: hash(9999) }], ["block number", { blockNumber: 2001n }],
    ["index", { transactionIndex: 1 }], ["missing created address", { contractAddress: null }],
    ["zero created address", { contractAddress: addr(0) }], ["role address reused", { contractAddress: roles.deployer }]
  ];
  it.each(receiptChanges)("rejects inconsistent provided receipt %s", (_, changes) => {
    const { plan, observations } = fixture(1);
    const bad = structuredClone(observations);
    Object.assign(bad[0].receipt, changes);
    expect(() => plan.next(context(1), bad)).toThrow();
  });
  it("rejects omitted, unordered, duplicate and surplus observations", () => {
    const { plan, observations } = fixture(15);
    expect(() => plan.next(context(2), [observations[1]])).toThrow();
    expect(() => plan.next(context(2), [observations[1], observations[0]])).toThrow();
    expect(() => plan.next(context(2), [observations[0], observations[0]])).toThrow();
    expect(() => plan.next({ ...context(), nonce: 53 }, [...observations, observations[14]])).toThrow();
    const missingField = structuredClone(observations[0]) as unknown as Record<string, unknown>;
    delete missingField.transaction;
    expect(() => plan.next(context(1), [missingField] as never)).toThrow();
    expect(() => plan.next(context(1), [{ ...observations[0], verified: true }] as never)).toThrow();
  });
  it("rejects duplicate receipt-created contract addresses and transaction hashes", () => {
    const { plan, observations } = fixture(2);
    const duplicateAddress = structuredClone(observations);
    Object.assign(duplicateAddress[1].receipt, { contractAddress: created[0] });
    expect(() => plan.next(context(2), duplicateAddress)).toThrow();
    const duplicateHash = structuredClone(observations);
    Object.assign(duplicateHash[1].transaction, { hash: duplicateHash[0].transaction.hash });
    Object.assign(duplicateHash[1].receipt, { transactionHash: duplicateHash[0].transaction.hash });
    expect(() => plan.next(context(2), duplicateHash)).toThrow();
  });
  it("binds vault calls and ownership calls to exact receipt-created targets and intended arguments", () => {
    for (const count of [7, 10, 15]) {
      const { plan, observations } = fixture(count);
      const bad = structuredClone(observations);
      Object.assign(bad[count - 1].transaction, { to: roles.deployer });
      Object.assign(bad[count - 1].receipt, { to: roles.deployer });
      expect(() => plan.next(context(count), bad)).toThrow();
      const fakeCreation = structuredClone(observations);
      Object.assign(fakeCreation[count - 1].receipt, { contractAddress: addr(9000) });
      expect(() => plan.next(context(count), fakeCreation)).toThrow();
    }
  });
  it("accepts ordered transactions in one block and rejects conflicting block identities or ordering", () => {
    const { plan, observations } = fixture(2);
    const sameBlock = structuredClone(observations);
    Object.assign(sameBlock[1].transaction, { blockNumber: sameBlock[0].transaction.blockNumber,
      blockHash: sameBlock[0].transaction.blockHash, transactionIndex: 1 });
    Object.assign(sameBlock[1].receipt, { blockNumber: sameBlock[0].receipt.blockNumber,
      blockHash: sameBlock[0].receipt.blockHash, transactionIndex: 1 });
    expect(plan.next(context(2), sameBlock)?.module).toBe("EscrowVault");
    const badHash = structuredClone(sameBlock);
    Object.assign(badHash[1].transaction, { blockHash: hash(4000) });
    Object.assign(badHash[1].receipt, { blockHash: hash(4000) });
    expect(() => plan.next(context(2), badHash)).toThrow();
    const badIndex = structuredClone(sameBlock);
    Object.assign(badIndex[1].transaction, { transactionIndex: 0 });
    Object.assign(badIndex[1].receipt, { transactionIndex: 0 });
    expect(() => plan.next(context(2), badIndex)).toThrow();
    const reusedBlockHash = structuredClone(observations);
    Object.assign(reusedBlockHash[1].transaction, { blockHash: observations[0].transaction.blockHash });
    Object.assign(reusedBlockHash[1].receipt, { blockHash: observations[0].receipt.blockHash });
    expect(() => plan.next(context(2), reusedBlockHash)).toThrow();
  });
  it("does not treat a sequential-nonce gap as supported delegated-wallet behavior", () => {
    const { plan, observations } = fixture(1);
    expect(() => plan.next({ ...context(1), nonce: 39 }, observations)).toThrow();
    expect(plan.next(context(1), observations)?.nonce).toBe(38);
  });
});
