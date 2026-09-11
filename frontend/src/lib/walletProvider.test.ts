import { createConfig, http, type Connector } from "wagmi";
import { describe, expect, it, vi } from "vitest";
import { targetChain } from "./chains";
import { createConnectedWalletClients, getConnectedWalletProvider } from "./walletProvider";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";

const account = "0x1111111111111111111111111111111111111111";
const hash = `0x${"ab".repeat(32)}`;

function setup() {
  const providerA = { request: vi.fn() };
  const providerB = { request: vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_chainId") return "0x7a69";
    if (method === "eth_accounts") return [account];
    if (method === "eth_sendTransaction") return hash;
    throw new Error(`Unexpected method: ${method}`);
  }) };
  const connectorA = { uid: "a", getProvider: vi.fn(async () => providerA) } as unknown as Connector;
  const connectorB = { uid: "b", getProvider: vi.fn(async () => providerB) } as unknown as Connector;
  const config = createConfig({ chains: [targetChain], transports: { [targetChain.id]: http() },
    storage: null, multiInjectedProviderDiscovery: false });
  config.setState({ chainId: targetChain.id, status: "connected", current: "b",
    connections: new Map([["b", { connector: connectorB, accounts: [account], chainId: targetChain.id }]]) });
  Object.defineProperty(window, "ethereum", { configurable: true, value: providerA });
  return { config, connectorA, connectorB, providerA, providerB };
}

describe("active connector authority with real wagmi state and viem clients", () => {
  it("routes reads and a real viem contract request to B while global A is untouched", async () => {
    const { config, connectorA, connectorB, providerA, providerB } = setup();
    const { publicClient, walletClient } = await createConnectedWalletClients(config, connectorB, account);
    expect(await publicClient.getChainId()).toBe(31337);
    expect(await walletClient.writeContract({ address: account, abi: auctionHouseAbi,
      functionName: "finalizeAuction", args: [1n], gas: 100000n, gasPrice: 1n })).toBe(hash);
    expect(providerB.request).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" }));
    expect(providerA.request).not.toHaveBeenCalled();
    expect(connectorA.getProvider).not.toHaveBeenCalled();
  });

  it.each(["disconnect", "connector", "account", "provider"])("refuses %s changes after preflight", async (change) => {
    const { config, connectorA, connectorB, providerA, providerB } = setup();
    const provider = await getConnectedWalletProvider(config, connectorB, account);
    if (change === "disconnect") config.setState((state) => ({ ...state, status: "disconnected" }));
    if (change === "connector") config.setState((state) => ({ ...state, current: "a", connections: new Map([
      ["a", { connector: connectorA, accounts: [account], chainId: 31337 }]
    ]) }));
    if (change === "account") config.setState((state) => ({ ...state, connections: new Map([
      ["b", { connector: connectorB, accounts: ["0x2222222222222222222222222222222222222222"], chainId: 31337 }]
    ]) }));
    if (change === "provider") vi.mocked(connectorB.getProvider).mockResolvedValue(providerA);
    await expect(provider.request({ method: "eth_sendTransaction", params: [{ from: account }] })).rejects.toThrow(
      "Connected wallet is unavailable or has changed."
    );
    expect(providerB.request).not.toHaveBeenCalled();
    expect(providerA.request).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { request: "invalid" }])("fails closed for missing or malformed providers", async (value) => {
    const { config, connectorB, providerA } = setup();
    vi.mocked(connectorB.getProvider).mockResolvedValue(value);
    await expect(getConnectedWalletProvider(config, connectorB, account)).rejects.toThrow("Connected wallet is unavailable");
    expect(providerA.request).not.toHaveBeenCalled();
  });

  it.each(["account", "chain"])("detects a provider %s change even before wagmi receives an event", async (change) => {
    const { config, connectorB, providerB } = setup();
    const provider = await getConnectedWalletProvider(config, connectorB, account);
    providerB.request.mockImplementation(async ({ method }) => method === "eth_accounts"
      ? change === "account" ? [] : [account] : "0x1");
    await expect(provider.request({ method: "eth_sendTransaction", params: [{ from: account }] })).rejects.toThrow();
    expect(providerB.request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" }));
  });
});
