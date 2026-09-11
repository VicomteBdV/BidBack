import { NextResponse } from "next/server";
import { readLocalCreateAuctionContext } from "@/lib/server/auctionCreator";
import { assertLocalDevActionsEnabled, localDevGuardResponse } from "@/lib/server/localDevGuard";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to read local create auction context";
}

export async function GET() {
  try {
    await assertLocalDevActionsEnabled();
    const payload = await readLocalCreateAuctionContext();
    return NextResponse.json(payload);
  } catch (error) {
    const unavailable = localDevGuardResponse(error);
    if (unavailable) return unavailable;

    return NextResponse.json(
      {
        error: errorMessage(error)
      },
      {
        status: 503
      }
    );
  }
}