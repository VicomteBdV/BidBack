import { NextResponse } from "next/server";
import type { DevBidderRole } from "@/lib/auctionTypes";
import { claimDemoReward } from "@/lib/server/auctionWriter";

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
  return error instanceof Error ? error.message : "Unable to claim reward";
}

export async function POST(request: Request) {
  try {
    const { auctionId, bidderRole } = await readBody(request);
    const payload = await claimDemoReward(auctionId, bidderRole);

    return NextResponse.json({
      status: "ok",
      action: "claim-demo-reward",
      localDevOnly: true,
      bidderRole,
      ...payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        action: "claim-demo-reward",
        localDevOnly: true,
        error: errorMessage(error)
      },
      { status: 500 }
    );
  }
}