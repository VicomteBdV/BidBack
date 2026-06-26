import { NextResponse } from "next/server";
import type { DevBidderRole } from "@/lib/auctionTypes";
import { assertLocalDevActionsEnabled } from "@/lib/server/localDevGuard";
import { claimDemoRefund } from "@/lib/server/auctionWriter";

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
  return error instanceof Error ? error.message : "Unable to claim refund";
}

export async function POST(request: Request) {
  try {
    await assertLocalDevActionsEnabled();

    const { auctionId, bidderRole } = await readBody(request);
    const payload = await claimDemoRefund(auctionId, bidderRole);

    return NextResponse.json({
      status: "ok",
      action: "claim-demo-refund",
      localDevOnly: true,
      bidderRole,
      ...payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        action: "claim-demo-refund",
        localDevOnly: true,
        error: errorMessage(error)
      },
      { status: 500 }
    );
  }
}