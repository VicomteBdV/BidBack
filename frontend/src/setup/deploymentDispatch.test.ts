import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Address, type Hex } from "viem";
const confirmation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/testnetDeploymentConfirmation", () => ({ confirmTestnetDeployment: confirmation }));
import { createUnsignedTestnetDeploymentPlan, type UnsignedDeploymentIntent } from "@/lib/testnetDeploymentPlan";
import { beginAttempt, confirmedHashes, journalKey, loadJournal, newJournal, parseSetupConfig, pendingAttempt, saveJournal, updateAttempt, type DeploymentJournal } from "./deploymentSession";
import { createSetupReadRpc, initializeDeployment, quoteExecutionFee, requestDeploymentTransaction, verifyDeployment, type DeploymentServices } from "./deploymentDispatch";
const account = `0x${"12".repeat(20)}` as Address, hash = `0x${"ab".repeat(32)}` as Hex;
function fixture() {
  const config = parseSetupConfig({ version: 1, chainId: 84532, roles: { deployer: account, finalOwner: account, feeRecipient: account } });
  const journal = newJournal(config, 37, { number: "0x10", hash });
  const values = new Map<string, string>(), storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
  saveJournal(storage, journal);
  const intent = createUnsignedTestnetDeploymentPlan({ chainId: 84532, roles: config.roles, startingNonce: 37 }).next({ chainId: 84532, account, nonce: 37 })!;
  confirmation.mockResolvedValue({ status: "verified", anchor: { number: 16n, hash }, next: intent, observations: [], scope: "trusted-rpc-observation; not-wallet-capability-or-L1-finality" });
  const rpc = { request: vi.fn(async ({ method }: { method: string }): Promise<unknown> => {
    if (method === "eth_getTransactionCount") return "0x25";
    if (method === "eth_estimateGas") return "0x186a0";
    if (method === "eth_gasPrice") return "0xa";
    if (method === "eth_maxPriorityFeePerGas") return "0x1";
    if (method === "eth_getBalance") return "0xffffffffff";
    throw Error("Unexpected RPC method");
  }) };
  const wallet = { assertCurrent: vi.fn(async () => {}), request: vi.fn(async ({ method, params }: { method: string; params: readonly unknown[] }): Promise<unknown> => {
    if (method === "eth_accounts") return [account];
    if (method === "eth_chainId") return "0x14a34";
    if (method === "eth_getTransactionCount") return "0x25";
    if (method === "eth_sendTransaction") {
      expect(pendingAttempt(loadJournal(storage, config)!)?.phase).toBe("dispatching");
      expect(params).toHaveLength(1); return hash;
    }
    throw Error("Unexpected wallet method");
  }) };
  const services: DeploymentServices = { rpc, storage, lock: async (_name, action) => action(), resolveWallet: vi.fn(async () => wallet) };
  const sends = () => wallet.request.mock.calls.filter(([request]) => request.method === "eth_sendTransaction");
  return { config, journal, intent, values, storage, rpc, wallet, services, sends };
}
beforeEach(() => confirmation.mockReset());

describe("one explicit setup transaction request", () => {
  it("persists write-ahead before a single zero-value type2 creation and saves its hash", async () => {
    const f = fixture(), result = await requestDeploymentTransaction(f.journal, f.intent, f.services);
    expect(result.status).toBe("submitted"); expect(result.hash).toBe(hash); expect(f.sends()).toHaveLength(1);
    const transaction = f.sends()[0][0].params[0] as Record<string, unknown>;
    expect(transaction).toEqual({ from: account, data: f.intent.data, value: "0x0", type: "0x2", chainId: "0x14a34", nonce: "0x25", gas: "0x1d4c0", maxFeePerGas: "0x15", maxPriorityFeePerGas: "0x1" });
    expect("to" in transaction).toBe(false); expect("authorizationList" in transaction).toBe(false);
    expect(pendingAttempt(loadJournal(f.storage, f.config)!)?.hash).toBe(hash);
    expect(confirmedHashes(result.journal)).toHaveLength(0);
  });
  it("uses the exact destination for a verified contract call", async () => {
    const f = fixture(), target = `0x${"34".repeat(20)}` as Address;
    const intent = { ...f.intent, to: target, kind: "ownership" as const, data: "0x1234" as Hex };
    confirmation.mockResolvedValue({ status: "verified", next: intent });
    await requestDeploymentTransaction(f.journal, intent, f.services);
    expect((f.sends()[0][0].params[0] as { to: string }).to).toBe(target);
  });
  it.each(["unverified", "changed-intent", "wallet", "account", "chain", "rpc-nonce", "wallet-nonce", "fee", "balance", "storage", "lock"])("fails closed before dispatch on %s", async change => {
    const f = fixture(), originalRpc = f.rpc.request.getMockImplementation()!, originalWallet = f.wallet.request.getMockImplementation()!;
    if (change === "unverified") confirmation.mockResolvedValue({ status: "blocked", reason: "code" });
    if (change === "changed-intent") confirmation.mockResolvedValue({ status: "verified", next: { ...f.intent, data: "0x00" } });
    if (change === "wallet") f.services.resolveWallet = async () => { throw Error("No connected wallet"); };
    if (change === "account") f.wallet.request.mockImplementation(async request => request.method === "eth_accounts" ? [`0x${"34".repeat(20)}`] : originalWallet(request));
    if (change === "chain") f.wallet.request.mockImplementation(async request => request.method === "eth_chainId" ? "0x1" : originalWallet(request));
    if (change === "wallet-nonce") f.wallet.request.mockImplementation(async request => request.method === "eth_getTransactionCount" ? "0x26" : originalWallet(request));
    if (["rpc-nonce", "fee", "balance"].includes(change)) f.rpc.request.mockImplementation(async request =>
      change === "rpc-nonce" && request.method === "eth_getTransactionCount" ? "0x26" :
        change === "fee" && request.method === "eth_gasPrice" ? "0x00" :
          change === "balance" && request.method === "eth_getBalance" ? "0x0" : originalRpc(request));
    if (change === "storage") f.storage.setItem.mockImplementation(() => { throw Error("Quota exceeded"); });
    if (change === "lock") f.services.lock = async () => { throw Error("Web Locks unavailable"); };
    await expect(requestDeploymentTransaction(f.journal, f.intent, f.services)).rejects.toThrow(); expect(f.sends()).toHaveLength(0);
  });
  it("rejects a stale checkpoint and an existing unknown attempt without contacting the wallet", async () => {
    const f = fixture(), unknown = updateAttempt(beginAttempt(f.journal), "unknown", null); saveJournal(f.storage, unknown);
    await expect(requestDeploymentTransaction(f.journal, f.intent, f.services)).rejects.toThrow(/changed/);
    await expect(requestDeploymentTransaction(unknown, f.intent, f.services)).rejects.toThrow(/existing attempt/);
    expect(f.services.resolveWallet).not.toHaveBeenCalled(); expect(f.sends()).toHaveLength(0);
  });
  it("blocks a selected provider change during asynchronous estimation", async () => {
    const f = fixture(), original = f.rpc.request.getMockImplementation()!; let changed = false;
    f.rpc.request.mockImplementation(async request => { if (request.method === "eth_estimateGas") changed = true; return original(request); });
    f.wallet.assertCurrent.mockImplementation(async () => { if (changed) throw Error("Provider changed"); });
    await expect(requestDeploymentTransaction(f.journal, f.intent, f.services)).rejects.toThrow(/Provider changed/); expect(f.sends()).toHaveLength(0);
  });
  it("snapshots the caller's displayed intention and journal before awaiting", async () => {
    const f = fixture(), journal = JSON.parse(JSON.stringify(f.journal)) as DeploymentJournal;
    const intent = { ...f.intent };
    confirmation.mockImplementationOnce(async () => { intent.data = "0x00"; (journal.config.roles as { feeRecipient: Address }).feeRecipient = `0x${"34".repeat(20)}`; return { status: "verified", next: f.intent }; });
    await requestDeploymentTransaction(journal, intent, f.services);
    expect((f.sends()[0][0].params[0] as { data: string }).data).toBe(f.intent.data);
  });
  it("serializes concurrent clicks with the chain/account lock and never sends a second request", async () => {
    const f = fixture(); let locked = false; let unblock!: () => void;
    const gate = new Promise<void>(resolve => { unblock = resolve; });
    const original = f.wallet.request.getMockImplementation()!;
    f.wallet.request.mockImplementation(async request => { if (request.method === "eth_sendTransaction") await gate; return original(request); });
    f.services.lock = async (_name, action) => { if (locked) throw Error("Another tab"); locked = true; try { return await action(); } finally { locked = false; } };
    const first = requestDeploymentTransaction(f.journal, f.intent, f.services);
    await vi.waitFor(() => expect(f.sends()).toHaveLength(1));
    await expect(requestDeploymentTransaction(f.journal, f.intent, f.services)).rejects.toThrow(/Another tab/);
    unblock(); await first; expect(f.sends()).toHaveLength(1);
  });
  it.each(["no-hash", "error"])("retains a blocking attempt when the send result is %s", async kind => {
    const f = fixture(), original = f.wallet.request.getMockImplementation()!;
    f.wallet.request.mockImplementation(async request => { if (request.method === "eth_sendTransaction") { if (kind === "error") throw Error("Transport timeout after submission"); return undefined; } return original(request); });
    const result = await requestDeploymentTransaction(f.journal, f.intent, f.services);
    expect(result.status).toBe("unknown"); expect(pendingAttempt(result.journal)?.phase).toBe("unknown");
    await expect(requestDeploymentTransaction(result.journal, f.intent, f.services)).rejects.toThrow(/existing attempt/); expect(f.sends()).toHaveLength(1);
  });
  it("records a user rejection without automatically retrying", async () => {
    const f = fixture(), original = f.wallet.request.getMockImplementation()!;
    f.wallet.request.mockImplementation(async request => { if (request.method === "eth_sendTransaction") throw Object.assign(Error("Rejected"), { code: 4001 }); return original(request); });
    const result = await requestDeploymentTransaction(f.journal, f.intent, f.services);
    expect(result.status).toBe("rejected"); expect(result.journal.attempts[0].phase).toBe("rejected"); expect(f.sends()).toHaveLength(1);
  });
  it("preserves the returned hash and actual write-ahead if post-broadcast storage fails", async () => {
    const f = fixture(), original = f.storage.setItem.getMockImplementation()!;
    f.storage.setItem.mockImplementation((key, value) => { if (JSON.parse(value).attempts.at(-1)?.phase !== "dispatching") throw Error("Disk full after send"); original(key, value); });
    const result = await requestDeploymentTransaction(f.journal, f.intent, f.services);
    expect(result.status).toBe("unknown"); expect(result.hash).toBe(hash); expect(result.journal).toEqual(loadJournal(f.storage, f.config));
    expect(pendingAttempt(result.journal)?.phase).toBe("dispatching"); expect(f.sends()).toHaveLength(1);
  });
  it("does not send from an iframe", async () => {
    const f = fixture(); vi.stubGlobal("window", { self: {}, top: {} });
    await expect(requestDeploymentTransaction(f.journal, f.intent, f.services)).rejects.toThrow(/own browser tab/); expect(f.sends()).toHaveLength(0);
  });
});
describe("read-only setup preparation and recovery", () => {
  it("initializes from a checked account nonce without sending, and never overwrites an existing journal", async () => {
    const f = fixture(); f.values.clear();
    const initialized = await initializeDeployment(f.config, f.services); expect(initialized.startingNonce).toBe(37); expect(f.sends()).toHaveLength(0);
    const pending = updateAttempt(beginAttempt(initialized), "unknown", null); saveJournal(f.storage, pending);
    expect(await initializeDeployment(f.config, f.services)).toEqual(pending); expect(f.sends()).toHaveLength(0);
  });
  it("only advances a pending hash after complete read-only verification", async () => {
    const f = fixture(), pending = updateAttempt(beginAttempt(f.journal), "submitted", hash); saveJournal(f.storage, pending);
    const result = await verifyDeployment(pending, f.services);
    expect(confirmedHashes(result.journal)).toEqual([hash]); expect(pendingAttempt(result.journal)).toBeNull(); expect(f.services.resolveWallet).not.toHaveBeenCalled(); expect(f.sends()).toHaveLength(0);
    expect(confirmation.mock.calls[0][3]).toEqual([hash]);
  });
  it("leaves unknown attempts blocked until a proposed hash is verified, without signing", async () => {
    const f = fixture(), pending = updateAttempt(beginAttempt(f.journal), "unknown", null); saveJournal(f.storage, pending);
    await expect(verifyDeployment(pending, f.services)).rejects.toThrow(/unknown result/);
    confirmation.mockResolvedValueOnce({ status: "blocked", reason: "transaction" });
    await expect(verifyDeployment(pending, f.services, hash)).rejects.toThrow(/blocked/);
    expect(loadJournal(f.storage, f.config)).toEqual(pending);
    expect(confirmedHashes((await verifyDeployment(pending, f.services, hash)).journal)).toEqual([hash]); expect(f.sends()).toHaveLength(0);
  });
  it("provides an execution-only quote without connecting or sending", async () => {
    const f = fixture(), quote = await quoteExecutionFee(f.intent, f.rpc);
    expect(quote).toEqual({ gas: 120000n, maxFeePerGas: 21n, maxPriorityFeePerGas: 1n, maxExecutionFeeWei: 2520000n });
    expect(f.services.resolveWallet).not.toHaveBeenCalled(); expect(f.sends()).toHaveLength(0);
  });
  it("pins the public read endpoint and refuses send methods, malformed or mismatched RPC envelopes", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => ({ ok: true, json: async () => ({ jsonrpc: "2.0", id: JSON.parse(String(init.body)).id, result: "0x25" }) }));
    vi.stubGlobal("fetch", fetcher); const rpc = createSetupReadRpc();
    expect(await rpc.request({ method: "eth_getTransactionCount", params: [account, "pending"] })).toBe("0x25");
    expect(fetcher.mock.calls[0][0]).toBe("https://sepolia.base.org");
    await expect(rpc.request({ method: "eth_sendTransaction", params: [] })).rejects.toThrow(/only permits/); expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ jsonrpc: "2.0", id: -1, result: "0x25" }) });
    await expect(rpc.request({ method: "eth_chainId", params: [] })).rejects.toThrow(/could not verify/);
  });
});
