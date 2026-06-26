import { NextResponse } from "next/server";
import { AuctionNotFoundError, readAuctionById } from "@/lib/server/auctionReader";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to read auction";
}

export async function GET(_request: Request, context: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await context.params;

  try {
    const payload = await readAuctionById(auctionId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: errorMessage(error)
      },
      {
        status: error instanceof AuctionNotFoundError ? 404 : 503
      }
    );
  }
}