import React from "react";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Address, type Hex } from "viem";
const mocks = vi.hoisted(() => ({ account: { address: undefined as string | undefined, isConnected: false, connector: undefined as unknown },
  initialize: vi.fn(), verify: vi.fn(), quote: vi.fn(), request: vi.fn(), readRpc: vi.fn(), provider: vi.fn(), getAccount: vi.fn() }));
vi.mock("wagmi", () => ({ useAccount: () => mocks.account, useConfig: () => ({}) }));
vi.mock("wagmi/actions", () => ({ getAccount: () => mocks.getAccount() }));
vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button>Connect test wallet</button> }));
vi.mock("@/lib/useActiveWalletChain", () => ({ useActiveWalletChain: () => ({ status: "target", chainId: 84532 }) }));
vi.mock("@/lib/walletProvider", () => ({ getConnectedWalletProvider: (...args: unknown[]) => mocks.provider(...args) }));
vi.mock("./deploymentDispatch", () => ({ createSetupReadRpc: () => ({ request: mocks.readRpc }),
  initializeDeployment: (...args: unknown[]) => mocks.initialize(...args), verifyDeployment: (...args: unknown[]) => mocks.verify(...args),
  quoteExecutionFee: (...args: unknown[]) => mocks.quote(...args), requestDeploymentTransaction: (...args: unknown[]) => mocks.request(...args) }));
import { DeploymentSetup } from "./DeploymentSetup";
import { createUnsignedTestnetDeploymentPlan } from "@/lib/testnetDeploymentPlan";
import { beginAttempt, newJournal, parseSetupConfig, saveJournal, updateAttempt } from "./deploymentSession";

const address = `0x${"12".repeat(20)}` as Address, hash = `0x${"ab".repeat(32)}` as Hex;
const config = parseSetupConfig({ version: 1, chainId: 84532, roles: { deployer: address, finalOwner: address, feeRecipient: address } });
const journal = () => newJournal(config, 37, { number: "0x10", hash });
const intent = () => createUnsignedTestnetDeploymentPlan({ chainId: 84532, roles: config.roles, startingNonce: 37 }).next({ chainId: 84532, account: address, nonce: 37 })!;
const fragment = (account = address) => `#setup=${encodeURIComponent(JSON.stringify({ version: 1, chainId: 84532, roles: { deployer: account, finalOwner: account, feeRecipient: account } }))}`;

beforeEach(() => {
  window.localStorage.clear(); window.history.replaceState(null, "", fragment());
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: vi.fn((_name, _options, action) => action({ name: "lock" })) } });
  mocks.account = { address: undefined, isConnected: false, connector: undefined };
  for (const mock of [mocks.initialize, mocks.verify, mocks.quote, mocks.request, mocks.readRpc, mocks.provider, mocks.getAccount]) mock.mockReset();
  mocks.initialize.mockResolvedValue(journal());
  mocks.verify.mockResolvedValue({ journal: journal(), result: { status: "verified", next: intent(), anchor: { number: 16n, hash } } });
  mocks.quote.mockResolvedValue({ gas: 120000n, maxFeePerGas: 21n, maxPriorityFeePerGas: 1n, maxExecutionFeeWei: 2520000n });
  mocks.request.mockResolvedValue({ journal: updateAttempt(beginAttempt(journal()), "submitted", hash), status: "submitted", hash, message: "Submitted. Verify before continuing." });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function connect() { mocks.account = { address, isConnected: true, connector: { uid: "chosen" } }; }
describe("isolated setup screen", () => {
  it("renders configuration without connecting, reading RPC or requesting transactions automatically", async () => {
    render(<DeploymentSetup />);
    expect(await screen.findByRole("heading", { name: "Your test configuration" })).toBeInTheDocument();
    expect(screen.getAllByText(address)).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Connect test wallet" })).not.toBeInTheDocument();
    expect(mocks.readRpc).not.toHaveBeenCalled(); expect(mocks.initialize).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox")); expect(screen.getByRole("button", { name: "Connect test wallet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Initialize checkpoint/ })).toBeDisabled();
  });
  it("requires initialization and read-only verification before an explicit single transaction click", async () => {
    connect(); render(<DeploymentSetup />); await screen.findByRole("checkbox"); fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Initialize checkpoint/ }));
    await screen.findByRole("button", { name: /Verify checkpoint/ }); expect(mocks.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Verify checkpoint/ }));
    const send = await screen.findByRole("button", { name: "Review this transaction in MetaMask" });
    expect(screen.getByText(/This estimate excludes Base data charges/)).toBeInTheDocument();
    fireEvent.click(send); fireEvent.click(send);
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    await screen.findByRole("heading", { name: "Transaction awaiting verification" });
    expect(screen.queryByRole("button", { name: "Review this transaction in MetaMask" })).not.toBeInTheDocument();
  });
  it("loads unresolved attempts as blocked recovery, and verification never requests a transaction", async () => {
    saveJournal(window.localStorage, updateAttempt(beginAttempt(journal()), "unknown", null));
    render(<DeploymentSetup />); await screen.findByRole("heading", { name: "Unresolved transaction attempt" });
    expect(screen.queryByRole("button", { name: "Review this transaction in MetaMask" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Recovery transaction hash"), { target: { value: hash } });
    fireEvent.click(screen.getByRole("button", { name: /Verify recovery hash/ }));
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(1));
    expect(mocks.verify.mock.calls[0][2]).toBe(hash); expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["invalid-fragment", "no-locks", "corrupt-storage"])("shows a clear blocked state for %s without wallet controls", async change => {
    if (change === "invalid-fragment") window.history.replaceState(null, "", "#setup=invalid");
    if (change === "no-locks") Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    if (change === "corrupt-storage") window.localStorage.setItem(`bidback-setup:v1:84532:${address}`, "not json");
    render(<DeploymentSetup />);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Your test configuration" })).not.toBeInTheDocument());
    expect(screen.getByRole("status").textContent).toMatch(/invalid|incompatible|safely lock|unavailable/i);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("keeps wallet controls absent inside an iframe from the first render", async () => {
    const actual = window;
    const framed = new Proxy(actual, { get(target, key) { if (key === "top") return {}; if (key === "self") return actual; return Reflect.get(target, key, target); } });
    vi.stubGlobal("window", framed);
    render(<DeploymentSetup />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Connect test wallet" })).not.toBeInTheDocument();
    await screen.findByText(/unavailable inside a frame/); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("invalidates verification when the connected account changes", async () => {
    saveJournal(window.localStorage, journal()); connect(); const view = render(<DeploymentSetup />);
    await screen.findByRole("checkbox"); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /Verify checkpoint/ }));
    await screen.findByRole("button", { name: "Review this transaction in MetaMask" });
    mocks.account = { ...mocks.account, address: `0x${"34".repeat(20)}` }; view.rerender(<DeploymentSetup />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Review this transaction in MetaMask" })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/not the configured/);
  });
  it("does not restore a stale verified operation after a setup fragment changes during its reads", async () => {
    saveJournal(window.localStorage, journal()); let resolve!: (value: unknown) => void;
    mocks.verify.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<DeploymentSetup />); await screen.findByRole("button", { name: /Verify checkpoint/ });
    fireEvent.click(screen.getByRole("button", { name: /Verify checkpoint/ }));
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(1));
    act(() => { window.history.replaceState(null, "", fragment(`0x${"34".repeat(20)}`)); window.dispatchEvent(new HashChangeEvent("hashchange")); });
    await act(async () => resolve({ journal: journal(), result: { status: "verified", next: intent() } }));
    expect(screen.getByRole("status")).toHaveTextContent(/setup link changed/);
    expect(screen.queryByRole("button", { name: "Review this transaction in MetaMask" })).not.toBeInTheDocument();
    expect(mocks.quote).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
    expect(screen.getAllByText(address)).toHaveLength(3); // Keep the original roles while the old operation settles.
  });
  it("the dispatch service rejects the changed configuration during a pending preflight", async () => {
    connect(); saveJournal(window.localStorage, journal());
    let resolve!: (value: unknown) => void;
    mocks.request.mockImplementationOnce(async (_journal, _intent, services) => {
      await new Promise(done => { resolve = done; });
      return services.resolveWallet(); // Must fail on the captured generation before reaching any wallet.
    });
    render(<DeploymentSetup />); await screen.findByRole("checkbox"); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /Verify checkpoint/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Review this transaction in MetaMask" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    act(() => { window.history.replaceState(null, "", fragment(`0x${"34".repeat(20)}`)); window.dispatchEvent(new HashChangeEvent("hashchange")); });
    await act(async () => resolve(undefined));
    expect(mocks.provider).not.toHaveBeenCalled(); expect(screen.getByRole("status")).toHaveTextContent(/setup link changed/);
  });
  it("invalidates a stale initialization result after a fragment change", async () => {
    connect(); let resolve!: (value: unknown) => void; mocks.initialize.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<DeploymentSetup />); await screen.findByRole("checkbox"); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /Initialize checkpoint/ }));
    await waitFor(() => expect(mocks.initialize).toHaveBeenCalledTimes(1));
    act(() => { window.history.replaceState(null, "", fragment(`0x${"34".repeat(20)}`)); window.dispatchEvent(new HashChangeEvent("hashchange")); });
    await act(async () => resolve(journal()));
    expect(screen.getByRole("status")).toHaveTextContent(/setup link changed/); expect(screen.queryByRole("button", { name: /Verify checkpoint/ })).not.toBeInTheDocument();
  });
});
