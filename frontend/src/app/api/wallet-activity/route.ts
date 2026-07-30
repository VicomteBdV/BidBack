import { NextResponse } from "next/server";
import { isAddress, type Address, type PublicClient } from "viem";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import type { SerializedAuction } from "@/lib/auctionTypes";
import {
  discoverWalletActivityAuctionIds,
  normalizeWalletActivityEventLimit
} from "@/lib/server/auctionEventReader";
import {
  createTargetPublicClient,
  readAuctionsByIds,
  readTargetDeployment,
  type DeploymentFile
} from "@/lib/server/auctionReader";
import { buildWalletActivity, type WalletActivityAuction, type WalletAuctionPosition } from "@/lib/walletActivity";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "shortMessage" in error) {
    const shortMessage = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof shortMessage === "string") return shortMessage;
  }

  return error instanceof Error ? error.message : "Unable to read wallet activity";
}

function requestedLimit(value: string | null) {
  if (value === null || value === "") return normalizeWalletActivityEventLimit(value);

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : normalizeWalletActivityEventLimit(value);
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

async function readGlobalCredit({
  wallet,
  functionName,
  label,
  deployment,
  client
}: {
  wallet: Address;
  functionName: "sellerCredits" | "protocolFeeCredits";
  label: string;
  deployment: DeploymentFile;
  client: PublicClient;
}): Promise<{ value: string; warning?: string }> {
  try {
    const value = await client.readContract({
      address: deployment.contracts.escrowVault,
      abi: escrowVaultAbi,
      functionName,
      args: [wallet]
    });
    return { value: toDecimalString(value) };
  } catch (error) {
    return {
      value: "0",
      warning: `Unable to read ${label}: ${errorMessage(error)}`
    };
  }
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

  const [cap, refundableAmount, refundClaimed, rewardEntitlement, rewardClaimed] = await Promise.all([
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
    })
  ]);

  return {
    cap: toDecimalString(cap),
    refundableAmount: toDecimalString(refundableAmount),
    refundClaimed: toBoolean(refundClaimed),
    rewardEntitlement: toDecimalString(rewardEntitlement),
    rewardClaimed: toBoolean(rewardClaimed),
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
    const limitParam = searchParams.get("limit");

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
    const limit = normalizeWalletActivityEventLimit(limitParam);
    const nextAuctionId = (await client.readContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "nextAuctionId"
    })) as bigint;

    const discoveryResult = await discoverWalletActivityAuctionIds({
      client,
      deployment,
      nextAuctionId,
      wallet,
      limit,
      requestedLimit: requestedLimit(limitParam)
    });
    const baseAuctions = await readAuctionsByIds(discoveryResult.ids, {
      client,
      deployment,
      includeNftMetadata: false
    });
    const [auctions, sellerCredit, protocolFeeCredit] = await Promise.all([
      Promise.all(baseAuctions.map((auction) => enrichAuctionForWallet({ auction, wallet, deployment, client }))),
      readGlobalCredit({
        wallet,
        functionName: "sellerCredits",
        label: "global seller proceeds credit",
        deployment,
        client
      }),
      readGlobalCredit({
        wallet,
        functionName: "protocolFeeCredits",
        label: "global protocol fees credit",
        deployment,
        client
      })
    ]);
    const activityWarnings = [
      discoveryResult.discovery.warning,
      sellerCredit.warning,
      protocolFeeCredit.warning
    ].filter((warning): warning is string => Boolean(warning));

    return NextResponse.json({
      chainId: deployment.chainId,
      auctionHouse: deployment.contracts.auctionHouse,
      wallet,
      count: auctions.length,
      discovery: discoveryResult.discovery,
      activity: buildWalletActivity(auctions, wallet, undefined, {
        globalCredits: {
          sellerCredit: sellerCredit.value,
          protocolFeeCredit: protocolFeeCredit.value
        },
        partial: activityWarnings.length > 0,
        warnings: activityWarnings
      })
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
