import { NextResponse } from "next/server";
import { placeDemoBid } from "@/lib/server/auctionWriter";

export const dynamic = "force-dynamic";

async function readAuctionId(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { auctionId?: unknown };
  return typeof body.auctionId === "string" ? body.auctionId : "1";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to place demo bid";
}

export async function POST(request: Request) {
  try {
    const auctionId = await readAuctionId(request);
    const payload = await placeDemoBid(auctionId);

    return NextResponse.json({
      status: "ok",
      action: "place-demo-bid",
      localDevOnly: true,
      ...payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        action: "place-demo-bid",
        localDevOnly: true,
        error: errorMessage(error)
      },
      {
        status: 500
      }
    );
  }
}