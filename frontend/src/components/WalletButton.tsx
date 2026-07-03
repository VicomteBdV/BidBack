"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortenAddress } from "@/lib/format";
import { targetChainId, targetChainLabel, targetChainName } from "@/lib/chains";
import {
  getInjectedEthereumProvider,
  switchToTargetChain,
  walletNetworkErrorMessage
} from "@/lib/walletNetwork";

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const [isSwitchingChain, setIsSwitchingChain] = useState(false);
  const [networkMessage, setNetworkMessage] = useState<string | null>(null);

  const connector = connectors[0];
  const isWrongNetwork = isConnected && chainId !== targetChainId;
  const switchButtonLabel = targetChainName ? `Switch to ${targetChainName}` : "Switch to target chain";

  useEffect(() => {
    if (!isWrongNetwork) {
      setNetworkMessage(null);
    }
  }, [isWrongNetwork]);

  async function handleSwitchNetwork() {
    try {
      setIsSwitchingChain(true);
      setNetworkMessage(null);

      const provider = getInjectedEthereumProvider();

      await switchToTargetChain(provider);

      setNetworkMessage(`Switch request sent. Confirm ${targetChainLabel} in your wallet if prompted.`);
    } catch (caught) {
      setNetworkMessage(walletNetworkErrorMessage(caught));
    } finally {
      setIsSwitchingChain(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-2 sm:items-end">
        <button
          type="button"
          disabled={!connector || isPending}
          onClick={() => connector && connect({ connector })}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Connecting..." : "Connect wallet"}
        </button>
        <p className="max-w-sm text-xs text-slate-400">
          Wallet connection is optional for the read-only deployment view.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          <span className="font-mono">{shortenAddress(address)}</span>
        </div>

        <button
          type="button"
          onClick={() => disconnect()}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
        >
          Disconnect
        </button>
      </div>

      {isWrongNetwork ? (
        <div className="max-w-md rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          <p>
            Wallet connected, but not on the target chain ({targetChainLabel}). Read-only deployment view remains
            available.
          </p>

          <button
            type="button"
            disabled={isSwitchingChain}
            onClick={handleSwitchNetwork}
            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-md bg-amber-300 px-3 text-xs font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSwitchingChain ? "Switching..." : switchButtonLabel}
          </button>

          {networkMessage ? <p className="mt-2 text-amber-50">{networkMessage}</p> : null}
        </div>
      ) : (
        <p className="max-w-sm rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
          Wallet connected on {targetChainLabel}.
        </p>
      )}
    </div>
  );
}