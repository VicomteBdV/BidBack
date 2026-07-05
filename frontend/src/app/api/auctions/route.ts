import { NextResponse } from "next/server";
import { readAllAuctions } from "@/lib/server/auctionReader";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to read auctions";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = await readAllAuctions({
      limit: searchParams.get("limit")
    });

    return NextResponse.json(payload);
  } catch (error) {
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
