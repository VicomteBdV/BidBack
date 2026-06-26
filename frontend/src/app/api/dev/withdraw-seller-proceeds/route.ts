import { NextResponse } from "next/server";
import { assertLocalDevActionsEnabled } from "@/lib/server/localDevGuard";
import { withdrawDemoSellerProceeds } from "@/lib/server/auctionWriter";

export const dynamic = "force-dynamic";

async function readAuctionId(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { auctionId?: unknown };
  return typeof body.auctionId === "string" ? body.auctionId : "1";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to withdraw seller proceeds";
}

export async function POST(request: Request) {
  try {
    await assertLocalDevActionsEnabled();

    const auctionId = await readAuctionId(request);
    const payload = await withdrawDemoSellerProceeds(auctionId);

    return NextResponse.json({
      status: "ok",
      action: "withdraw-demo-seller-proceeds",
      localDevOnly: true,
      ...payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        action: "withdraw-demo-seller-proceeds",
        localDevOnly: true,
        error: errorMessage(error)
      },
      { status: 500 }
    );
  }
}