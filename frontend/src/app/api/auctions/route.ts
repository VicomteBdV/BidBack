import { NextResponse } from "next/server";
import { readAllAuctions } from "@/lib/server/auctionReader";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = await readAllAuctions({
      limit: searchParams.get("limit")
    });

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      {
        error: "Unable to read auctions"
      },
      {
        status: 503
      }
    );
  }
}
