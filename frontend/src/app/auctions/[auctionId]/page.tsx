import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AuctionDetail } from "@/components/AuctionDetail";
import { isLocalDevUiEnabled } from "@/lib/localDevUi";

export default async function AuctionPage({ params }: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await params;
  const localDevActionsEnabled = isLocalDevUiEnabled();

  return (
    <AppShell>
      <div>
        <Link href="/" className="text-sm font-bold text-cyan-300 transition hover:text-cyan-200">
          Back to marketplace
        </Link>
      </div>

      <AuctionDetail auctionId={auctionId} localDevActionsEnabled={localDevActionsEnabled} />
    </AppShell>
  );
}
