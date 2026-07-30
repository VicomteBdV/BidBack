import Link from "next/link";
import { AuctionList } from "@/components/AuctionList";
import { BidBackIntro } from "@/components/BidBackIntro";
import { ModuleAddresses } from "@/components/ModuleAddresses";
import { WalletActivityDashboard } from "@/components/WalletActivityDashboard";
import { WalletButton } from "@/components/WalletButton";
import { targetChainId, targetChainLabel } from "@/lib/chains";

export default function Home() {
  const deploymentFileName = `${targetChainId}.json`;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-4 py-6 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-800 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">BidBack MVP</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Auction demo console</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Test the full BidBack auction lifecycle with read-only auction views, wallet-signed actions, and clear settlement checks.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:items-start">
            <Link
              href="/create"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 sm:w-auto"
            >
              Create auction
            </Link>
            <WalletButton />
          </div>
        </header>

        <BidBackIntro />

        <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Read-only mode</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-300">
              <div className="flex min-w-0 flex-col gap-1 rounded-md bg-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Deployment file</span>
                <span className="font-mono text-cyan-200">{deploymentFileName}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-md bg-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Target chain</span>
                <span className="font-mono text-cyan-200">{targetChainLabel}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-md bg-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Wallet required</span>
                <span className="font-mono text-cyan-200">No</span>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-md bg-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Auction reads</span>
                <span className="font-mono text-cyan-200">Next.js server</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Demo readiness</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <p>The deployment view remains available even when a browser wallet cannot read the Codespaces Anvil RPC.</p>
              <p>Local-dev actions stay restricted to Anvil 31337. Wallet-signed actions target the configured chain.</p>
              <p>Outside local Anvil, keep ENABLE_LOCAL_DEV_ACTIONS disabled and use only testnet assets.</p>
            </div>
          </div>
        </section>

        <ModuleAddresses />
        <WalletActivityDashboard />
        <AuctionList />
      </div>
    </main>
  );
}
