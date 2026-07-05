import { NextResponse } from "next/server";
import { isAddress, type Address, type PublicClient } from "viem";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { createTargetPublicClient, readAllAuctions, readTargetDeployment, type DeploymentFile } from "@/lib/server/auctionReader";
import { buildWalletActivity, type WalletActivityAuction, type WalletAuctionPosition } from "@/lib/walletActivity";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "shortMessage" in error) {
    const shortMessage = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof shortMessage === "string") return shortMessage;
  }

  return error instanceof Error ? error.message : "Unable to read wallet activity";
}

function toDecimalString(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Math.trunc(value).toString();
  if (typeof value === "string") return value;
  return "0";
}

function toBoolean(value: unknown) {
  return Boolean(value);
}

async function readAuctionFeeRecipient({
  auction,
  deployment,
  client
}: {
  auction: SerializedAuction;
  deployment: DeploymentFile;
  client: PublicClient;
}): Promise<Address> {
  try {
    return (await client.readContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "getAuctionFeeRecipient",
      args: [BigInt(auction.auctionId)]
    })) as Address;
  } catch {
    return (await client.readContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "feeRecipient"
    })) as Address;
  }
}

async function readWalletPosition({
  auction,
  wallet,
  auctionFeeRecipient,
  deployment,
  client
}: {
  auction: SerializedAuction;
  wallet: Address;
  auctionFeeRecipient: Address;
  deployment: DeploymentFile;
  client: PublicClient;
}): Promise<WalletAuctionPosition> {
  const auctionId = BigInt(auction.auctionId);

  const [cap, refundableAmount, refundClaimed, rewardEntitlement, rewardClaimed, sellerCredit, protocolFeeCredit] =
    await Promise.all([
      client.readContract({
        address: deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "capOf",
        args: [auctionId, wallet]
      }),
      client.readContract({
        address: deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "refundableAmount",
        args: [auctionId, wallet]
      }),
      client.readContract({
        address: deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "refundClaimed",
        args: [auctionId, wallet]
      }),
      client.readContract({
        address: deployment.contracts.distributionVault,
        abi: distributionVaultAbi,
        functionName: "entitlementOf",
        args: [auctionId, wallet]
      }),
      client.readContract({
        address: deployment.contracts.distributionVault,
        abi: distributionVaultAbi,
        functionName: "claimed",
        args: [auctionId, wallet]
      }),
      client.readContract({
        address: deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "sellerCredits",
        args: [wallet]
      }),
      client.readContract({
        address: deployment.contracts.escrowVault,
        abi: escrowVaultAbi,
        functionName: "protocolFeeCredits",
        args: [wallet]
      })
    ]);

  return {
    cap: toDecimalString(cap),
    refundableAmount: toDecimalString(refundableAmount),
    refundClaimed: toBoolean(refundClaimed),
    rewardEntitlement: toDecimalString(rewardEntitlement),
    rewardClaimed: toBoolean(rewardClaimed),
    sellerCredit: toDecimalString(sellerCredit),
    protocolFeeCredit: toDecimalString(protocolFeeCredit),
    auctionFeeRecipient,
    isAuctionFeeRecipient: wallet.toLowerCase() === auctionFeeRecipient.toLowerCase()
  };
}

async function enrichAuctionForWallet({
  auction,
  wallet,
  deployment,
  client
}: {
  auction: SerializedAuction;
  wallet: Address;
  deployment: DeploymentFile;
  client: PublicClient;
}): Promise<WalletActivityAuction> {
  try {
    const auctionFeeRecipient = await readAuctionFeeRecipient({ auction, deployment, client });
    const walletPosition = await readWalletPosition({ auction, wallet, auctionFeeRecipient, deployment, client });

    return {
      ...auction,
      auctionFeeRecipient,
      walletPosition
    };
  } catch (error) {
    return {
      ...auction,
      walletPositionError: errorMessage(error)
    };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const walletParam = searchParams.get("wallet");

    if (!walletParam || !isAddress(walletParam)) {
      return NextResponse.json(
        {
          error: "A valid wallet address is required."
        },
        {
          status: 400
        }
      );
    }

    const wallet = walletParam as Address;
    const deployment = await readTargetDeployment();
    const client = createTargetPublicClient();
    const auctionsPayload = await readAllAuctions({
      limit: searchParams.get("limit"),
      client,
      deployment
    });

    const auctions = await Promise.all(
      auctionsPayload.auctions.map((auction) => enrichAuctionForWallet({ auction, wallet, deployment, client }))
    );

    return NextResponse.json({
      chainId: auctionsPayload.chainId,
      auctionHouse: auctionsPayload.auctionHouse,
      wallet,
      count: auctions.length,
      discovery: auctionsPayload.discovery,
      activity: buildWalletActivity(auctions, wallet)
    });
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
