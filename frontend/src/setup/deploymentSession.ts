import { type Address, type Hex } from "viem";
import { createUnsignedTestnetDeploymentPlan } from "@/lib/testnetDeploymentPlan";

export const setupProfile = "amount-rank-v1:5ee8f2e:solc-0.8.24:unsigned-plan-v1" as const;
export type SetupConfig = Readonly<{ version: 1; chainId: 84532; roles: Readonly<{ deployer: Address; finalOwner: Address; feeRecipient: Address }> }>;
export type Attempt = Readonly<{ index: number; phase: "dispatching" | "submitted" | "unknown" | "rejected" | "confirmed"; hash: Hex | null }>;
export type DeploymentJournal = Readonly<{ version: 1; profile: typeof setupProfile; config: SetupConfig; startingNonce: number;
  anchor: Readonly<{ number: Hex; hash: Hex }>; revision: number; attempts: readonly Attempt[] }>;
export type JournalStorage = Pick<Storage, "getItem" | "setItem">;
export type JournalLock = <T>(name: string, operation: () => Promise<T>) => Promise<T>;
const maximumBytes = 100_000;
function invalid(): never { throw new Error("Setup data is invalid or incompatible. Keep the existing checkpoint and ask for help."); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
export function validHash(value: unknown): value is Hex { return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0{64}$/.test(value); }
function address(value: unknown): value is Address { return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value); }
function safe(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
export function parseSetupConfig(value: unknown): SetupConfig {
  if (!keys(value, ["version", "chainId", "roles"]) || value.version !== 1 || value.chainId !== 84532 ||
    !keys(value.roles, ["deployer", "finalOwner", "feeRecipient"]) || !address(value.roles.deployer) ||
    !address(value.roles.finalOwner) || !address(value.roles.feeRecipient) ||
    value.roles.finalOwner.toLowerCase() !== value.roles.deployer.toLowerCase() || value.roles.feeRecipient.toLowerCase() !== value.roles.deployer.toLowerCase()) invalid();
  return Object.freeze({ version: 1, chainId: 84532, roles: Object.freeze({ deployer: value.roles.deployer,
    finalOwner: value.roles.finalOwner, feeRecipient: value.roles.feeRecipient }) });
}
export function parseSetupFragment(fragment: string): SetupConfig {
  if (fragment.length > 2_000 || !fragment.startsWith("#setup=")) invalid();
  try { return parseSetupConfig(JSON.parse(decodeURIComponent(fragment.slice(7)))); } catch { return invalid(); }
}
export function sameConfig(a: SetupConfig, b: SetupConfig) {
  return a.chainId === b.chainId && (["deployer", "finalOwner", "feeRecipient"] as const).every(key => a.roles[key].toLowerCase() === b.roles[key].toLowerCase());
}
export function journalKey(config: SetupConfig) { return `bidback-setup:v1:${config.chainId}:${config.roles.deployer.toLowerCase()}`; }
export function lockKey(config: SetupConfig) { return `${journalKey(config)}:exclusive`; }
export function confirmedHashes(journal: DeploymentJournal): readonly Hex[] {
  return Object.freeze(journal.attempts.filter(attempt => attempt.phase === "confirmed").map(attempt => attempt.hash!));
}
export function pendingAttempt(journal: DeploymentJournal): Attempt | null {
  const last = journal.attempts.at(-1);
  return last && last.phase !== "confirmed" && last.phase !== "rejected" ? last : null;
}
export function parseJournal(text: string, expected?: SetupConfig): DeploymentJournal {
  if (text.length > maximumBytes) invalid();
  let value: unknown; try { value = JSON.parse(text); } catch { return invalid(); }
  if (!keys(value, ["version", "profile", "config", "startingNonce", "anchor", "revision", "attempts"]) ||
    value.version !== 1 || value.profile !== setupProfile || !safe(value.startingNonce) || value.startingNonce > Number.MAX_SAFE_INTEGER - 15 ||
    !safe(value.revision) || !keys(value.anchor, ["number", "hash"]) || !validHash(value.anchor.hash) ||
    typeof value.anchor.number !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value.anchor.number) ||
    !Array.isArray(value.attempts) || value.attempts.length > 128) invalid();
  const config = parseSetupConfig(value.config); if (expected && !sameConfig(config, expected)) invalid();
  createUnsignedTestnetDeploymentPlan({ chainId: config.chainId, roles: config.roles, startingNonce: value.startingNonce });
  const attempts: Attempt[] = []; const used = new Set<string>(); let index = 0;
  for (const [position, attempt] of value.attempts.entries()) {
    if (!keys(attempt, ["index", "phase", "hash"]) || attempt.index !== index || index >= 15 ||
      typeof attempt.phase !== "string" || !["dispatching", "submitted", "unknown", "rejected", "confirmed"].includes(attempt.phase) ||
      !(attempt.hash === null || validHash(attempt.hash))) invalid();
    const phase = attempt.phase as Attempt["phase"], hash = attempt.hash as Hex | null;
    if ((phase === "submitted" || phase === "confirmed") && hash === null ||
      (phase === "rejected" || phase === "dispatching") && hash !== null ||
      (phase !== "confirmed" && phase !== "rejected" && position !== value.attempts.length - 1)) invalid();
    if (hash) { if (used.has(hash.toLowerCase())) invalid(); used.add(hash.toLowerCase()); }
    attempts.push(Object.freeze({ index, phase, hash })); if (phase === "confirmed") index++;
  }
  return Object.freeze({ version: 1, profile: setupProfile, config, startingNonce: value.startingNonce,
    anchor: Object.freeze({ number: value.anchor.number as Hex, hash: value.anchor.hash }), revision: value.revision, attempts: Object.freeze(attempts) });
}
export function newJournal(config: SetupConfig, nonce: number, anchor: { number: Hex; hash: Hex }): DeploymentJournal {
  return parseJournal(JSON.stringify({ version: 1, profile: setupProfile, config, startingNonce: nonce, anchor, revision: 0, attempts: [] }), config);
}
export function loadJournal(storage: JournalStorage, config: SetupConfig): DeploymentJournal | null {
  const text = storage.getItem(journalKey(config)); return text === null ? null : parseJournal(text, config);
}
/** Compare the complete stored snapshot, not only a user-editable revision counter. */
export function assertCurrentJournal(storage: JournalStorage, expected: DeploymentJournal) {
  const current = loadJournal(storage, expected.config);
  if (!current || JSON.stringify(current) !== JSON.stringify(expected)) throw new Error("The checkpoint changed in another tab. Reload it before continuing.");
}
export function saveJournal(storage: JournalStorage, journal: DeploymentJournal) {
  const serialized = JSON.stringify(parseJournal(JSON.stringify(journal), journal.config));
  storage.setItem(journalKey(journal.config), serialized);
  if (storage.getItem(journalKey(journal.config)) !== serialized) throw new Error("Checkpoint storage could not be verified. No new transaction is allowed.");
}
export function beginAttempt(journal: DeploymentJournal): DeploymentJournal {
  if (pendingAttempt(journal) || confirmedHashes(journal).length >= 15 || journal.attempts.length >= 128) throw new Error("Resolve the existing attempt before requesting another transaction.");
  return parseJournal(JSON.stringify({ ...journal, revision: journal.revision + 1,
    attempts: [...journal.attempts, { index: confirmedHashes(journal).length, phase: "dispatching", hash: null }] }), journal.config);
}
export function updateAttempt(journal: DeploymentJournal, phase: Attempt["phase"], hash: Hex | null): DeploymentJournal {
  if (!pendingAttempt(journal)) throw new Error("There is no pending attempt to update.");
  return parseJournal(JSON.stringify({ ...journal, revision: journal.revision + 1,
    attempts: [...journal.attempts.slice(0, -1), { index: confirmedHashes(journal).length, phase, hash }] }), journal.config);
}
/** Import never replaces any existing local history, even if an older import is otherwise valid. */
export async function importJournal(text: string, config: SetupConfig, storage: JournalStorage, lock: JournalLock): Promise<DeploymentJournal> {
  const incoming = parseJournal(text, config);
  return lock(lockKey(config), async () => {
    const current = loadJournal(storage, config);
    if (current) {
      if (JSON.stringify(current) !== JSON.stringify(incoming)) throw new Error("Import cannot replace an existing checkpoint. Keep both files and recover the existing attempt.");
      return current;
    }
    saveJournal(storage, incoming); return incoming;
  });
}
export function browserJournalLock(): JournalLock {
  if (typeof navigator === "undefined" || !navigator.locks) throw new Error("This browser cannot safely lock a deployment across tabs. No transaction can be requested.");
  return async (name, operation) => navigator.locks.request(name, { mode: "exclusive", ifAvailable: true }, async lock => {
    if (!lock) throw new Error("Another tab is handling this deployment. Wait there, then reload this checkpoint.");
    return operation();
  });
}
