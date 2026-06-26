import { NextResponse } from "next/server";
import type { DevBidderRole } from "@/lib/auctionTypes";
import { assertLocalDevActionsEnabled } from "@/lib/server/localDevGuard";
import { placeDemoBid } from "@/lib/server/auctionWriter";

export const dynamic = "force-dynamic";

async function readBody(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    auctionId?: unknown;
    bidderRole?: unknown;
  };

  return {
    auctionId: typeof body.auctionId === "string" ? body.auctionId : "1",
    bidderRole: body.bidderRole === "secondary" ? "secondary" : "primary"
  } satisfies { auctionId: string; bidderRole: DevBidderRole };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to place demo bid";
}

export async function POST(request: Request) {
  try {
    await assertLocalDevActionsEnabled();

    const { auctionId, bidderRole } = await readBody(request);
    const payload = await placeDemoBid(auctionId, bidderRole);

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
      { status: 500 }
    );
  }
}