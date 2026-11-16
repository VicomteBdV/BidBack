import { describe, expect, it, vi } from "vitest";
import { type Address, type Hex } from "viem";
import { assertCurrentJournal, beginAttempt, browserJournalLock, confirmedHashes, importJournal, journalKey, loadJournal, lockKey,
  newJournal, parseJournal, parseSetupConfig, parseSetupFragment, pendingAttempt, saveJournal, updateAttempt, type JournalStorage } from "./deploymentSession";
const account = `0x${"12".repeat(20)}` as Address, hash = `0x${"ab".repeat(32)}` as Hex;
const config = () => parseSetupConfig({ version: 1, chainId: 84532, roles: { deployer: account, finalOwner: account, feeRecipient: account } });
const initial = () => newJournal(config(), 37, { number: "0x10", hash });
function storage() { const values = new Map<string, string>(); return { values, getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) }; }
const lock = async <T,>(_name: string, action: () => Promise<T>) => action();

describe("setup configuration and checkpoint", () => {
  it("accepts only the explicit equal-role Base Sepolia fragment and snapshots its inputs", () => {
    const input = { version: 1, chainId: 84532, roles: { deployer: account, finalOwner: account, feeRecipient: account } };
    const parsed = parseSetupFragment(`#setup=${encodeURIComponent(JSON.stringify(input))}`);
    input.roles.deployer = "0x" as Address;
    expect(parsed.roles.deployer).toBe(account); expect(Object.isFrozen(parsed.roles)).toBe(true);
    expect(journalKey(parsed)).toBe(`bidback-setup:v1:84532:${account}`); expect(lockKey(parsed)).toContain(account);
  });
  it.each(["", "#setup=%", "#other={}", `#setup=${"a".repeat(2001)}`])("rejects malformed fragment %s", fragment => expect(() => parseSetupFragment(fragment)).toThrow());
  it.each(["chain", "zero", "different", "extra", "rpc"])("rejects unsupported configuration %s", change => {
    const value = structuredClone(config()) as unknown as Record<string, unknown>;
    if (change === "chain") value.chainId = 1;
    if (change === "zero") value.roles = { deployer: `0x${"0".repeat(40)}`, finalOwner: account, feeRecipient: account };
    if (change === "different") value.roles = { deployer: account, finalOwner: `0x${"34".repeat(20)}`, feeRecipient: account };
    if (change === "extra") (value.roles as Record<string, unknown>).permission = "all";
    if (change === "rpc") value.rpc = "https://untrusted.invalid";
    expect(() => parseSetupConfig(value)).toThrow();
  });
  it("records write-ahead, submitted and confirmed transitions without losing rejections", () => {
    const first = beginAttempt(initial()); expect(pendingAttempt(first)?.phase).toBe("dispatching");
    expect(() => beginAttempt(first)).toThrow();
    const rejected = updateAttempt(first, "rejected", null), retry = beginAttempt(rejected);
    const submitted = updateAttempt(retry, "submitted", hash), confirmed = updateAttempt(submitted, "confirmed", hash);
    expect(confirmedHashes(confirmed)).toEqual([hash]); expect(pendingAttempt(confirmed)).toBeNull();
    expect(confirmed.attempts[0].phase).toBe("rejected"); expect(confirmed.revision).toBe(5);
    expect(Object.isFrozen(confirmed.attempts)).toBe(true);
  });
  it.each(["array-phase", "number-phase", "profile", "nonce", "anchor", "missing", "hash", "extra", "order"])("rejects corrupt checkpoint %s", change => {
    const value = structuredClone(beginAttempt(initial())) as unknown as Record<string, unknown>;
    if (change === "array-phase") (value.attempts as Record<string, unknown>[])[0].phase = ["dispatching"];
    if (change === "number-phase") (value.attempts as Record<string, unknown>[])[0].phase = 1;
    if (change === "profile") value.profile = "another";
    if (change === "nonce") value.startingNonce = Number.MAX_SAFE_INTEGER;
    if (change === "anchor") value.anchor = { number: "0x01", hash };
    if (change === "missing") delete value.revision;
    if (change === "hash") (value.attempts as Record<string, unknown>[])[0].hash = hash;
    if (change === "extra") value.rpc = "https://untrusted.invalid";
    if (change === "order") (value.attempts as Record<string, unknown>[])[0].index = 2;
    expect(() => parseJournal(JSON.stringify(value))).toThrow();
  });
  it("rejects duplicate hashes, surplus operations, oversized input and incompatible owners", () => {
    const started = initial(), value = JSON.parse(JSON.stringify(started));
    value.attempts = [{ index: 0, phase: "confirmed", hash }, { index: 1, phase: "submitted", hash }];
    expect(() => parseJournal(JSON.stringify(value))).toThrow();
    value.attempts = Array.from({ length: 16 }, (_, index) => ({ index, phase: "confirmed", hash: `0x${(index + 1).toString(16).padStart(64, "0")}` }));
    expect(() => parseJournal(JSON.stringify(value))).toThrow(); expect(() => parseJournal(" ".repeat(100001))).toThrow();
    const other = parseSetupConfig({ ...config(), roles: { deployer: `0x${"34".repeat(20)}`, finalOwner: `0x${"34".repeat(20)}`, feeRecipient: `0x${"34".repeat(20)}` } });
    expect(() => parseJournal(JSON.stringify(started), other)).toThrow();
  });
  it("checks full stored snapshot and readback, including same-revision tampering", () => {
    const store = storage(), journal = initial(); saveJournal(store, journal); expect(loadJournal(store, config())).toEqual(journal);
    assertCurrentJournal(store, journal);
    const altered = { ...journal, startingNonce: 38 }; store.values.set(journalKey(config()), JSON.stringify(altered));
    expect(() => assertCurrentJournal(store, journal)).toThrow(/changed/);
    const discard: JournalStorage = { getItem: () => null, setItem: () => {} }; expect(() => saveJournal(discard, journal)).toThrow(/verified/);
  });
  it("imports into empty storage only and never rolls back an unknown or newer local attempt", async () => {
    const store = storage(), journal = initial(); expect(await importJournal(JSON.stringify(journal), config(), store, lock)).toEqual(journal);
    const unknown = updateAttempt(beginAttempt(journal), "unknown", null); saveJournal(store, unknown);
    await expect(importJournal(JSON.stringify(journal), config(), store, lock)).rejects.toThrow(/cannot replace/);
    expect(loadJournal(store, config())).toEqual(unknown);
    await expect(importJournal(JSON.stringify({ ...unknown, revision: unknown.revision + 1 }), config(), store, lock)).rejects.toThrow(/cannot replace/);
    expect(await importJournal(JSON.stringify(unknown), config(), store, lock)).toEqual(unknown);
  });
  it("refuses lock unavailability and another active tab without running its operation", async () => {
    const original = navigator.locks; Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    expect(() => browserJournalLock()).toThrow(/safely lock/);
    const action = vi.fn(); Object.defineProperty(navigator, "locks", { configurable: true, value: { request: vi.fn((_name, _options, callback) => callback(null)) } });
    await expect(browserJournalLock()(lockKey(config()), action)).rejects.toThrow(/Another tab/); expect(action).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "locks", { configurable: true, value: original });
  });
});
