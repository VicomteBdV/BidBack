import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { ipfsUriToGatewayUrl, readNftMetadata } from "@/lib/server/nftMetadataReader";
import { testAddresses } from "@/test/fixtures";

type ReadContractRequest = {
  functionName: string;
};

type MetadataFetch = NonNullable<Parameters<typeof readNftMetadata>[0]["fetchFn"]>;

function mockClient(handler: (request: ReadContractRequest) => unknown): PublicClient {
  return {
    readContract: vi.fn(async (request: ReadContractRequest) => handler(request))
  } as unknown as PublicClient;
}

function metadataFetch(json: unknown, status = 200): MetadataFetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(json), {
      status,
      headers: {
        "content-type": "application/json"
      }
    })
  ) as unknown as MetadataFetch;
}

describe("nftMetadataReader", () => {
  it("reads valid HTTP NFT metadata", async () => {
    const client = mockClient(({ functionName }) => {
      if (functionName === "name") return "BidBack Demo";
      if (functionName === "symbol") return "BID";
      if (functionName === "tokenURI") return "https://metadata.example/token/1.json";
      throw new Error(`unexpected ${functionName}`);
    });
    const fetchFn = metadataFetch({
      name: "Demo NFT #1",
      description: "A test NFT for BidBack.",
      image: "https://images.example/1.png",
      external_url: "https://example.com/nft/1"
    });

    const metadata = await readNftMetadata({
      client,
      nft: testAddresses.localNft,
      tokenId: "1",
      fetchFn
    });

    expect(metadata).toMatchObject({
      contractAddress: testAddresses.localNft,
      tokenId: "1",
      collectionName: "BidBack Demo",
      collectionSymbol: "BID",
      tokenUri: "https://metadata.example/token/1.json",
      tokenUriGatewayUrl: "https://metadata.example/token/1.json",
      metadataName: "Demo NFT #1",
      description: "A test NFT for BidBack.",
      imageUrl: "https://images.example/1.png",
      externalUrl: "https://example.com/nft/1",
      status: "loaded"
    });
  });

  it("converts simple IPFS tokenURI and image values", async () => {
    const client = mockClient(({ functionName }) => {
      if (functionName === "name") return "IPFS Collection";
      if (functionName === "symbol") return "IPFS";
      if (functionName === "tokenURI") return "ipfs://ipfs/bafyMeta/1.json";
      throw new Error(`unexpected ${functionName}`);
    });
    const fetchFn = metadataFetch({
      name: "IPFS NFT",
      image: "ipfs://bafyImage/1.png"
    });

    const metadata = await readNftMetadata({
      client,
      nft: testAddresses.localNft,
      tokenId: 1n,
      gateway: "https://gateway.example/ipfs/",
      fetchFn
    });

    expect(ipfsUriToGatewayUrl("ipfs://ipfs/bafyMeta/1.json", "https://gateway.example/ipfs/")).toBe(
      "https://gateway.example/ipfs/bafyMeta/1.json"
    );
    expect(metadata.tokenUriGatewayUrl).toBe("https://gateway.example/ipfs/bafyMeta/1.json");
    expect(metadata.imageUrl).toBe("https://gateway.example/ipfs/bafyImage/1.png");
    expect(metadata.status).toBe("loaded");
  });

  it("returns an unavailable fallback when tokenURI reverts", async () => {
    const client = mockClient(({ functionName }) => {
      if (functionName === "name") return "Fallback Collection";
      if (functionName === "symbol") return "FALL";
      if (functionName === "tokenURI") throw new Error("tokenURI reverted");
      throw new Error(`unexpected ${functionName}`);
    });

    const metadata = await readNftMetadata({
      client,
      nft: testAddresses.localNft,
      tokenId: "2",
      fetchFn: metadataFetch({})
    });

    expect(metadata.status).toBe("unavailable");
    expect(metadata.collectionName).toBe("Fallback Collection");
    expect(metadata.errorMessage).toMatch(/tokenURI unavailable/);
  });

  it("returns an unsupported-token-uri fallback for non HTTP/IPFS tokenURI values", async () => {
    const client = mockClient(({ functionName }) => {
      if (functionName === "name") return "Unsupported Collection";
      if (functionName === "symbol") return "BAD";
      if (functionName === "tokenURI") return "ar://metadata-id";
      throw new Error(`unexpected ${functionName}`);
    });

    const metadata = await readNftMetadata({
      client,
      nft: testAddresses.localNft,
      tokenId: "3",
      fetchFn: metadataFetch({})
    });

    expect(metadata.status).toBe("unsupported-token-uri");
    expect(metadata.tokenUri).toBe("ar://metadata-id");
    expect(metadata.errorMessage).toMatch(/Only http\(s\) and simple ipfs/);
  });

  it("returns a fetch-failed fallback when metadata JSON is invalid", async () => {
    const client = mockClient(({ functionName }) => {
      if (functionName === "name") return "Invalid JSON Collection";
      if (functionName === "symbol") return "BADJSON";
      if (functionName === "tokenURI") return "https://metadata.example/bad.json";
      throw new Error(`unexpected ${functionName}`);
    });
    const fetchFn = vi.fn(async () =>
      new Response("not-json", {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    ) as unknown as MetadataFetch;

    const metadata = await readNftMetadata({
      client,
      nft: testAddresses.localNft,
      tokenId: "4",
      fetchFn
    });

    expect(metadata.status).toBe("fetch-failed");
    expect(metadata.errorMessage).toMatch(/Metadata fetch failed/);
  });

  it("distinguishes loaded metadata without an image", async () => {
    const client = mockClient(({ functionName }) => {
      if (functionName === "name") return "No Image Collection";
      if (functionName === "symbol") return "NOIMG";
      if (functionName === "tokenURI") return "https://metadata.example/no-image.json";
      throw new Error(`unexpected ${functionName}`);
    });

    const metadata = await readNftMetadata({
      client,
      nft: testAddresses.localNft,
      tokenId: "5",
      fetchFn: metadataFetch({
        name: "No Image NFT",
        description: "Metadata exists, but no image is provided."
      })
    });

    expect(metadata.status).toBe("no-image");
    expect(metadata.metadataName).toBe("No Image NFT");
    expect(metadata.imageUrl).toBeUndefined();
  });
});
