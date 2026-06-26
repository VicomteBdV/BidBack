import { NextResponse } from "next/server";
import { withdrawDemoProtocolFees } from "@/lib/server/auctionWriter";

export const dynamic = "force-dynamic";

async function readAuctionId(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { auctionId?: unknown };
  return typeof body.auctionId === "string" ? body.auctionId : "1";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to withdraw protocol fees";
}

export async function POST(request: Request) {
  try {
    const auctionId = await readAuctionId(request);
    const payload = await withdrawDemoProtocolFees(auctionId);

    return NextResponse.json({
      status: "ok",
      action: "withdraw-demo-protocol-fees",
      localDevOnly: true,
      ...payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        action: "withdraw-demo-protocol-fees",
        localDevOnly: true,
        error: errorMessage(error)
      },
      { status: 500 }
    );
  }
}