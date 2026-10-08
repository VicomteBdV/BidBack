import { NextResponse } from "next/server";
import { AuctionNotFoundError, readAuctionById } from "@/lib/server/auctionReader";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = await context.params;

  try {
    const payload = await readAuctionById(auctionId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof AuctionNotFoundError ? "Auction not found" : "Unable to read auction"
      },
      {
        status: error instanceof AuctionNotFoundError ? 404 : 503
      }
    );
  }
}
