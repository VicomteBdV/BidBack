import Link from "next/link";
import { AuctionList } from "@/components/AuctionList";
import { ModuleAddresses } from "@/components/ModuleAddresses";
import { WalletButton } from "@/components/WalletButton";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-800 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">BidBack MVP</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Local deployment console</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              The browser talks to Next.js on port 3000. Next.js reads Anvil locally on the server side.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:items-start">
            <Link
              href="/create"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Create local auction
            </Link>
            <WalletButton />
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Read-only mode</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-4 rounded-md bg-slate-950 px-4 py-3">
                <span>Deployment file</span>
                <span className="font-mono text-cyan-200">31337.json</span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md bg-slate-950 px-4 py-3">
                <span>Wallet required</span>
                <span className="font-mono text-cyan-200">No</span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md bg-slate-950 px-4 py-3">
                <span>Auction reads</span>
                <span className="font-mono text-cyan-200">Next.js server</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Frontend status</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <p>The deployment view remains available even when MetaMask cannot read the Codespaces Anvil RPC.</p>
              <p>Auction data is loaded through API routes, so the browser does not need direct access to port 8545.</p>
            </div>
          </div>
        </section>

        <ModuleAddresses />
        <AuctionList />
      </div>
    </main>
  );
}