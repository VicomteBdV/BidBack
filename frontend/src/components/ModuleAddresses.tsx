"use client";

import { useEffect, useMemo, useState } from "react";
import {
  contractLabels,
  orderedCoreContractKeys,
  orderedOptionalContractKeys,
  type ContractKey
} from "@/lib/contracts";
import { fetchDeployment, type Deployment } from "@/lib/deployment";
import { anvilChainId, targetChainId, targetChainLabel } from "@/lib/chains";
import { shortenAddress } from "@/lib/format";
import { StateNotice } from "@/components/ui/StateNotice";

export function ModuleAddresses() {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const deploymentFileName = `${targetChainId}.json`;

  useEffect(() => {
    let active = true;

    async function loadDeployment() {
      try {
        setIsLoading(true);
        const loaded = await fetchDeployment();

        if (active) {
          setDeployment(loaded);
          setError(null);
        }
      } catch (caught) {
        if (active) {
          setDeployment(null);
          setError(caught instanceof Error ? caught.message : "Unable to load deployment");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadDeployment();

    return () => {
      active = false;
    };
  }, []);

  const optionalKeysWithAddresses = useMemo(() => {
    if (!deployment) return [];

    return orderedOptionalContractKeys.filter((key) => Boolean(deployment.contracts[key]));
  }, [deployment]);

  const statusLabel = deployment?.chainId === anvilChainId ? "Local deployment loaded" : "Deployment loaded";

  return (
    <section aria-busy={isLoading} className="min-w-0 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Read-only deployment</h2>
          <p className="mt-1 text-sm text-slate-400">
            Loaded from frontend/public/deployments/{deploymentFileName}. Wallet network is not required for this view.
          </p>
        </div>

        {deployment ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-100">
              {statusLabel}
            </div>
            <div className="text-xs text-slate-400">
              Target chain <span className="font-mono text-slate-200">{targetChainLabel}</span>
            </div>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <StateNotice tone="loading" title="Loading deployment" className="mt-5">
          Reading the deployment file for the configured target chain.
        </StateNotice>
      ) : null}

      {!isLoading && error ? (
        <StateNotice tone="error" title="Deployment could not be loaded" className="mt-5">
          {error}
        </StateNotice>
      ) : null}

      {!isLoading && deployment ? (
        <>
          <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">Status</div>
              <div className="mt-1 font-medium text-emerald-200">{statusLabel}</div>
            </div>
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">Chain ID</div>
              <div className="mt-1 font-mono text-cyan-200">{deployment.chainId}</div>
            </div>
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">Source</div>
              <div className="mt-1 font-mono text-cyan-200">{deployment.source ?? "unknown"}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {orderedCoreContractKeys.map((key) => (
              <ContractAddressItem key={key} contractKey={key} address={deployment.contracts[key]} />
            ))}
          </div>

          {optionalKeysWithAddresses.length > 0 ? (
            <>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Optional local contracts
              </h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {optionalKeysWithAddresses.map((key) => {
                  const address = deployment.contracts[key];

                  if (!address) return null;

                  return <ContractAddressItem key={key} contractKey={key} address={address} />;
                })}
              </div>
            </>
          ) : null}

          <div className="mt-5 text-xs text-slate-500">
            Generated at{" "}
            <span className="font-mono text-slate-400">
              {deployment.generatedAt ? new Date(deployment.generatedAt).toLocaleString() : "unknown"}
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ContractAddressItem({ contractKey, address }: { contractKey: ContractKey; address: `0x${string}` }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span className="text-sm font-medium text-slate-200">{contractLabels[contractKey]}</span>
        <span className="break-all font-mono text-sm text-cyan-200" title={address}>{shortenAddress(address)}</span>
      </div>
      <div className="mt-2 break-all font-mono text-xs text-slate-500">{address}</div>
    </div>
  );
}
