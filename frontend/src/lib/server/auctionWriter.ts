import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { distributionVaultAbi } from "@/contracts/distributionVaultAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import type { DevBidderRole } from "@/lib/auctionTypes";
import {
  anvilRpcUrl,
  anvilServerChain,
  createAnvilPublicClient,
  devPrivateKeyEnv,
  parseAuctionId,
  readAuctionById,
  readLocalDeployment
} from "@/lib/server/auctionReader";
import { ZERO_ADDRESS } from "@/lib/format";

type DevActionResult = {
  auctionId: string;
  txHash: `0x${string}`;
};

type DevBidResult = DevActionResult & {
  bidder: Address;
  bidderRole: DevBidderRole;
  bidAmount: string;
  valueSent: string;
};

type DevFinalizeResult = DevActionResult & {
  finalizedBy: Address;
  timeIncreasedBy: string;
};

type DevClaimResult = DevActionResult & {
  claimant: Address;
};

type DevWithdrawResult = {
  txHash: `0x${string}`;
  recipient: Address;
  amount: string;
};

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function getDevPrivateKey(role: "seller" | "feeRecipient" | "primary" | "secondary"): `0x${string}` {
  const envName = devPrivateKeyEnv(role);
  const privateKey = process.env[envName];

  if (!privateKey || privateKey === "0x") {
    throw new Error(`${envName} is required in frontend/.env.local for local dev actions.`);
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(`${envName} must be a 32-byte hex private key.`);
  }

  return privateKey as `0x${string}`;
}

function getAuctionIdOrThrow(auctionIdParam: string) {
  const auctionId = parseAuctionId(auctionIdParam);

  if (!auctionId) {
    throw new Error(`Invalid auction id: ${auctionIdParam}`);
  }

  return auctionId;
}

function createDevWalletClient(role: "seller" | "feeRecipient" | "primary" | "secondary") {
  const account = privateKeyToAccount(getDevPrivateKey(role));

  return {
    account,
    walletClient: createWalletClient({
      account,
      chain: anvilServerChain,
      transport: http(anvilRpcUrl)
    })
  };
}

async function requestAnvil(method: string, params: unknown[] = []) {
  const response = await fetch(anvilRpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    })
  });

  const payload = (await response.json()) as { error?: { message?: string }; result?: unknown };

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Anvil request failed: ${method}`);
  }

  return payload.result;
}

export async function placeDemoBid(auctionIdParam: string, bidderRole: DevBidderRole): Promise<DevBidResult> {
  const auctionId = getAuctionIdOrThrow(auctionIdParam);
  const role = bidderRole === "secondary" ? "secondary" : "primary";
  const deployment = await readLocalDeployment();
  const publicClient = createAnvilPublicClient();
  const { account, walletClient } = createDevWalletClient(role);
  const auctionDetail = await readAuctionById(auctionId.toString());

  if (auctionDetail.auction.state !== 0) {
    throw new Error("Demo bid is only available while the auction is OPEN.");
  }

  if (sameAddress(account.address, auctionDetail.auction.seller)) {
    throw new Error("The demo bidder private key must not be the seller/deployer account.");
  }

  const bidAmount = await publicClient.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "minimumNextBid",
    args: [auctionId]
  });

  const previousCap = await publicClient.readContract({
    address: deployment.contracts.escrowVault,
    abi: escrowVaultAbi,
    functionName: "capOf",
    args: [auctionId, account.address]
  });

  if (bidAmount <= previousCap) {
    throw new Error("Demo bidder already has a cap at or above the minimum next bid.");
  }

  const valueSent = bidAmount - previousCap;

  const txHash = await walletClient.writeContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "placeBid",
    args: [auctionId, bidAmount],
    value: valueSent
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    auctionId: auctionId.toString(),
    txHash,
    bidder: account.address,
    bidderRole,
    bidAmount: bidAmount.toString(),
    valueSent: valueSent.toString()
  };
}

export async function finalizeDemoAuction(auctionIdParam: string): Promise<DevFinalizeResult> {
  const auctionId = getAuctionIdOrThrow(auctionIdParam);
  const deployment = await readLocalDeployment();
  const publicClient = createAnvilPublicClient();
  const { account, walletClient } = createDevWalletClient("primary");
  const auctionDetail = await readAuctionById(auctionId.toString());

  if (auctionDetail.auction.finalized) {
    throw new Error("Auction is already finalized.");
  }

  let timeIncreasedBy = 0n;

  if (auctionDetail.auction.state === 0) {
    const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
    const endTime = BigInt(auctionDetail.auction.endTime);

    if (latestBlock.timestamp <= endTime) {
      timeIncreasedBy = endTime - latestBlock.timestamp + 1n;
      await requestAnvil("evm_increaseTime", [Number(timeIncreasedBy)]);
      await requestAnvil("evm_mine");
    }
  }

  const txHash = await walletClient.writeContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "finalizeAuction",
    args: [auctionId]
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    auctionId: auctionId.toString(),
    txHash,
    finalizedBy: account.address,
    timeIncreasedBy: timeIncreasedBy.toString()
  };
}

export async function claimDemoNft(auctionIdParam: string): Promise<DevClaimResult> {
  const auctionId = getAuctionIdOrThrow(auctionIdParam);
  const deployment = await readLocalDeployment();
  const publicClient = createAnvilPublicClient();
  const auctionDetail = await readAuctionById(auctionId.toString());
  const economics = auctionDetail.auction.economics;

  if (!economics) throw new Error("Auction economics are unavailable.");
  if (!auctionDetail.auction.finalized) throw new Error("Auction must be finalized before claiming the NFT.");
  if (auctionDetail.auction.nftClaimed) throw new Error("NFT is already claimed.");

  const claimantRole = economics.nftClaim.claimantRole;
  if (!claimantRole || claimantRole === "unknown") {
    throw new Error("NFT claimant is not one of the configured local dev accounts.");
  }

  const { account, walletClient } = createDevWalletClient(claimantRole);

  if (!sameAddress(account.address, economics.nftClaim.claimant)) {
    throw new Error("Configured claimant key does not match the expected NFT claimant.");
  }

  const txHash = await walletClient.writeContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "claimNft",
    args: [auctionId]
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    auctionId: auctionId.toString(),
    txHash,
    claimant: account.address
  };
}

export async function claimDemoRefund(auctionIdParam: string, bidderRole: DevBidderRole): Promise<DevClaimResult> {
  const auctionId = getAuctionIdOrThrow(auctionIdParam);
  const role = bidderRole === "secondary" ? "secondary" : "primary";
  const deployment = await readLocalDeployment();
  const publicClient = createAnvilPublicClient();
  const { account, walletClient } = createDevWalletClient(role);
  const auctionDetail = await readAuctionById(auctionId.toString());
  const bidder = role === "primary" ? auctionDetail.auction.economics?.primaryBidder : auctionDetail.auction.economics?.secondBidder;

  if (!auctionDetail.auction.finalized) throw new Error("Auction must be finalized before refund claim.");
  if (!bidder?.configured) throw new Error("Bidder key is not configured.");
  if (bidder.refundClaimed) throw new Error(`${bidder.label} refund is already claimed.`);
  if (BigInt(bidder.refundableAmount) === 0n) throw new Error(`${bidder.label} has no refundable amount.`);
  if (!sameAddress(account.address, bidder.address)) throw new Error("Configured bidder key does not match claim target.");

  const txHash = await walletClient.writeContract({
    address: deployment.contracts.escrowVault,
    abi: escrowVaultAbi,
    functionName: "claimRefund",
    args: [auctionId]
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    auctionId: auctionId.toString(),
    txHash,
    claimant: account.address
  };
}

export async function claimDemoReward(auctionIdParam: string, bidderRole: DevBidderRole): Promise<DevClaimResult> {
  const auctionId = getAuctionIdOrThrow(auctionIdParam);
  const role = bidderRole === "secondary" ? "secondary" : "primary";
  const deployment = await readLocalDeployment();
  const publicClient = createAnvilPublicClient();
  const { account, walletClient } = createDevWalletClient(role);
  const auctionDetail = await readAuctionById(auctionId.toString());
  const bidder = role === "primary" ? auctionDetail.auction.economics?.primaryBidder : auctionDetail.auction.economics?.secondBidder;

  if (!auctionDetail.auction.finalized) throw new Error("Auction must be finalized before reward claim.");
  if (!auctionDetail.auction.economics?.distribution.opened) throw new Error("Distribution is not opened.");
  if (!bidder?.configured) throw new Error("Bidder key is not configured.");
  if (bidder.rewardClaimed) throw new Error(`${bidder.label} reward is already claimed.`);
  if (BigInt(bidder.rewardEntitlement) === 0n) throw new Error(`${bidder.label} has no reward entitlement.`);
  if (!sameAddress(account.address, bidder.address)) throw new Error("Configured bidder key does not match claim target.");

  const txHash = await walletClient.writeContract({
    address: deployment.contracts.distributionVault,
    abi: distributionVaultAbi,
    functionName: "claim",
    args: [auctionId]
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    auctionId: auctionId.toString(),
    txHash,
    claimant: account.address
  };
}

export async function withdrawDemoSellerProceeds(auctionIdParam: string): Promise<DevWithdrawResult> {
  const deployment = await readLocalDeployment();
  const publicClient = createAnvilPublicClient();
  const { account, walletClient } = createDevWalletClient("seller");
  const auctionDetail = await readAuctionById(auctionIdParam);
  const credit = auctionDetail.auction.economics?.seller.credit ?? "0";

  if (!sameAddress(account.address, auctionDetail.auction.seller)) {
    throw new Error("Configured seller key does not match the auction seller.");
  }

  if (BigInt(credit) === 0n) {
    throw new Error("Seller proceeds are already withdrawn or unavailable.");
  }

  const txHash = await walletClient.writeContract({
    address: deployment.contracts.escrowVault,
    abi: escrowVaultAbi,
    functionName: "withdrawSellerProceeds"
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    recipient: account.address,
    amount: credit
  };
}

export async function withdrawDemoProtocolFees(auctionIdParam: string): Promise<DevWithdrawResult> {
  const deployment = await readLocalDeployment();
  const publicClient = createAnvilPublicClient();
  const { account, walletClient } = createDevWalletClient("feeRecipient");
  const auctionDetail = await readAuctionById(auctionIdParam);
  const feeRecipient = auctionDetail.auction.economics?.feeRecipient.address ?? ZERO_ADDRESS;
  const credit = auctionDetail.auction.economics?.feeRecipient.credit ?? "0";

  if (!sameAddress(account.address, feeRecipient)) {
    throw new Error("Configured fee recipient key does not match the protocol fee recipient.");
  }

  if (BigInt(credit) === 0n) {
    throw new Error("Protocol fees are already withdrawn or unavailable.");
  }

  const txHash = await walletClient.writeContract({
    address: deployment.contracts.escrowVault,
    abi: escrowVaultAbi,
    functionName: "withdrawProtocolFees"
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    recipient: account.address,
    amount: credit
  };
}