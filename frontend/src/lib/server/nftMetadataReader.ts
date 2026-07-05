import type { Address, PublicClient } from "viem";
import { erc721Abi } from "@/contracts/erc721Abi";
import type { NftMetadata } from "@/lib/auctionTypes";

type MetadataFetch = (input: string, init?: RequestInit) => Promise<Response>;

type MetadataJson = Record<string, unknown>;

export const DEFAULT_NFT_METADATA_TIMEOUT_MS = 4_000;
export const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

function configuredIpfsGateway() {
  const configured = process.env.NFT_METADATA_IPFS_GATEWAY?.trim();
  return configured || DEFAULT_IPFS_GATEWAY;
}

function normalizeGateway(gateway: string) {
  return gateway.endsWith("/") ? gateway : `${gateway}/`;
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { shortMessage?: unknown; details?: unknown; message?: unknown };

    if (typeof candidate.shortMessage === "string") return candidate.shortMessage;
    if (typeof candidate.details === "string") return candidate.details;
    if (typeof candidate.message === "string") return candidate.message;
  }

  return error instanceof Error ? error.message : String(error);
}

export function ipfsUriToGatewayUrl(uri: string, gateway = configuredIpfsGateway()) {
  const trimmed = uri.trim();

  if (!trimmed.toLowerCase().startsWith("ipfs://")) {
    return null;
  }

  let ipfsPath = trimmed.slice("ipfs://".length).replace(/^\/+/, "");

  if (ipfsPath.toLowerCase().startsWith("ipfs/")) {
    ipfsPath = ipfsPath.slice("ipfs/".length);
  }

  if (!ipfsPath) return null;

  return `${normalizeGateway(gateway)}${ipfsPath}`;
}

export function uriToHttpUrl(uri?: string, gateway = configuredIpfsGateway()) {
  if (!uri) return undefined;

  const trimmed = uri.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return ipfsUriToGatewayUrl(trimmed, gateway) ?? undefined;
}

async function readCollectionString(
  client: PublicClient,
  nft: Address,
  functionName: "name" | "symbol"
) {
  try {
    const value = await client.readContract({
      address: nft,
      abi: erc721Abi,
      functionName
    });

    return cleanString(value);
  } catch {
    return undefined;
  }
}

async function readTokenUri(client: PublicClient, nft: Address, tokenId: bigint) {
  const value = await client.readContract({
    address: nft,
    abi: erc721Abi,
    functionName: "tokenURI",
    args: [tokenId]
  });

  return cleanString(value);
}

async function fetchJsonMetadata(
  url: string,
  fetchFn: MetadataFetch,
  timeoutMs: number
): Promise<MetadataJson> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Metadata request failed with HTTP ${response.status}`);
    }

    const json = (await response.json()) as unknown;

    if (!json || typeof json !== "object" || Array.isArray(json)) {
      throw new Error("NFT metadata JSON is not an object");
    }

    return json as MetadataJson;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readNftMetadata({
  client,
  nft,
  tokenId,
  gateway = configuredIpfsGateway(),
  fetchFn = fetch,
  timeoutMs = DEFAULT_NFT_METADATA_TIMEOUT_MS
}: {
  client: PublicClient;
  nft: Address;
  tokenId: string | bigint;
  gateway?: string;
  fetchFn?: MetadataFetch;
  timeoutMs?: number;
}): Promise<NftMetadata> {
  const tokenIdString = tokenId.toString();
  const base: NftMetadata = {
    contractAddress: nft,
    tokenId: tokenIdString,
    status: "unavailable"
  };

  let parsedTokenId: bigint;

  try {
    parsedTokenId = typeof tokenId === "bigint" ? tokenId : BigInt(tokenId);
  } catch {
    return {
      ...base,
      errorMessage: "Invalid tokenId for metadata read."
    };
  }

  const [collectionName, collectionSymbol, tokenUriResult] = await Promise.allSettled([
    readCollectionString(client, nft, "name"),
    readCollectionString(client, nft, "symbol"),
    readTokenUri(client, nft, parsedTokenId)
  ]);

  const metadataBase: NftMetadata = {
    ...base,
    collectionName: collectionName.status === "fulfilled" ? collectionName.value : undefined,
    collectionSymbol: collectionSymbol.status === "fulfilled" ? collectionSymbol.value : undefined
  };

  if (tokenUriResult.status === "rejected") {
    return {
      ...metadataBase,
      status: "unavailable",
      errorMessage: `tokenURI unavailable: ${errorMessage(tokenUriResult.reason)}`
    };
  }

  const tokenUri = tokenUriResult.value;

  if (!tokenUri) {
    return {
      ...metadataBase,
      status: "unavailable",
      errorMessage: "tokenURI is empty or unavailable."
    };
  }

  const tokenUriGatewayUrl = uriToHttpUrl(tokenUri, gateway);

  if (!tokenUriGatewayUrl) {
    return {
      ...metadataBase,
      tokenUri,
      status: "unsupported-token-uri",
      errorMessage: "Only http(s) and simple ipfs:// tokenURI values are supported by the MVP preview."
    };
  }

  try {
    const metadata = await fetchJsonMetadata(tokenUriGatewayUrl, fetchFn, timeoutMs);
    const metadataName = cleanString(metadata.name);
    const description = cleanString(metadata.description);
    const image = cleanString(metadata.image);
    const externalUrl = uriToHttpUrl(cleanString(metadata.external_url), gateway);
    const imageUrl = uriToHttpUrl(image, gateway);

    return {
      ...metadataBase,
      tokenUri,
      tokenUriGatewayUrl,
      metadataName,
      description,
      imageUrl,
      externalUrl,
      status: imageUrl ? "loaded" : "no-image",
      errorMessage: image && !imageUrl ? "NFT image URI is not http(s) or simple ipfs://." : undefined
    };
  } catch (error) {
    return {
      ...metadataBase,
      tokenUri,
      tokenUriGatewayUrl,
      status: "fetch-failed",
      errorMessage: `Metadata fetch failed: ${errorMessage(error)}`
    };
  }
}
