import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeFunctionResult, toFunctionSelector, type Address, type Hex } from "viem";
import artifacts from "@/contracts/testnetDeploymentArtifacts.json";
import { amountRankParamsControllerAbi } from "@/contracts/paramsControllerAbi";
import { createUnsignedTestnetDeploymentPlan, type DeploymentObservation } from "./testnetDeploymentPlan";
import { confirmTestnetDeployment, type DeploymentConfirmationConfig, type DeploymentReadClient, type DeploymentReadMethod } from "./testnetDeploymentConfirmation";

const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const q = (n: number | bigint) => `0x${n.toString(16)}`;
const zero = addr(0), names = ["ParamsController", "NFTVault", "EscrowVault", "DistributionVault", "ReputationAdapter", "AuctionHouse"] as const;
const created = [addr(701), addr(773), addr(819), addr(887), addr(941), addr(1009)];
const runtimeLengths = [2746, 1828, 3174, 2226, 838, 12065];
const params = { bidbackFeeBps: 500, redistributionBps: 5_000, minParticipants: 2, alphaBps: 6_000, betaBps: 3_000,
  gammaBps: 1_000, minBidIncrementBps: 500, perUserRewardCapBps: 4_000, maxParticipants: 64, maxInteractionCount: 5,
  minAuctionDuration: 3600n, antiSnipeWindow: 600n, antiSnipeExtension: 600n, maxAntiSnipeExtensions: 6,
  minExposure: 300n, minPremiumNet: 10_000_000_000_000_000n, efCap: 10n ** 18n, etCap: 10n ** 18n, iiCap: 10n ** 18n, rankSoftness: 4 };
type Raw = Record<string, unknown>;
type Request = Parameters<DeploymentReadClient["request"]>[0];

function fixture(count: number, equalRoles = false, sameBlock = false) {
  const config: DeploymentConfirmationConfig = { chainId: 84532,
    roles: { deployer: addr(11), finalOwner: equalRoles ? addr(11) : addr(12), feeRecipient: equalRoles ? addr(11) : addr(13) }, startingNonce: 37 };
  const selected = { chainId: 84532, account: config.roles.deployer, nonce: 37 + count };
  const plan = createUnsignedTestnetDeploymentPlan(config);
  const observations: DeploymentObservation[] = [], transactions = new Map<string, Raw>(), receipts = new Map<string, Raw>();
  const blocks = new Map<string, Raw>(), hashes: Hex[] = [];
  for (let index = 0; index < count; index++) {
    const intent = plan.next({ ...selected, nonce: 37 + index }, observations)!;
    const txHash = hash(100 + index), blockNumber = BigInt(sameBlock ? 200 : 200 + index), blockHash = hash(Number(blockNumber) + 1000);
    const transactionIndex = sameBlock ? index : 0, contractAddress = index < 6 ? created[index] : null;
    const observation: DeploymentObservation = { stepId: intent.stepId,
      transaction: { hash: txHash, from: selected.account, to: intent.to, input: intent.data, value: 0n, nonce: 37 + index,
        chainId: 84532, blockHash, blockNumber, transactionIndex },
      receipt: { transactionHash: txHash, from: selected.account, to: intent.to, contractAddress, status: "success", blockHash, blockNumber, transactionIndex } };
    observations.push(observation); hashes.push(txHash);
    transactions.set(txHash, { type: "0x2", ...observation.transaction, value: "0x0", nonce: q(37 + index), chainId: q(84532),
      blockNumber: q(blockNumber), transactionIndex: q(transactionIndex) });
    receipts.set(txHash, { ...observation.receipt, type: "0x2", status: "0x1", blockNumber: q(blockNumber), transactionIndex: q(transactionIndex) });
    const key = q(blockNumber);
    if (!blocks.has(key)) blocks.set(key, { number: key, hash: blockHash, transactions: [] });
    (blocks.get(key)!.transactions as Hex[]).push(txHash);
  }
  const anchor = { number: "0x3e8", hash: hash(2000), transactions: [] };
  blocks.set(anchor.number, anchor);
  const state = new Map<string, Hex>(), codes = new Map<string, Hex>();
  const setAddress = (index: number, name: string, value: Address) => state.set(`${created[index]}:${toFunctionSelector(`${name}()`)}`, encodeAbiParameters([{ type: "address" }], [value]));
  for (let index = 0; index < Math.min(count, 6); index++) {
    // Each compiled runtime was independently checked to be this exact creation-code suffix, with no immutables.
    codes.set(created[index], `0x${artifacts.contracts[names[index]].creationBytecode.slice(-runtimeLengths[index] * 2)}` as Hex);
    setAddress(index, "owner", count > 9 + index ? config.roles.finalOwner : config.roles.deployer);
    if (index >= 1 && index <= 3) setAddress(index, "auctionHouse", count > index + 5 ? created[5] : zero);
  }
  state.set(`${created[0]}:${toFunctionSelector("paused()")}`, encodeAbiParameters([{ type: "bool" }], [false]));
  state.set(`${created[0]}:${toFunctionSelector("params()")}`, encodeFunctionResult({ abi: amountRankParamsControllerAbi, functionName: "params", result: params }));
  ["paramsController", "nftVault", "escrowVault", "distributionVault", "reputationAdapter"].forEach((name, index) => setAddress(5, name, created[index]));
  setAddress(5, "feeRecipient", config.roles.feeRecipient);
  for (const [name, value] of [["FORMULA_ID", "amount-rank-v1"], ["ARITHMETIC_ID", "floor-delta-q136-muldiv512-v1"], ["ROUNDING_ID", "hamilton-first-participation-v1"]]) {
    state.set(`${created[5]}:${toFunctionSelector(`${name}()`)}`, encodeAbiParameters([{ type: "string" }], [value]));
  }
  state.set(`${created[5]}:${toFunctionSelector("nextAuctionId()")}`, encodeAbiParameters([{ type: "uint256" }], [1n]));
  const counts = new Map<string, number>();
  const request = vi.fn(async ({ method, params: args }: Request): Promise<unknown> => {
    counts.set(method, (counts.get(method) ?? 0) + 1);
    if (method === "eth_chainId") return q(84532);
    if (method === "eth_getTransactionByHash") return transactions.get(String(args[0]));
    if (method === "eth_getTransactionReceipt") return receipts.get(String(args[0]));
    if (method === "eth_getBlockByNumber") return structuredClone(args[0] === "latest" ? anchor : blocks.get(String(args[0])));
    if (["eth_getCode", "eth_call"].includes(method) || method === "eth_getTransactionCount" && args[1] !== "pending") {
      expect(args[1]).toEqual({ blockHash: anchor.hash, requireCanonical: true });
      expect(Object.isFrozen(args[1])).toBe(true);
    }
    if (method === "eth_getCode") return codes.get(String(args[0]));
    if (method === "eth_getTransactionCount") return q(37 + count);
    if (method === "eth_call") {
      const call = args[0] as { to: string; data: string }; return state.get(`${call.to}:${call.data}`);
    }
    throw Error("Unexpected method");
  });
  const client: DeploymentReadClient = { request };
  const verify = () => confirmTestnetDeployment(client, config, selected, hashes);
  return { client, request, config, selected, hashes, transactions, receipts, blocks, anchor, state, codes, setAddress, verify, counts };
}

function expectBlocked(result: Awaited<ReturnType<typeof confirmTestnetDeployment>>) {
  expect(result.status).toBe("blocked"); expect(Object.keys(result).sort()).toEqual(["reason", "status"]); expect(Object.isFrozen(result)).toBe(true);
}

describe("read-only testnet deployment confirmation", () => {
  it.each(Array.from({ length: 16 }, (_, i) => i))("verifies complete prefix %i with anchored state and two confirmations", async count => {
    const f = fixture(count), result = await f.verify();
    expect(result.status).toBe("verified");
    if (result.status !== "verified") throw Error(result.reason);
    expect(result.observations).toHaveLength(count);
    expect(result.next?.index ?? null).toBe(count === 15 ? null : count);
    expect(result.anchor).toEqual({ number: 1000n, hash: hash(2000) });
    expect(result.scope).toContain("trusted-rpc");
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.observations)).toBe(true);
    if (count) { expect(Object.isFrozen(result.observations[0])).toBe(true); expect(Object.isFrozen(result.observations[0].transaction)).toBe(true); }
    expect(f.request.mock.calls.length).toBeLessThanOrEqual(100);
    expect([...f.counts.keys()].every(name => !/send|sign|wallet|personal/i.test(name))).toBe(true);
  });
  it("supports explicitly equal roles and transactions ordered in one block", async () => {
    const f = fixture(15, true, true), result = await f.verify();
    expect(result.status).toBe("verified");
    expect(f.counts.get("eth_getBlockByNumber")).toBe(4); // anchor, shared receipt block, both rechecks
  });
  it.each(["type", "authorizationList", "authorization_list", "chainId", "from", "to", "input", "value", "nonce", "hash", "blockHash", "blockNumber", "transactionIndex"])("blocks malformed or altered transaction %s", async key => {
    const f = fixture(1), tx = f.transactions.get(f.hashes[0])!;
    const replacements: Raw = { type: "0x4", authorizationList: [], authorization_list: [], chainId: "0x1", from: addr(99), to: addr(99),
      input: "0x00", value: "0x1", nonce: "0x26", hash: hash(999), blockHash: hash(999), blockNumber: null, transactionIndex: "0x01" };
    tx[key] = replacements[key]; expectBlocked(await f.verify());
  });
  it.each(["type", "authorizationList", "authorization_list", "transactionHash", "from", "to", "contractAddress", "status", "blockHash", "blockNumber", "transactionIndex"])("blocks malformed or altered receipt %s", async key => {
    const f = fixture(1), receipt = f.receipts.get(f.hashes[0])!;
    const replacements: Raw = { type: "0x0", authorizationList: [], authorization_list: [], transactionHash: hash(888), from: addr(88),
      to: addr(88), contractAddress: null, status: "0x0", blockHash: hash(888), blockNumber: "0x0c8", transactionIndex: "0x1" };
    receipt[key] = replacements[key]; expectBlocked(await f.verify());
  });
  it.each(["0x0", "0x1", "0x3", "0x4", "0x02", "0X2", undefined, 2])("rejects unsupported/unparsed transaction type %s", async value => {
    const f = fixture(1); f.transactions.get(f.hashes[0])!.type = value; expectBlocked(await f.verify());
  });
  it.each(["0x", "0x00", "0x01", "-0x1", 0, undefined, "0x20000000000000"])("rejects malformed/unsafe nonce %s", async value => {
    const f = fixture(1); f.transactions.get(f.hashes[0])!.nonce = value; expectBlocked(await f.verify());
  });
  it("rejects a missing transaction or pending/missing receipt", async () => {
    for (const target of ["transaction", "receipt"]) {
      const f = fixture(1); (target === "transaction" ? f.transactions : f.receipts).delete(f.hashes[0]); expectBlocked(await f.verify());
    }
  });
  it.each(["number", "hash", "transactions"])("checks canonical block %s", async key => {
    const f = fixture(1); f.blocks.get("0xc8")![key] = key === "number" ? "0xc9" : key === "hash" ? hash(888) : [hash(888)]; expectBlocked(await f.verify());
  });
  it("blocks insufficient confirmations and receipts beyond the reference block", async () => {
    for (const number of [200, 199]) { const f = fixture(1); f.anchor.number = q(number); expectBlocked(await f.verify()); }
  });
  it.each(["receipt", "anchor"])("rejects duplicate transaction hashes in the %s block", async target => {
    const f = fixture(1);
    if (target === "receipt") f.blocks.get("0xc8")!.transactions = [f.hashes[0], f.hashes[0]];
    else (f.anchor as Raw).transactions = [hash(0xabc), hash(0xabc).toUpperCase().replace("0X", "0x")];
    expectBlocked(await f.verify());
  });
  it("rejects an anchor reusing a receipt block hash at a different height", async () => {
    const f = fixture(1); f.anchor.hash = String(f.blocks.get("0xc8")!.hash) as Hex; expectBlocked(await f.verify());
  });
  it("blocks a receipt block reorganization during state verification", async () => {
    const f = fixture(1), original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async request => {
      if (request.method === "eth_getCode") f.blocks.get("0xc8")!.hash = hash(777);
      return original(request);
    }); expectBlocked(await f.verify());
  });
  it("blocks changed reference hash or block membership on the final recheck", async () => {
    for (const change of ["hash", "transactions"]) {
      const f = fixture(1), original = f.request.getMockImplementation()!;
      f.request.mockImplementation(async request => {
        if (request.method === "eth_getCode") { if (change === "hash") f.anchor.hash = hash(555); else f.anchor.transactions.push(hash(555) as never); }
        return original(request);
      }); expectBlocked(await f.verify());
    }
  });
  it.each(["initial-chain", "final-chain", "pinned-nonce", "pending-nonce"])("blocks changed %s", async change => {
    const f = fixture(0), original = f.request.getMockImplementation()!; let chainReads = 0;
    f.request.mockImplementation(async request => {
      if (request.method === "eth_chainId") { chainReads++; if (change === "initial-chain" || change === "final-chain" && chainReads === 2) return "0x1"; }
      if (request.method === "eth_getTransactionCount" && (request.params[1] === "pending" ? change === "pending-nonce" : change === "pinned-nonce")) return "0x26";
      return original(request);
    }); expectBlocked(await f.verify());
  });
  it("observes a nonce consumed during the final canonical block rechecks", async () => {
    const f = fixture(1), original = f.request.getMockImplementation()!;
    let receiptBlockReads = 0, nonceConsumed = false;
    f.request.mockImplementation(async request => {
      if (request.method === "eth_getBlockByNumber" && request.params[0] === "0xc8") {
        receiptBlockReads++; if (receiptBlockReads === 2) nonceConsumed = true;
      }
      if (request.method === "eth_getTransactionCount" && request.params[1] === "pending" && nonceConsumed) return "0x27";
      return original(request);
    });
    expect(await f.verify()).toEqual({ status: "blocked", reason: "nonce" });
    expect(receiptBlockReads).toBe(2);
  });
  it.each(names)("blocks a nonmatching runtime for %s", async (name) => {
    const f = fixture(6); f.codes.set(created[names.indexOf(name)], "0x6000"); expectBlocked(await f.verify());
  });
  it("blocks altered runtime profile/immutable metadata rather than masking code", async () => {
    const profile = artifacts.contracts.ParamsController;
    const before = profile.immutableReferences;
    try { profile.immutableReferences = { unexpected: [{ start: 0, length: 32 }] }; expectBlocked(await fixture(0).verify()); }
    finally { profile.immutableReferences = before; }
  });
  it.each(["owner-before-transfer", "owner-after-transfer", "vault-unlinked", "vault-linked", "house-module", "fee", "formula", "arithmetic", "rounding", "auction-started", "paused", "params"])("blocks unexpected state %s", async change => {
    const f = fixture(change === "owner-after-transfer" ? 10 : 9);
    if (change.startsWith("owner")) f.setAddress(0, "owner", addr(999));
    if (change === "vault-unlinked") { const partial = fixture(3); partial.setAddress(1, "auctionHouse", created[5]); expectBlocked(await partial.verify()); return; }
    if (change === "vault-linked") f.setAddress(3, "auctionHouse", zero);
    if (change === "house-module") f.setAddress(5, "escrowVault", addr(999));
    if (change === "fee") f.setAddress(5, "feeRecipient", addr(999));
    const textName = change === "formula" ? "FORMULA_ID" : change === "arithmetic" ? "ARITHMETIC_ID" : "ROUNDING_ID";
    if (["formula", "arithmetic", "rounding"].includes(change)) f.state.set(`${created[5]}:${toFunctionSelector(`${textName}()`)}`, encodeAbiParameters([{ type: "string" }], ["other"]));
    if (change === "auction-started") f.state.set(`${created[5]}:${toFunctionSelector("nextAuctionId()")}`, encodeAbiParameters([{ type: "uint256" }], [2n]));
    if (change === "paused") f.state.set(`${created[0]}:${toFunctionSelector("paused()")}`, encodeAbiParameters([{ type: "bool" }], [true]));
    if (change === "params") f.state.set(`${created[0]}:${toFunctionSelector("params()")}`, encodeFunctionResult({ abi: amountRankParamsControllerAbi, functionName: "params", result: { ...params, rankSoftness: 8 } }));
    expectBlocked(await f.verify());
  });
  it.each(["eth_getCode", "eth_call", "eth_getTransactionCount"] as DeploymentReadMethod[])("does not fall back when pinned %s is unsupported", async method => {
    const f = fixture(1), original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async request => { if (request.method === method) throw Error("Pinned block unsupported; sensitive endpoint details"); return original(request); });
    expect(await f.verify()).toEqual({ status: "blocked", reason: "rpc" });
  });
  it.each(Object.keys(params) as (keyof typeof params)[])("checks constructor parameter %s without recalibration", async key => {
    const f = fixture(1), value = params[key];
    const changed = { ...params, [key]: typeof value === "bigint" ? value + 1n : value + 1 };
    f.state.set(`${created[0]}:${toFunctionSelector("params()")}`, encodeFunctionResult({ abi: amountRankParamsControllerAbi, functionName: "params", result: changed }));
    expectBlocked(await f.verify());
  });
  it("blocks invalid selected context and duplicate/surplus/out-of-order histories before returning an intention", async () => {
    for (const change of ["chain", "account", "nonce", "duplicate", "surplus", "reordered"]) {
      const f = fixture(2);
      if (change === "chain") f.selected.chainId = 1;
      if (change === "account") f.selected.account = addr(99);
      if (change === "nonce") f.selected.nonce++;
      if (change === "duplicate") f.hashes[1] = f.hashes[0];
      if (change === "surplus") f.hashes.push(...Array.from({ length: 14 }, (_, i) => hash(300 + i)));
      if (change === "reordered") f.hashes.reverse();
      expectBlocked(await f.verify());
    }
  });
  it("snapshots mutable caller inputs before awaiting and permits read-only retry after interruption", async () => {
    const f = fixture(10), original = f.request.getMockImplementation()!;
    f.request.mockImplementationOnce(async request => {
      (f.config.roles as { finalOwner: Address }).finalOwner = addr(55); f.selected.account = addr(55); f.hashes.push(hash(55));
      return original(request);
    });
    expect((await f.verify()).status).toBe("verified");
    const retry = fixture(1); retry.request.mockRejectedValueOnce(Error("Temporary transport outage"));
    expect(await retry.verify()).toEqual({ status: "blocked", reason: "rpc" });
    expect((await retry.verify()).status).toBe("verified");
    expect(retry.request.mock.calls.every(([request]) => !/send|sign|wallet|personal/i.test(request.method))).toBe(true);
  });
});
