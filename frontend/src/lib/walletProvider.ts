import { createPublicClient, createWalletClient, custom, type Address, type EIP1193Provider } from "viem";
import type { Config, Connector } from "wagmi";
import { getAccount } from "wagmi/actions";
import { targetChain, targetChainId } from "@/lib/chains";

const unavailable = "Connected wallet is unavailable or has changed. Reconnect your wallet and try again.";

/** Resolve only the selected wagmi connection; never fall back to a global provider. */
export async function getConnectedWalletProvider(config: Config, connector: Connector | undefined, account?: Address) {
  function assertConnection() {
    const active = getAccount(config);
    if (!connector || !active.isConnected || active.connector?.uid !== connector.uid ||
      (account && active.address?.toLowerCase() !== account.toLowerCase())) {
      throw new Error(unavailable);
    }
  }

  async function resolveProvider(): Promise<EIP1193Provider> {
    assertConnection();
    let provider: unknown;
    try { provider = await connector!.getProvider(); } catch { throw new Error(unavailable); }
    assertConnection();
    if (!provider || typeof (provider as EIP1193Provider).request !== "function") throw new Error(unavailable);
    return provider as EIP1193Provider;
  }

  const provider = await resolveProvider();
  // Recheck wagmi at dispatch, including after asynchronous preflight reads.
  const request: EIP1193Provider["request"] = async (args) => {
    if (await resolveProvider() !== provider) throw new Error(unavailable);
    if (account && args.method === "eth_sendTransaction") {
      let accounts: readonly string[];
      let chainId: string;
      try {
        accounts = await provider.request({ method: "eth_accounts" });
        chainId = await provider.request({ method: "eth_chainId" });
      } catch { throw new Error(unavailable); }
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].toLowerCase() !== account.toLowerCase()) {
        throw new Error(unavailable);
      }
      if (Number(chainId) !== targetChainId) throw new Error("Wrong network. Switch your connected wallet to the target chain.");
      if (await resolveProvider() !== provider) throw new Error(unavailable);
    }
    return provider.request(args as Parameters<EIP1193Provider["request"]>[0]) as never;
  };
  return { request };
}

export async function createConnectedWalletClients(config: Config, connector: Connector | undefined, account: Address) {
  const provider = await getConnectedWalletProvider(config, connector, account);
  return {
    provider,
    publicClient: createPublicClient({ chain: targetChain, transport: custom(provider) }),
    walletClient: createWalletClient({ account, chain: targetChain, transport: custom(provider) })
  };
}
