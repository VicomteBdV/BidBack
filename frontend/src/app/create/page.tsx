import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CreateAuctionForm } from "@/components/CreateAuctionForm";
import { TrustDisclosure } from "@/components/TrustDisclosure";
import { WalletCreateAuctionForm } from "@/components/WalletCreateAuctionForm";
import { isLocalDevUiEnabled } from "@/lib/localDevUi";

export default function CreateAuctionPage() {
  const localDevActionsEnabled = isLocalDevUiEnabled();

  return (
    <AppShell>
      <header className="seller-masthead transaction-studio-masthead">
        <div>
          <Link href="/" className="text-xs font-bold text-cyan-300 transition hover:text-cyan-200">
            ← Back to marketplace
          </Link>
          <p className="premium-eyebrow mt-4">Seller workspace / Transaction studio</p>
          <h1 className="editorial-title mt-1 text-4xl sm:text-5xl">Bring an NFT to auction</h1>
        </div>
        <p className="seller-masthead-note self-end text-sm leading-6 text-slate-400">
          List an existing NFT. Review the terms, approve custody if needed, then sign with the owner wallet.
        </p>
      </header>

      <div className="seller-workspace-grid transaction-studio-create">
        <div className="seller-workspace-main">
          <WalletCreateAuctionForm />
          {localDevActionsEnabled ? <CreateAuctionForm /> : null}
        </div>

        <aside className="seller-workspace-aside" aria-label="Seller safeguards">
          <TrustDisclosure variant="sidebar" />
        </aside>
      </div>
    </AppShell>
  );
}
