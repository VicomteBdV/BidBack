import { NextResponse } from "next/server";
import { assertLocalDevActionsEnabled } from "@/lib/server/localDevGuard";
import { createLocalDevAuction, type CreateLocalDevAuctionInput } from "@/lib/server/auctionCreator";

export const dynamic = "force-dynamic";

async function readBody(request: Request): Promise<CreateLocalDevAuctionInput> {
  const body = (await request.json().catch(() => ({}))) as {
    nftContract?: unknown;
    tokenId?: unknown;
    startPriceEth?: unknown;
    durationSeconds?: unknown;
  };

  return {
    nftContract: typeof body.nftContract === "string" ? body.nftContract : "",
    tokenId: typeof body.tokenId === "string" ? body.tokenId : "",
    startPriceEth: typeof body.startPriceEth === "string" ? body.startPriceEth : "",
    durationSeconds: typeof body.durationSeconds === "string" ? body.durationSeconds : ""
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to create local dev auction";
}

export async function POST(request: Request) {
  try {
    await assertLocalDevActionsEnabled();

    const input = await readBody(request);
    const payload = await createLocalDevAuction(input);

    return NextResponse.json({
      status: "ok",
      action: "create-local-dev-auction",
      localDevOnly: true,
      ...payload
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        action: "create-local-dev-auction",
        localDevOnly: true,
        error: errorMessage(error)
      },
      { status: 500 }
    );
  }
}