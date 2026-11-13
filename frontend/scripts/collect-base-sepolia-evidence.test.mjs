import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { toFunctionSelector } from "viem";
import { LEGACY_PROFILE, AMOUNT_RANK_PROFILE, AMOUNT_RANK_IDENTITY } from "./local-lifecycle-core.mjs";
import { roles, manifest as fixtureManifest, lifecycleClient } from "./verify-base-sepolia-lifecycle.test.mjs";
import {
  MANIFEST_PATH, PHASES, REPO_ROOT, assertSessionSource, manifestProvenance, phaseEvidence,
  sessionContext, validateSession, verifyPhase
} from "./verify-base-sepolia-lifecycle.mjs";
import {
  ACTORS, TRANSACTION_IDS, assembleEvidence, collectTransactions, expectedTransactions,
  parseCollectorArgs, simulateDuplicates, validateSnapshots, validateTransactionInput, writeEvidenceDirectory
} from "./collect-base-sepolia-evidence.mjs";

const clone = (value) => structuredClone(value);
const hash = (number) => `0x${number.toString(16).padStart(64, "0")}`;
const session = validateSession({ schemaVersion: 1, runId: "fixture-run", chainId: 84532, sourceCommit: "a".repeat(40),
  manifest: MANIFEST_PATH, auctionId: "7", roles, nft: { address: `0x${"14".padStart(40, "0")}`, tokenId: "1" } });
const bytes = Buffer.from(JSON.stringify({ ...fixtureManifest, generatedAt: "2026-08-01T21:12:38.667Z", source: "foundry-broadcast:DeployTestnet.s.sol" }));
const { manifest, provenance } = manifestProvenance(bytes);
const bundle = { session, manifest, provenance };
const input = { schemaVersion: 1, runId: session.runId, sourceCommit: session.sourceCommit, chainId: 84532,
  auctionId: "7", manifestChecksum: provenance.checksum, transactions: Object.fromEntries(TRANSACTION_IDS.map((id, index) => [id, hash(index + 1)])) };

function fixture(profile = LEGACY_PROFILE) {
  const client = lifecycleClient(profile);
  const actions = expectedTransactions(session, manifest);
  const txs = {}; const receipts = {};
  TRANSACTION_IDS.forEach((id, index) => {
    const h = input.transactions[id];
    const number = 100n + BigInt(index);
    txs[h] = { hash: h, from: roles[ACTORS[id]], to: actions[id].to, value: actions[id].value,
      input: actions[id].input ?? "0x6000", blockNumber: number, blockHash: hash(number), transactionIndex: 0 };
    receipts[h] = { transactionHash: h, from: txs[h].from, to: txs[h].to, contractAddress: id === "P1" ? session.nft.address : null,
      blockNumber: number, blockHash: hash(number), transactionIndex: 0, status: "success", gasUsed: 21000n, effectiveGasPrice: 1000000n,
      logs: [{ address: session.nft.address, data: "0x", topics: [hash(700)], logIndex: 0, removed: false,
        transactionHash: h, blockHash: hash(number), blockNumber: number, transactionIndex: 0 }] };
  });
  client.getTransaction = async ({ hash }) => txs[hash];
  client.getTransactionReceipt = async ({ hash }) => receipts[hash];
  const calls = [];
  client.request = async ({ method, params }) => {
    assert.equal(method, "eth_call");
    assert.equal(params[1], "0x70");
    const args = params[0];
    calls.push(args);
    const id = ["T7", "T8", "T9", "T10", "T11"].find((id) => actions[id].input === args.data);
    assert.equal(args.from, roles[ACTORS[id]]);
    assert.equal(args.to, actions[id].to);
    const signature = { T7: "NFTAlreadyClaimed()", T8: "RefundAlreadyClaimed()", T9: "RewardAlreadyClaimed()", T10: "NothingToClaim()", T11: "NothingToClaim()" }[id];
    throw { cause: { data: toFunctionSelector(signature) }, message: "https://secret.invalid/API_CREDENTIAL" };
  };
  return { client, txs, receipts, calls };
}

async function snapshots(client, selectedSession = session) {
  return Promise.all(PHASES.map(async (phase, index) => phaseEvidence(selectedSession, provenance, phase,
    await verifyPhase(client, manifest, sessionContext(selectedSession, manifest, phase), 101n + BigInt(index)), "2026-09-11T00:00:00.000Z")));
}

test("strict session accepts public metadata and rejects bad identities and unsupported fields", () => {
  assert.deepEqual(validateSession(session), session);
  const mutations = [
    (s) => { s.chainId = 1; }, (s) => { s.schemaVersion = 2; }, (s) => { s.sourceCommit = "abcdef"; },
    (s) => { s.manifest = "../84532.json"; }, (s) => { s.runId = "https://credential.invalid"; },
    (s) => { s.auctionId = "0"; }, (s) => { s.nft.tokenId = "-1"; }, (s) => { s.nft.tokenId = (2n ** 256n).toString(); },
    (s) => { s.nft.address = "invalid"; }, (s) => { s.roles.bidderA = s.roles.bidderB; }
  ];
  for (const role of Object.keys(roles)) mutations.push((s) => { s.roles[role] = "invalid"; });
  for (const key of ["privateKey", "seed", "rpcUrl", "rpcCredential", "walletExport", "secretToken"]) {
    mutations.push((s) => { s[key] = "SECRET"; }, (s) => { s.roles[key] = "SECRET"; }, (s) => { s.nft[key] = "SECRET"; });
  }
  for (const mutate of mutations) { const bad = clone(session); mutate(bad); assert.throws(() => validateSession(bad)); }
});

test("manifest checksum covers exact bytes and provenance excludes unknown/secret fields", () => {
  assert.equal(provenance.checksum, createHash("sha256").update(bytes).digest("hex"));
  assert.notEqual(manifestProvenance(Buffer.concat([bytes, Buffer.from("\n")])).provenance.checksum, provenance.checksum);
  assert.equal(provenance.path, MANIFEST_PATH);
  assert.equal(provenance.checksumAlgorithm, "sha256");
  for (const change of [{ source: "https://rpc.invalid/SECRET" }, { rpcUrl: "SECRET" }, { chainId: 1 }])
    assert.throws(() => manifestProvenance(Buffer.from(JSON.stringify({ ...manifest, ...change }))));
});

test("source checking requires exact HEAD and clean tracked/untracked files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bidback-source-"));
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git(["init"]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "fixture"]);
    const matching = { ...session, sourceCommit: git(["rev-parse", "HEAD"]) };
    assert.doesNotThrow(() => assertSessionSource(matching, root));
    assert.throws(() => assertSessionSource(session, root), /differs/);
    await writeFile(path.join(root, "untracked.txt"), "fixture");
    assert.throws(() => assertSessionSource(matching, root), /clean/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("all required transaction input metadata and distinct hashes are enforced", () => {
  assert.deepEqual(validateTransactionInput(input, session, provenance), input.transactions);
  for (const key of ["runId", "sourceCommit", "chainId", "auctionId", "manifestChecksum"]) {
    assert.throws(() => validateTransactionInput({ ...input, [key]: "wrong" }, session, provenance));
  }
  for (const id of TRANSACTION_IDS) {
    const missing = clone(input); delete missing.transactions[id];
    assert.throws(() => validateTransactionInput(missing, session, provenance), (error) => error.status === "missing");
  }
  for (const replacement of ["bad", input.transactions.P1]) {
    const bad = clone(input); bad.transactions.T1 = replacement;
    assert.throws(() => validateTransactionInput(bad, session, provenance));
  }
});

test("receipt collector retains public numeric, actor, creation, gas, block and log data", async () => {
  const { client, receipts } = fixture();
  delete receipts[input.transactions.T1].effectiveGasPrice;
  const records = await collectTransactions(client, session, manifest, input.transactions);
  assert.equal(records.length, 12);
  assert.equal(records[0].contractAddress, session.nft.address.toLowerCase());
  assert.equal(records[1].effectiveGasPrice, null);
  assert.deepEqual(records[3], { id: "T3", actor: "bidderA", status: "confirmed", hash: hash(4), receiptStatus: "success",
    blockNumber: "103", blockHash: hash(103), timestampUtc: new Date(1800000103000).toISOString(), transactionIndex: 0,
    from: roles.bidderA.toLowerCase(), to: manifest.contracts.auctionHouse.toLowerCase(), contractAddress: null,
    value: "12000000000000000", gasUsed: "21000", effectiveGasPrice: "1000000",
    logs: [{ address: session.nft.address.toLowerCase(), data: "0x", topics: [hash(700)], logIndex: 0 }] });
});

for (const [label, status, mutate] of [
  ["missing", "missing", (f) => { delete f.txs[input.transactions.T3]; }],
  ["pending transaction", "pending", (f) => { f.txs[input.transactions.T3].blockNumber = null; }],
  ["pending receipt", "pending", (f) => { delete f.receipts[input.transactions.T3]; }],
  ["reverted", "failed", (f) => { f.receipts[input.transactions.T3].status = "reverted"; }],
  ["wrong actor", "invalid", (f) => { f.txs[input.transactions.T3].from = roles.seller; }],
  ["wrong target", "invalid", (f) => { f.txs[input.transactions.T3].to = roles.seller; }],
  ["wrong calldata", "invalid", (f) => { f.txs[input.transactions.T3].input = "0x"; }],
  ["wrong value", "invalid", (f) => { f.txs[input.transactions.T3].value = 0n; }],
  ["receipt block mismatch", "invalid", (f) => { f.receipts[input.transactions.T3].blockHash = hash(999); }],
  ["missing gas", "invalid", (f) => { delete f.receipts[input.transactions.T3].gasUsed; }],
  ["removed log", "invalid", (f) => { f.receipts[input.transactions.T3].logs[0].removed = true; }],
  ["provider error", "invalid", (f) => { f.client.getTransaction = async () => { throw new Error("https://secret.invalid/SECRET"); }; }]
]) test(`collector rejects ${label} with bounded ${status} status`, async () => {
  const f = fixture(); mutate(f);
  await assert.rejects(collectTransactions(f.client, session, manifest, input.transactions), (error) => error.status === status && !error.message.includes("SECRET"));
});

test("collector checks actual RPC chain", async () => {
  const { client } = fixture(); client.getChainId = async () => 31337;
  await assert.rejects(collectTransactions(client, session, manifest, input.transactions));
});

test("snapshots reject every missing phase, duplicates and cross-session/provenance/economic data", async () => {
  const all = await snapshots(fixture().client);
  for (let index = 0; index < PHASES.length; index++) assert.throws(() => validateSnapshots(all.filter((_, i) => i !== index), session, manifest, provenance));
  for (const key of ["runId", "sourceCommit", "chainId", "auctionId"]) {
    const bad = clone(all); bad[1][key] = "wrong";
    assert.throws(() => validateSnapshots(bad, session, manifest, provenance));
  }
  for (const mutate of [
    (a) => { a[1] = a[0]; }, (a) => { a[1].manifest.checksum = "f".repeat(64); },
    (a) => { a[1].lifecycle.escrow.balance = "1"; }, (a) => { a[1].generatedAt = "SECRET"; }
  ]) { const bad = clone(all); mutate(bad); assert.throws(() => validateSnapshots(bad, session, manifest, provenance)); }
});

test("complete package replays every phase, runs five calls, and verifies final afterward", async () => {
  const f = fixture(); const all = await snapshots(f.client);
  const result = await assembleEvidence(f.client, bundle, input, all.reverse());
  assert.equal(result.status, "complete");
  assert.equal(result.snapshots.length, 11);
  assert.deepEqual(result.snapshots.map((s) => s.phase), PHASES);
  assert.equal(f.calls.length, 5);
  assert.equal(result.finalAfterSimulations.lifecycle.escrow.balance, "0");
  assert.equal(result.sourceVerification, "pending-not-evidenced");
  assert.equal(result.readinessGateAdvanced, false);
  assert.ok(!JSON.stringify(result).includes("API_CREDENTIAL"));
});

test("assembly rejects altered nested data, historical block hash and snapshot interval", async () => {
  const f = fixture(); const all = await snapshots(f.client);
  for (const mutate of [
    (a) => { a[0].lifecycle.rpcUrl = "https://secret.invalid/SECRET"; },
    (a) => { a[0].deployment.paused = true; },
    (a) => { a[0].block.hash = hash(999); },
    (a) => { a[0].block.number = "100"; }
  ]) { const bad = clone(all); mutate(bad); await assert.rejects(assembleEvidence(f.client, bundle, input, bad)); }
});

test("duplicate simulations reject success, transport failures, empty and unexpected revert selectors", async () => {
  const expected = toFunctionSelector("NFTAlreadyClaimed()");
  const cycle = {}; cycle.cause = cycle;
  let deep = { data: expected };
  for (let index = 0; index < 10; index++) deep = { cause: deep };
  for (const request of [async () => "0x", async () => expected,
    ...[new Error(`execution reverted ${expected} https://secret.invalid`), { data: "0x12345678" },
      { data: "0x" }, { data: `${expected}00` }, cycle, deep].map((error) => async () => { throw error; })]) {
    const { client } = fixture(); client.request = request;
    await assert.rejects(simulateDuplicates(client, session, manifest, { number: "112" }), (error) =>
      error.status === "invalid" && error.step === "duplicate T7" && !error.message.includes("secret.invalid"));
  }
});

test("duplicate simulations require every expected selector, the pinned block hash and chain", async () => {
  const block = { number: "112", hash: hash(112), timestampUtc: "2026-09-11T00:00:00.000Z" };
  for (let rejectedIndex = 0; rejectedIndex < 5; rejectedIndex++) {
    const { client } = fixture(); const request = client.request; let index = 0;
    client.request = async (args) => {
      if (index++ === rejectedIndex) throw { data: "0x12345678" };
      return request(args);
    };
    await assert.rejects(simulateDuplicates(client, session, manifest, block),
      new RegExp(`duplicate ${["T7", "T8", "T9", "T10", "T11"][rejectedIndex]}`));
  }
  const reorg = fixture(); reorg.client.getBlock = async () => ({ hash: hash(999) });
  await assert.rejects(simulateDuplicates(reorg.client, session, manifest, block), /block changed/);
  const wrongChain = fixture(); wrongChain.client.getChainId = async () => 31337;
  wrongChain.client.request = async () => assert.fail("must reject chain before calls");
  await assert.rejects(simulateDuplicates(wrongChain.client, session, manifest, block));
});

test("final verification must still pass after duplicate calls", async () => {
  const f = fixture(); const all = await snapshots(f.client);
  const getBalance = f.client.getBalance;
  f.client.getBalance = async (args) => f.calls.length === 5 ? 1n : getBalance(args);
  await assert.rejects(assembleEvidence(f.client, bundle, input, all), /escrow.balance/);
});

test("output directories preserve success and failure records and never persist raw errors", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bidback-evidence-"));
  try {
    const f = fixture(); const all = await snapshots(f.client);
    const directory = path.join(root, "success");
    await writeEvidenceDirectory(directory, () => assembleEvidence(f.client, bundle, input, all));
    assert.deepEqual((await readdir(directory)).sort(), ["REPORT.md", "public-evidence.json"]);
    await assert.rejects(writeEvidenceDirectory(directory, () => assert.fail("must not run")), { code: "EEXIST" });
    const failed = path.join(root, "failed");
    await assert.rejects(writeEvidenceDirectory(failed, () => { throw new Error("https://user:SECRET@rpc.invalid"); }));
    assert.deepEqual(await readdir(failed), ["failure.json"]);
    assert.ok(!(await readFile(path.join(failed, "failure.json"), "utf8")).includes("SECRET"));
    await assert.rejects(writeEvidenceDirectory(failed, () => assert.fail("must not run")), { code: "EEXIST" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI malformed input errors do not disclose credentials or raw JSON", () => {
  for (const script of ["verify-base-sepolia-lifecycle.mjs", "collect-base-sepolia-evidence.mjs"]) {
    const result = spawnSync(process.execPath, [path.join(REPO_ROOT, "frontend/scripts", script), "--rpc-url", "https://SECRET.invalid"], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.ok(!result.stderr.includes("SECRET"));
  }
  assert.throws(() => parseCollectorArgs(["--rpc-url", "x", "--rpc-url", "y"]));
});

test("real viem public-client error wrapping preserves expected custom revert bytes", async () => {
  const { createPublicClient, custom } = await import("viem");
  const actions = expectedTransactions(session, manifest);
  const expectations = { T7: "NFTAlreadyClaimed()", T8: "RefundAlreadyClaimed()", T9: "RewardAlreadyClaimed()", T10: "NothingToClaim()", T11: "NothingToClaim()" };
  const methods = [];
  const client = createPublicClient({ transport: custom({ request: async ({ method, params }) => {
    methods.push(method);
    if (method === "eth_chainId") return "0x14a34";
    if (method === "eth_getBlockByNumber") return { number: "0x70", hash: hash(112), timestamp: "0x1" };
    assert.equal(method, "eth_call");
    assert.equal(params[1], "0x70");
    const id = Object.keys(expectations).find((id) => actions[id].input === params[0].data);
    assert.equal(params[0].from.toLowerCase(), roles[ACTORS[id]].toLowerCase());
    throw { code: 3, message: "execution reverted; https://user:SECRET@rpc.invalid", data: toFunctionSelector(expectations[id]) };
  } }, { retryCount: 0 }) });
  const results = await simulateDuplicates(client, session, manifest, { number: "112", hash: hash(112), timestampUtc: "2026-09-11T00:00:00.000Z" });
  assert.equal(results.length, 5);
  assert.deepEqual(methods, ["eth_chainId", ...Array(5).fill("eth_call"), "eth_getBlockByNumber"]);
  assert.ok(!JSON.stringify(results).includes("SECRET"));
});

const modernSession = validateSession({ ...session, schemaVersion: 2, profile: AMOUNT_RANK_PROFILE,
  expectedFormula: { ...AMOUNT_RANK_IDENTITY } });
const modernInput = { ...input, schemaVersion: 2, profile: AMOUNT_RANK_PROFILE, expectedFormula: { ...AMOUNT_RANK_IDENTITY } };

test("schema 1 remains strict legacy and schema 2 requires explicit expected amount-rank identity", () => {
  assert.equal(sessionContext(session, manifest, "final").profile, LEGACY_PROFILE);
  assert.equal(sessionContext(modernSession, manifest, "final").profile, AMOUNT_RANK_PROFILE);
  assert.deepEqual(validateSession(modernSession), modernSession);
  assert.throws(() => validateSession({ ...session, profile: LEGACY_PROFILE }));
  for (const mutate of [
    (s) => { delete s.profile; }, (s) => { s.profile = LEGACY_PROFILE; }, (s) => { s.profile = "unknown"; },
    (s) => { delete s.expectedFormula; }, (s) => { s.schemaVersion = 3; }
  ]) { const bad = clone(modernSession); mutate(bad); assert.throws(() => validateSession(bad)); }
  for (const key of Object.keys(AMOUNT_RANK_IDENTITY)) {
    const missing = clone(modernSession); delete missing.expectedFormula[key];
    assert.throws(() => validateSession(missing));
    const wrong = clone(modernSession); wrong.expectedFormula[key] = "unknown";
    assert.throws(() => validateSession(wrong));
  }
  assert.throws(() => validateSession({ ...modernSession, expectedFormula: { ...AMOUNT_RANK_IDENTITY, extra: "unsupported" } }));
});

test("schema 2 package preserves profile identity and replays every new phase without upgrading historical schema", async () => {
  const f = fixture(AMOUNT_RANK_PROFILE);
  const all = await snapshots(f.client, modernSession);
  const result = await assembleEvidence(f.client, { ...bundle, session: modernSession }, modernInput, all);
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.profile, AMOUNT_RANK_PROFILE);
  assert.deepEqual(result.expectedFormula, AMOUNT_RANK_IDENTITY);
  assert.equal(result.sourceVerification, "pending-not-evidenced");
  assert.equal(result.readinessGateAdvanced, false);
  assert.equal(f.calls.length, 5);
  for (const phase of result.snapshots) {
    assert.equal(phase.schemaVersion, 2);
    assert.equal(phase.profile, AMOUNT_RANK_PROFILE);
    assert.deepEqual(phase.expectedFormula, AMOUNT_RANK_IDENTITY);
    assert.deepEqual(phase.deployment.observedFormula, AMOUNT_RANK_IDENTITY);
  }
  assert.equal(result.finalAfterSimulations.lifecycle.rewards.bidderB.entitlement, "9500000000000000");
  assert.deepEqual(expectedTransactions(modernSession, manifest), expectedTransactions(session, manifest));
  const historical = await snapshots(fixture().client);
  assert.equal(historical[0].schemaVersion, 1);
  assert.ok(!Object.hasOwn(historical[0], "profile"));
  assert.ok(!Object.hasOwn(historical[0], "expectedFormula"));
  assert.ok(!Object.hasOwn(historical[0].deployment, "observedFormula"));
});

test("new and historical session, transaction and snapshot identities cannot be mixed or stripped", async () => {
  const modern = await snapshots(fixture(AMOUNT_RANK_PROFILE).client, modernSession);
  const historical = await snapshots(fixture().client);
  assert.throws(() => validateTransactionInput(input, modernSession, provenance));
  assert.throws(() => validateTransactionInput(modernInput, session, provenance));
  assert.throws(() => validateSnapshots(historical, modernSession, manifest, provenance));
  assert.throws(() => validateSnapshots(modern, session, manifest, provenance));
  for (const mutate of [
    (s) => { delete s.profile; }, (s) => { s.profile = LEGACY_PROFILE; },
    (s) => { s.expectedFormula.scoreScale = "1"; }, (s) => { s.deployment.observedFormula.formulaId = "unknown"; },
    (s) => { delete s.deployment.observedFormula; }
  ]) {
    const bad = clone(modern); mutate(bad[0]);
    assert.throws(() => validateSnapshots(bad, modernSession, manifest, provenance));
  }
  for (const mutate of [
    (i) => { i.profile = LEGACY_PROFILE; }, (i) => { delete i.profile; },
    (i) => { i.expectedFormula.maxAmount = "1"; }, (i) => { delete i.expectedFormula; }
  ]) { const bad = clone(modernInput); mutate(bad); assert.throws(() => validateTransactionInput(bad, modernSession, provenance)); }
  const f = fixture(AMOUNT_RANK_PROFILE);
  const bad = clone(modern); bad[5].lifecycle.scores.bidderA = "1";
  await assert.rejects(assembleEvidence(f.client, { ...bundle, session: modernSession }, modernInput, bad));
});

test("schema 2 cannot turn RPC or identity failure into a historical legacy package", async () => {
  const f = fixture(AMOUNT_RANK_PROFILE);
  const all = await snapshots(f.client, modernSession);
  const read = f.client.readContract;
  f.client.readContract = async (args) => { if (args.functionName === "FORMULA_ID") throw new Error("RPC unavailable"); return read(args); };
  await assert.rejects(assembleEvidence(f.client, { ...bundle, session: modernSession }, modernInput, all));
});
