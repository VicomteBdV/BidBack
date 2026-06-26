"use client";

import { useEffect, useState } from "react";
import { contractLabels, orderedContractKeys } from "@/lib/contracts";
import { fetchLocalDeployment, type LocalDeployment } from "@/lib/deployment";
import { shortenAddress } from "@/lib/format";

export function ModuleAddresses() {
  const [deployment, setDeployment] = useState<LocalDeployment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadDeployment() {
      try {
        setIsLoading(true);
        const loaded = await fetchLocalDeployment();

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

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Read-only local deployment</h2>
          <p className="mt-1 text-sm text-slate-400">
            Loaded from frontend/public/deployments/31337.json. Wallet network is not required for this view.
          </p>
        </div>

        {deployment ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-100">
              Local deployment loaded
            </div>
            <div className="text-xs text-slate-400">
              Chain ID <span className="font-mono text-slate-200">{deployment.chainId}</span>
            </div>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">
          Loading local deployment...
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      {!isLoading && deployment ? (
        <>
          <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">Status</div>
              <div className="mt-1 font-medium text-emerald-200">Local deployment loaded</div>
            </div>
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">Chain ID</div>
              <div className="mt-1 font-mono text-cyan-200">{deployment.chainId}</div>
            </div>
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">Source</div>
              <div className="mt-1 font-mono text-cyan-200">{deployment.source}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {orderedContractKeys.map((key) => {
              const address = deployment.contracts[key];

              return (
                <div key={key} className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-slate-200">{contractLabels[key]}</span>
                    <span className="font-mono text-sm text-cyan-200">{shortenAddress(address)}</span>
                  </div>
                  <div className="mt-2 break-all font-mono text-xs text-slate-500">{address}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 text-xs text-slate-500">
            Generated at <span className="font-mono text-slate-400">{new Date(deployment.generatedAt).toLocaleString()}</span>
          </div>
        </>
      ) : null}
    </section>
  );
}