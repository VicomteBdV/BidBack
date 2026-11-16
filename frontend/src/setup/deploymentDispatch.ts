import { type Hex } from "viem";
import { confirmTestnetDeployment, type DeploymentReadClient, type DeploymentConfirmationResult } from "@/lib/testnetDeploymentConfirmation";
import { type UnsignedDeploymentIntent } from "@/lib/testnetDeploymentPlan";
import { assertCurrentJournal, beginAttempt, confirmedHashes, loadJournal, lockKey, newJournal, pendingAttempt, saveJournal,
  updateAttempt, validHash, parseJournal, parseSetupConfig, type DeploymentJournal, type JournalLock, type JournalStorage, type SetupConfig } from "./deploymentSession";

export type SetupRpc = { request: (request: { method: string; params: readonly unknown[] }) => Promise<unknown> };
export type SelectedSetupWallet = SetupRpc & { assertCurrent: () => Promise<void> };
export type DeploymentServices = { rpc: SetupRpc; storage: JournalStorage; lock: JournalLock; resolveWallet: () => Promise<SelectedSetupWallet> };
export type DispatchResult = { status: "submitted" | "rejected" | "unknown"; journal: DeploymentJournal; hash?: Hex; message: string };
export type ExecutionQuote = Readonly<{ gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; maxExecutionFeeWei: bigint }>;
export function createSetupReadRpc(): SetupRpc {
  const allowed = new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getCode", "eth_call", "eth_getTransactionCount", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_getBalance"]);
  let id = 0;
  return { async request({ method, params }) {
    if (!allowed.has(method)) throw new Error("This connection only permits setup verification reads.");
    const requestId = ++id, controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("https://sepolia.base.org", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }), signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error();
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || (value as { id?: unknown }).id !== requestId ||
        (value as { jsonrpc?: unknown }).jsonrpc !== "2.0" || "error" in value || !("result" in value)) throw new Error();
      return (value as { result: unknown }).result;
    } catch { throw new Error("The Base Sepolia read connection could not verify this response. Nothing is retried automatically."); }
    finally { clearTimeout(timeout); }
  } };
}
function quantity(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) throw new Error("The network returned incomplete data. No transaction was requested.");
  return BigInt(value);
}
const hex = (value: bigint | number): Hex => `0x${value.toString(16)}`;
function topLevel() { if (typeof window !== "undefined" && window.top !== window.self) throw new Error("Open setup directly in its own browser tab."); }
async function identity(wallet: SelectedSetupWallet, config: SetupConfig) {
  await wallet.assertCurrent();
  const accounts = await wallet.request({ method: "eth_accounts", params: [] });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].toLowerCase() !== config.roles.deployer.toLowerCase() ||
    quantity(await wallet.request({ method: "eth_chainId", params: [] })) !== 84532n) throw new Error("The selected wallet or network changed. Reconnect the configured test account.");
}
export async function initializeDeployment(providedConfig: SetupConfig, services: DeploymentServices): Promise<DeploymentJournal> {
  const config = parseSetupConfig(providedConfig);
  topLevel();
  return services.lock(lockKey(config), async () => {
    const existing = loadJournal(services.storage, config); if (existing) return existing;
    const wallet = await services.resolveWallet(); await identity(wallet, config);
    const nonce = quantity(await services.rpc.request({ method: "eth_getTransactionCount", params: [config.roles.deployer, "pending"] }));
    if (nonce > BigInt(Number.MAX_SAFE_INTEGER - 15)) throw new Error("The account nonce is unsupported.");
    const result = await confirmTestnetDeployment(services.rpc as DeploymentReadClient,
      { chainId: config.chainId, roles: config.roles, startingNonce: Number(nonce) },
      { chainId: config.chainId, account: config.roles.deployer, nonce: Number(nonce) }, []);
    if (result.status !== "verified") throw new Error(`Initialization is blocked (${result.reason}). Nothing was sent.`);
    await identity(wallet, config);
    const journal = newJournal(config, Number(nonce), { number: hex(result.anchor.number), hash: result.anchor.hash });
    saveJournal(services.storage, journal); return journal;
  });
}
async function verification(journal: DeploymentJournal, rpc: SetupRpc, hashes = confirmedHashes(journal)): Promise<DeploymentConfirmationResult> {
  return confirmTestnetDeployment(rpc as DeploymentReadClient,
    { chainId: journal.config.chainId, roles: journal.config.roles, startingNonce: journal.startingNonce },
    { chainId: journal.config.chainId, account: journal.config.roles.deployer, nonce: journal.startingNonce + hashes.length }, hashes);
}
/** Reading or recovering a checkpoint cannot connect a wallet or request a signature. */
export async function verifyDeployment(providedJournal: DeploymentJournal, services: Pick<DeploymentServices, "rpc" | "storage" | "lock">, recoveryHash?: string) {
  const journal = parseJournal(JSON.stringify(providedJournal));
  topLevel();
  return services.lock(lockKey(journal.config), async () => {
    assertCurrentJournal(services.storage, journal);
    const attempt = pendingAttempt(journal);
    if (recoveryHash !== undefined && !attempt) throw new Error("There is no unresolved attempt to recover.");
    const candidate = recoveryHash === undefined ? attempt?.hash : recoveryHash;
    if (attempt && !validHash(candidate)) throw new Error("This attempt has an unknown result. Recover its transaction hash before continuing. Do not send it again.");
    const hashes = attempt ? [...confirmedHashes(journal), candidate as Hex] : confirmedHashes(journal);
    const result = await verification(journal, services.rpc, hashes);
    if (result.status !== "verified") throw new Error(`Verification is blocked (${result.reason}). Wait or recover the exact transaction; verification never resends it.`);
    assertCurrentJournal(services.storage, journal);
    const nextJournal = attempt ? updateAttempt(journal, "confirmed", candidate as Hex) : journal;
    if (attempt) saveJournal(services.storage, nextJournal);
    return { journal: nextJournal, result };
  });
}
function sameIntent(a: UnsignedDeploymentIntent, b: UnsignedDeploymentIntent) {
  return a.stepId === b.stepId && a.index === b.index && a.kind === b.kind && a.module === b.module && a.chainId === b.chainId &&
    a.account.toLowerCase() === b.account.toLowerCase() && a.nonce === b.nonce && a.value === b.value &&
    a.to?.toLowerCase() === b.to?.toLowerCase() && a.data.toLowerCase() === b.data.toLowerCase();
}
function transactionFields(intent: UnsignedDeploymentIntent) {
  return { from: intent.account, ...(intent.to === null ? {} : { to: intent.to }), data: intent.data,
    value: "0x0", type: "0x2", chainId: "0x14a34", nonce: hex(intent.nonce) };
}
export async function quoteExecutionFee(providedIntent: UnsignedDeploymentIntent, rpc: SetupRpc): Promise<ExecutionQuote> {
  const intent = Object.freeze({ ...providedIntent });
  if (intent.chainId !== 84532 || intent.value !== 0n) throw new Error("Only zero-value Base Sepolia setup operations are supported.");
  const gasEstimate = quantity(await rpc.request({ method: "eth_estimateGas", params: [transactionFields(intent)] }));
  const gasPrice = quantity(await rpc.request({ method: "eth_gasPrice", params: [] }));
  const priority = quantity(await rpc.request({ method: "eth_maxPriorityFeePerGas", params: [] }));
  if (gasEstimate <= 0n || gasEstimate > 30_000_000n || gasPrice <= 0n || priority > gasPrice * 2n) throw new Error("The network fee estimate is unsupported. Nothing was sent.");
  const gas = (gasEstimate * 120n + 99n) / 100n, maxFeePerGas = gasPrice * 2n + priority;
  return Object.freeze({ gas, maxFeePerGas, maxPriorityFeePerGas: priority, maxExecutionFeeWei: gas * maxFeePerGas });
}
/** One explicit UI action, one possible type-2 transaction request, with a write-ahead checkpoint. */
export async function requestDeploymentTransaction(providedJournal: DeploymentJournal, providedDisplayed: UnsignedDeploymentIntent, services: DeploymentServices): Promise<DispatchResult> {
  const journal = parseJournal(JSON.stringify(providedJournal)), displayed = Object.freeze({ ...providedDisplayed });
  topLevel();
  return services.lock(lockKey(journal.config), async () => {
    assertCurrentJournal(services.storage, journal);
    if (pendingAttempt(journal)) throw new Error("Resolve the existing attempt first. Nothing was sent.");
    const result = await verification(journal, services.rpc);
    if (result.status !== "verified" || !result.next || !sameIntent(result.next, displayed)) throw new Error("The displayed operation could not be verified again. Nothing was sent.");
    const intent = result.next, wallet = await services.resolveWallet(); await identity(wallet, journal.config);
    const transaction = transactionFields(intent), quote = await quoteExecutionFee(intent, services.rpc);
    const balance = quantity(await services.rpc.request({ method: "eth_getBalance", params: [intent.account, "pending"] }));
    if (balance < quote.maxExecutionFeeWei) throw new Error("The test account does not cover the estimated execution gas. No transaction was requested.");
    await identity(wallet, journal.config);
    if (quantity(await services.rpc.request({ method: "eth_getTransactionCount", params: [intent.account, "pending"] })) !== BigInt(intent.nonce) ||
      quantity(await wallet.request({ method: "eth_getTransactionCount", params: [intent.account, "pending"] })) !== BigInt(intent.nonce)) throw new Error("The pending nonce changed. Reload and verify this checkpoint; nothing was sent.");
    topLevel(); assertCurrentJournal(services.storage, journal);
    const written = beginAttempt(journal); saveJournal(services.storage, written);
    let returnedHash: Hex | undefined;
    try {
      const hash = await wallet.request({ method: "eth_sendTransaction", params: [{ ...transaction, gas: hex(quote.gas), maxFeePerGas: hex(quote.maxFeePerGas), maxPriorityFeePerGas: hex(quote.maxPriorityFeePerGas) }] });
      if (!validHash(hash)) throw new Error("Missing transaction hash");
      returnedHash = hash;
      const submitted = updateAttempt(written, "submitted", hash); saveJournal(services.storage, submitted);
      return { status: "submitted", journal: submitted, hash, message: "Submitted. Verify the transaction before the next operation." };
    } catch (error) {
      // The hash must remain visible even if storage fails after an actual broadcast.
      const rejected = !returnedHash && !!error && typeof error === "object" && (error as { code?: unknown }).code === 4001;
      const next = updateAttempt(written, rejected ? "rejected" : "unknown", returnedHash ?? null);
      let retained = next;
      try { saveJournal(services.storage, next); } catch {
        // Recover the actual durable authority; never expose a newer in-memory revision as stored.
        try { retained = loadJournal(services.storage, journal.config) ?? written; } catch { retained = written; }
      }
      return { status: rejected ? "rejected" : "unknown", journal: retained, ...(returnedHash ? { hash: returnedHash } : {}), message: rejected
        ? "Rejected in the wallet. The rejection is recorded. Verify again before a new request."
        : "The result is uncertain. Keep this checkpoint and any displayed hash. Do not request this operation again; recover and verify it first." };
    }
  });
}
