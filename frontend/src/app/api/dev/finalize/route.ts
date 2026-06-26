import { NextResponse } from "next/server";
import { assertLocalDevActionsEnabled } from "@/lib/server/localDevGuard";
import { finalizeDemoAuction } from "@/lib/server/auctionWriter";

export const dynamic = "force-dynamic";

async function readAuctionId(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { auctionId?: unknown };
  return typeof body.auctionId === "string" ? body.auctionId : "1";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to finalize demo auction";
}

export async function POST(request: Request) {
  try {
    await assertLocalDevActionsEnabled();

    const auctionId = await readAuctionId(request);
    const payload = await finalizeDemoAuction(auctionId);

    return NextResponse.json({
      status: "ok",
      action: "finalize-demo-auction",
      localDevOnly: true,
      ...payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        action: "finalize-demo-auction",
        localDevOnly: true,
        error: errorMessage(error)
      },
      { status: 500 }
    );
  }
}