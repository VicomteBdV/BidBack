import { NextResponse } from "next/server";
import type { AuctionHistoryApiResponse } from "@/lib/auctionTypes";
import { InvalidBidHistoryCursorError, parseBidHistoryCursor, readAuctionHistory } from "@/lib/server/auctionHistoryReader";
import {
  AuctionNotFoundError,
  createTargetPublicClient,
  parseAuctionId,
  readAuctionById,
  readTargetDeployment
} from "@/lib/server/auctionReader";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ auctionId: string }> }) {
  const { auctionId: auctionIdParam } = await context.params;
  const auctionId = parseAuctionId(auctionIdParam);

  if (!auctionId) {
    return NextResponse.json(
      {
        error: "Auction not found"
      },
      {
        status: 404
      }
    );
  }

  try {
    const cursors = new URL(request.url).searchParams.getAll("before");
    if (cursors.length > 1) throw new InvalidBidHistoryCursorError();
    const before = cursors.length === 1 ? parseBidHistoryCursor(cursors[0]) : undefined;
    const [deployment, auctionDetail] = await Promise.all([readTargetDeployment(), readAuctionById(auctionIdParam)]);
    const client = createTargetPublicClient();
    const history = await readAuctionHistory({
      client,
      deployment,
      auctionId,
      auction: auctionDetail.auction,
      before
    });
    const payload: AuctionHistoryApiResponse = {
      chainId: deployment.chainId,
      auctionHouse: deployment.contracts.auctionHouse,
      auctionId: auctionId.toString(),
      history
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof AuctionNotFoundError ? "Auction not found" :
          error instanceof InvalidBidHistoryCursorError ? "Invalid bid history cursor" : "Unable to read auction history"
      },
      {
        status: error instanceof AuctionNotFoundError ? 404 : error instanceof InvalidBidHistoryCursorError ? 400 : 503
      }
    );
  }
}
