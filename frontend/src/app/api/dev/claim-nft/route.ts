import { NextResponse } from "next/server";
import { assertLocalDevActionsEnabled } from "@/lib/server/localDevGuard";
import { claimDemoNft } from "@/lib/server/auctionWriter";

export const dynamic = "force-dynamic";

async function readAuctionId(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { auctionId?: unknown };
  return typeof body.auctionId === "string" ? body.auctionId : "1";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to claim NFT";
}

export async function POST(request: Request) {
  try {
    await assertLocalDevActionsEnabled();

    const auctionId = await readAuctionId(request);
    const payload = await claimDemoNft(auctionId);

    return NextResponse.json({
      status: "ok",
      action: "claim-demo-nft",
      localDevOnly: true,
      ...payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        action: "claim-demo-nft",
        localDevOnly: true,
        error: errorMessage(error)
      },
      { status: 500 }
    );
  }
}