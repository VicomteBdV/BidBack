"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, EIP1193Provider } from "viem";
import { useConfig, type Connector } from "wagmi";
import { targetChainId } from "@/lib/chains";
import { getConnectedWalletProvider } from "@/lib/walletProvider";

type ChainStatus = "checking" | "target" | "wrong" | "unavailable";
type ChainSnapshot = { identity: string; status: ChainStatus; chainId: number | null };
type EventProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function parseWalletChainId(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const chainId = Number(value);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

/** The selected wallet provider, not wagmi's cached chain, decides the UI network state. */
export function useActiveWalletChain(connector: Connector | undefined, address: Address | undefined, isConnected: boolean) {
  const config = useConfig();
  const identity = isConnected && connector && address ? `${connector.uid}:${address.toLowerCase()}` : "disconnected";
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const sequenceRef = useRef(0);
  const [snapshot, setSnapshot] = useState<ChainSnapshot>({ identity, status: "checking", chainId: null });

  const refresh = useCallback(async (): Promise<ChainSnapshot> => {
    const request = ++sequenceRef.current;
    // Keep the last verified chain only for transaction/recovery identity while
    // the recheck is pending. Callers still fail closed on status !== "target".
    setSnapshot((current) => ({
      identity,
      status: "checking",
      chainId: current.identity === identity ? current.chainId : null
    }));
    if (!isConnected || !connector || !address) {
      return { identity, status: "unavailable", chainId: null };
    }
    try {
      const provider = await getConnectedWalletProvider(config, connector, address);
      const chainId = parseWalletChainId(await provider.request({ method: "eth_chainId" }));
      const next: ChainSnapshot = {
        identity,
        status: chainId === null ? "unavailable" : chainId === targetChainId ? "target" : "wrong",
        chainId
      };
      if (identityRef.current === identity && sequenceRef.current === request) {
        setSnapshot((current) => ({
          ...next,
          chainId: chainId ?? (current.identity === identity ? current.chainId : null)
        }));
      }
      return next;
    } catch {
      const next: ChainSnapshot = { identity, status: "unavailable", chainId: null };
      if (identityRef.current === identity && sequenceRef.current === request) {
        setSnapshot((current) => ({
          ...next,
          chainId: current.identity === identity ? current.chainId : null
        }));
      }
      return next;
    }
  }, [address, config, connector, identity, isConnected]);

  useEffect(() => {
    if (identity === "disconnected" || !connector) return;
    let active = true;
    let provider: EventProvider | undefined;
    const resync = () => { if (active) void refresh(); };
    void connector.getProvider().then((resolved) => {
      if (!active || !resolved || typeof (resolved as EIP1193Provider).request !== "function") return;
      provider = resolved as EventProvider;
      provider.on?.("chainChanged", resync);
      provider.on?.("accountsChanged", resync);
    }).catch(resync);
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    void refresh();
    return () => {
      active = false;
      ++sequenceRef.current;
      provider?.removeListener?.("chainChanged", resync);
      provider?.removeListener?.("accountsChanged", resync);
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [connector, identity, refresh]);

  return {
    status: snapshot.identity === identity ? snapshot.status : "checking",
    chainId: snapshot.identity === identity ? snapshot.chainId : null,
    refresh
  };
}
