import { createWalletClient, http, isAddress, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { localERC721Abi } from "@/contracts/localERC721Abi";
import { paramsControllerAbi } from "@/contracts/paramsControllerAbi";
import {
  anvilRpcUrl,
  anvilServerChain,
  createAnvilPublicClient,
  devPrivateKeyEnv,
  readLocalDeployment
} from "@/lib/server/auctionReader";
import { ZERO_ADDRESS } from "@/lib/format";

const UINT64_MAX = (1n << 64n) - 1n;

export type LocalCreateAuctionContext = {
  chainId: number;
  auctionHouse: Address;
  nftVault: Address;
  localNft: Address;
  paramsController: Address;
  minAuctionDuration: string;
  paused: boolean;
  defaultTokenId: string;
  defaultDuration: string;
};

export type CreateLocalDevAuctionInput = {
  nftContract: string;
  tokenId: string;
  startPriceEth: string;
  durationSeconds: string;
};

export type CreateLocalDevAuctionResult = {
  auctionId: string;
  txHash: `0x${string}`;
  approvalTxHash: `0x${string}` | null;
  seller: Address;
  nft: Address;
  nftVault: Address;
  tokenId: string;
  startPrice: string;
  duration: string;
  minAuctionDuration: string;
};

function getField<T>(raw: unknown, key: string, index: number): T {
  if (Array.isArray(raw)) return raw[index] as T;
  return (raw as Record<string, unknown>)[key] as T;
}

function toBigInt(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return 0n;
}

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function readableError(error: unknown) {
  if (error && typeof error === "object" && "shortMessage" in error) {
    const shortMessage = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof shortMessage === "string") return shortMessage;
  }

  return error instanceof Error ? error.message : "unknown error";
}

function parsePositiveUint(value: string, label: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a positive integer.`);
  }

  const parsed = BigInt(trimmed);

  if (parsed < 1n) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return parsed;
}

function parseStartPrice(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith("-")) {
    throw new Error("Start price must be zero or greater.");
  }

  try {
    const parsed = parseEther(trimmed);
    if (parsed < 0n) throw new Error("negative");
    return parsed;
  } catch {
    throw new Error("Start price must be a valid ETH amount.");
  }
}

function getSellerPrivateKey(): `0x${string}` {
  const envName = devPrivateKeyEnv("seller");
  const privateKey = process.env[envName];

  if (!privateKey || privateKey === "0x") {
    throw new Error(`${envName} is required in frontend/.env.local for local dev auction creation.`);
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(`${envName} must be a 32-byte hex private key.`);
  }

  return privateKey as `0x${string}`;
}

function createSellerWalletClient() {
  const account = privateKeyToAccount(getSellerPrivateKey());

  return {
    account,
    walletClient: createWalletClient({
      account,
      chain: anvilServerChain,
      transport: http(anvilRpcUrl)
    })
  };
}

async function readParams() {
  const deployment = await readLocalDeployment();
  const publicClient = createAnvilPublicClient();

  const [paramsRaw, paused] = await Promise.all([
    publicClient.readContract({
      address: deployment.contracts.paramsController,
      abi: paramsControllerAbi,
      functionName: "params"
    }),
    publicClient.readContract({
      address: deployment.contracts.paramsController,
      abi: paramsControllerAbi,
      functionName: "paused"
    })
  ]);

  return {
    deployment,
    paused,
    minAuctionDuration: toBigInt(getField(paramsRaw, "minAuctionDuration", 10))
  };
}

export async function readLocalCreateAuctionContext(): Promise<LocalCreateAuctionContext> {
  const { deployment, paused, minAuctionDuration } = await readParams();
  const twoHours = 2n * 60n * 60n;
  const defaultDuration = minAuctionDuration > twoHours ? minAuctionDuration : twoHours;

  return {
    chainId: deployment.chainId,
    auctionHouse: deployment.contracts.auctionHouse,
    nftVault: deployment.contracts.nftVault,
    localNft: deployment.contracts.localNft,
    paramsController: deployment.contracts.paramsController,
    minAuctionDuration: minAuctionDuration.toString(),
    paused,
    defaultTokenId: "2",
    defaultDuration: defaultDuration.toString()
  };
}

export async function createLocalDevAuction(
  input: CreateLocalDevAuctionInput
): Promise<CreateLocalDevAuctionResult> {
  if (!isAddress(input.nftContract)) {
    throw new Error("Invalid NFT contract address.");
  }

  const tokenId = parsePositiveUint(input.tokenId, "Token ID");
  const duration = parsePositiveUint(input.durationSeconds, "Duration");
  const startPrice = parseStartPrice(input.startPriceEth);

  if (duration > UINT64_MAX) {
    throw new Error("Duration is too large for AuctionHouse uint64 duration.");
  }

  const { deployment, paused, minAuctionDuration } = await readParams();

  if (paused) {
    throw new Error("Protocol is paused. Auction creation is disabled.");
  }

  if (duration < minAuctionDuration) {
    throw new Error(`Duration below minimum. minAuctionDuration is ${minAuctionDuration.toString()} seconds.`);
  }

  const publicClient = createAnvilPublicClient();
  const { account, walletClient } = createSellerWalletClient();
  const nft = input.nftContract as Address;

  let owner: Address;

  try {
    owner = await publicClient.readContract({
      address: nft,
      abi: localERC721Abi,
      functionName: "ownerOf",
      args: [tokenId]
    });
  } catch (error) {
    throw new Error(`Token #${tokenId.toString()} does not exist or ownerOf failed: ${readableError(error)}.`);
  }

  if (!sameAddress(owner, account.address)) {
    throw new Error(
      `Token #${tokenId.toString()} is not owned by the configured local seller. Current owner: ${owner}.`
    );
  }

  const [approved, approvedForAll] = await Promise.all([
    publicClient.readContract({
      address: nft,
      abi: localERC721Abi,
      functionName: "getApproved",
      args: [tokenId]
    }),
    publicClient.readContract({
      address: nft,
      abi: localERC721Abi,
      functionName: "isApprovedForAll",
      args: [account.address, deployment.contracts.nftVault]
    })
  ]);

  let approvalTxHash: `0x${string}` | null = null;

  if (!approvedForAll && !sameAddress(approved, deployment.contracts.nftVault) && !sameAddress(approved, ZERO_ADDRESS)) {
    approvalTxHash = null;
  }

  if (!approvedForAll && !sameAddress(approved, deployment.contracts.nftVault)) {
    try {
      approvalTxHash = await walletClient.writeContract({
        address: nft,
        abi: localERC721Abi,
        functionName: "approve",
        args: [deployment.contracts.nftVault, tokenId]
      });

      await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
    } catch (error) {
      throw new Error(`NFT approval failed: ${readableError(error)}.`);
    }
  }

  const auctionId = await publicClient.readContract({
    address: deployment.contracts.auctionHouse,
    abi: auctionHouseAbi,
    functionName: "nextAuctionId"
  });

  let txHash: `0x${string}`;

  try {
    txHash = await walletClient.writeContract({
      address: deployment.contracts.auctionHouse,
      abi: auctionHouseAbi,
      functionName: "createAuction",
      args: [nft, tokenId, startPrice, duration]
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });
  } catch (error) {
    throw new Error(`Auction creation reverted: ${readableError(error)}.`);
  }

  return {
    auctionId: auctionId.toString(),
    txHash,
    approvalTxHash,
    seller: account.address,
    nft,
    nftVault: deployment.contracts.nftVault,
    tokenId: tokenId.toString(),
    startPrice: startPrice.toString(),
    duration: duration.toString(),
    minAuctionDuration: minAuctionDuration.toString()
  };
}