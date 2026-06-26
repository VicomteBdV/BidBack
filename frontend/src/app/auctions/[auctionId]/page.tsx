import Link from "next/link";
import { AuctionDetail } from "@/components/AuctionDetail";
import { WalletButton } from "@/components/WalletButton";

export default async function AuctionPage({ params }: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await params;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-800 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200">
              Back to auctions
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-white">Auction detail</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Read-only auction data is fetched by Next.js from the local Anvil RPC.
            </p>
          </div>
          <WalletButton />
        </header>

        <AuctionDetail auctionId={auctionId} />
      </div>
    </main>
  );
}