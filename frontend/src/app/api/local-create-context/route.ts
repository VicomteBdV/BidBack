import { NextResponse } from "next/server";
import { readLocalCreateAuctionContext } from "@/lib/server/auctionCreator";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to read local create auction context";
}

export async function GET() {
  try {
    const payload = await readLocalCreateAuctionContext();
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