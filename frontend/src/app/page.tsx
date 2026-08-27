import { AppShell } from "@/components/AppShell";
import { AuctionList } from "@/components/AuctionList";
import { BidBackIntro } from "@/components/BidBackIntro";
import { ModuleAddresses } from "@/components/ModuleAddresses";
import { TechnicalDisclosure } from "@/components/TechnicalDisclosure";
import { TrustDisclosure } from "@/components/TrustDisclosure";
import { WalletActivityDashboard } from "@/components/WalletActivityDashboard";
import { targetChainId, targetChainLabel } from "@/lib/chains";

export default function Home() {
  const deploymentFileName = `${targetChainId}.json`;

  return (
    <AppShell>
      <BidBackIntro />

      <div className="home-market-layout">
        <div id="marketplace-auctions" className="min-w-0 scroll-mt-6">
          <AuctionList />
        </div>

        <aside className="home-market-aside" aria-label="Participation safeguards">
          <TrustDisclosure variant="sidebar" />
        </aside>
      </div>

      <div id="wallet-activity" className="scroll-mt-6">
        <WalletActivityDashboard />
      </div>

      <TechnicalDisclosure
        summary="Protocol and deployment details"
        description="Read-only verification information for people who want to inspect the configured controlled-testnet environment."
      >
        <div className="mb-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md bg-slate-950 px-4 py-3">
            <div className="text-xs text-slate-500">Deployment file</div>
            <div className="mt-1 break-all font-mono text-cyan-200">{deploymentFileName}</div>
          </div>
          <div className="rounded-md bg-slate-950 px-4 py-3">
            <div className="text-xs text-slate-500">Target chain</div>
            <div className="mt-1 text-cyan-200">{targetChainLabel}</div>
          </div>
          <div className="rounded-md bg-slate-950 px-4 py-3">
            <div className="text-xs text-slate-500">Wallet required for browsing</div>
            <div className="mt-1 text-cyan-200">No</div>
          </div>
          <div className="rounded-md bg-slate-950 px-4 py-3">
            <div className="text-xs text-slate-500">Auction reads</div>
            <div className="mt-1 text-cyan-200">Next.js server</div>
          </div>
        </div>
        <ModuleAddresses />
      </TechnicalDisclosure>
    </AppShell>
  );
}
