import { NextResponse } from "next/server";
import type { AuctionHistoryApiResponse } from "@/lib/auctionTypes";
import { readAuctionHistory } from "@/lib/server/auctionHistoryReader";
import {
  AuctionNotFoundError,
  createTargetPublicClient,
  parseAuctionId,
  readAuctionById,
  readTargetDeployment
} from "@/lib/server/auctionReader";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to read auction history";
}

export async function GET(_request: Request, context: { params: Promise<{ auctionId: string }> }) {
  const { auctionId: auctionIdParam } = await context.params;
  const auctionId = parseAuctionId(auctionIdParam);

  if (!auctionId) {
    return NextResponse.json(
      {
        error: `Auction ${auctionIdParam} not found`
      },
      {
        status: 404
      }
    );
  }

  try {
    const [deployment, auctionDetail] = await Promise.all([readTargetDeployment(), readAuctionById(auctionIdParam)]);
    const client = createTargetPublicClient();
    const history = await readAuctionHistory({
      client,
      deployment,
      auctionId,
      auction: auctionDetail.auction
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
        error: errorMessage(error)
      },
      {
        status: error instanceof AuctionNotFoundError ? 404 : 503
      }
    );
  }
}
