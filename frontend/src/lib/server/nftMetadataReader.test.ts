// @vitest-environment node
import { Resolver } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import { Duplex } from "node:stream";
import type { PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipfsUriToGatewayUrl, readNftMetadata } from "@/lib/server/nftMetadataReader";
import { testAddresses } from "@/test/fixtures";

let body: string;
let status: number;
let headers: string;
let failure: Error | undefined;
let connections: number;

function mockClient(tokenUri: unknown = "https://metadata.example/token/1.json") {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "name") return "BidBack Demo";
      if (functionName === "symbol") return "BID";
      if (tokenUri instanceof Error) throw tokenUri;
      return tokenUri;
    })
  } as unknown as PublicClient;
}

// DNS and sockets are simulated; readNftMetadata, download policy, Node HTTP
// framing, JSON parsing, and the final metadata projection all run unchanged.
function connect() {
  connections += 1;
  let sent = false;
  const socket = new Duplex({
    read() {},
    write(_chunk, _encoding, done) {
      done();
      if (sent) return;
      sent = true;
      queueMicrotask(() => {
        if (failure) socket.destroy(failure);
        else {
          socket.push(`HTTP/1.1 ${status} Response\r\nConnection: close\r\n${headers}\r\n${body}`);
          socket.push(null);
        }
      });
    }
  });
  Object.assign(socket, {
    setTimeout: () => socket, setNoDelay: () => socket, setKeepAlive: () => socket
  });
  return socket as unknown as Socket;
}

beforeEach(() => {
  body = JSON.stringify({ name: "Demo NFT #1", description: "A test NFT for BidBack.",
    image: "https://images.example/1.png", external_url: "https://example.com/nft/1" });
  status = 200;
  headers = "";
  failure = undefined;
  connections = 0;
  vi.spyOn(http.Agent.prototype, "createConnection").mockImplementation(connect);
  vi.spyOn(https.Agent.prototype, "createConnection").mockImplementation(connect);
  vi.spyOn(Resolver.prototype, "resolve4").mockResolvedValue(["93.184.216.34"]);
  vi.spyOn(Resolver.prototype, "resolve6").mockResolvedValue([]);
  vi.spyOn(Resolver.prototype, "cancel").mockImplementation(() => {});
});

function read(tokenUri?: unknown, gateway?: string) {
  return readNftMetadata({ client: mockClient(tokenUri), nft: testAddresses.localNft, tokenId: "1", gateway });
}

describe("nftMetadataReader", () => {
  it.each(["http", "https"])("reads valid public %s NFT metadata through the production transport", async (protocol) => {
    const metadata = await read(`${protocol}://metadata.example/token/1.json`);
    expect(metadata).toMatchObject({
      contractAddress: testAddresses.localNft, tokenId: "1", collectionName: "BidBack Demo",
      collectionSymbol: "BID", tokenUri: `${protocol}://metadata.example/token/1.json`,
      tokenUriGatewayUrl: `${protocol}://metadata.example/token/1.json`,
      metadataName: "Demo NFT #1", description: "A test NFT for BidBack.",
      imageUrl: "https://images.example/1.png", externalUrl: "https://example.com/nft/1", status: "loaded"
    });
    expect(connections).toBe(1);
  });

  it.each(["ipfs://bafyMeta/1.json", "ipfs://ipfs/bafyMeta/1.json"])("converts %s using the configured gateway", async (uri) => {
    body = JSON.stringify({ name: "IPFS NFT", image: "ipfs://bafyImage/1.png" });
    const metadata = await read(uri, "https://gateway.example/ipfs/");
    expect(ipfsUriToGatewayUrl(uri, "https://gateway.example/ipfs/")).toBe("https://gateway.example/ipfs/bafyMeta/1.json");
    expect(metadata.tokenUriGatewayUrl).toBe("https://gateway.example/ipfs/bafyMeta/1.json");
    expect(metadata.imageUrl).toBe("https://gateway.example/ipfs/bafyImage/1.png");
    expect(metadata.status).toBe("loaded");
    expect(Resolver.prototype.resolve4).toHaveBeenCalledWith("gateway.example.");
  });

  it("keeps the default IPFS gateway working", async () => {
    vi.stubEnv("NFT_METADATA_IPFS_GATEWAY", "");
    try {
      expect((await read("ipfs://bafyMeta/1.json")).status).toBe("loaded");
      expect(Resolver.prototype.resolve4).toHaveBeenCalledWith("ipfs.io.");
    } finally { vi.unstubAllEnvs(); }
  });

  it.each(["http://127.0.0.1/ipfs/", "https://gateway.example:8443/ipfs/", "https://user:secret@gateway.example/ipfs/"])(
    "applies destination policy to environment gateway %s", async (gateway) => {
      vi.stubEnv("NFT_METADATA_IPFS_GATEWAY", gateway);
      try {
        const metadata = await read("ipfs://bafyMeta/1.json");
        expect(metadata.status).toBe("fetch-failed");
        expect(metadata.errorMessage).toContain("not permitted");
        expect(connections).toBe(0);
      } finally { vi.unstubAllEnvs(); }
    }
  );

  it("rejects a public-looking gateway resolving to a private destination", async () => {
    vi.mocked(Resolver.prototype.resolve4).mockResolvedValue(["10.1.2.3"]);
    expect((await read("ipfs://bafyMeta/1.json", "https://gateway.example/ipfs/")).status).toBe("fetch-failed");
    expect(connections).toBe(0);
  });

  it("does not follow an IPFS gateway redirect", async () => {
    status = 302;
    headers = "Location: http://127.0.0.1/private\r\n";
    expect((await read("ipfs://bafyMeta/1.json")).status).toBe("fetch-failed");
    expect(connections).toBe(1);
  });

  it("keeps tokenURI reverts optional and hides RPC error details", async () => {
    const metadata = await read(new Error("RPC secret / internal host / " + "x".repeat(1000)));
    expect(metadata).toMatchObject({ status: "unavailable", collectionName: "BidBack Demo", errorMessage: "tokenURI unavailable." });
    expect(connections).toBe(0);
  });

  it.each([undefined, ""])("keeps an empty tokenURI optional: %s", async (uri) => {
    const metadata = await readNftMetadata({ client: mockClient(uri === undefined ? null : uri), nft: testAddresses.localNft, tokenId: "1" });
    expect(metadata.status).toBe("unavailable");
    expect(connections).toBe(0);
  });

  it.each(["ar://metadata-id", "data:application/json,{}", "file:///secret"])("keeps unsupported URI fallback for %s", async (uri) => {
    const metadata = await read(uri);
    expect(metadata.status).toBe("unsupported-token-uri");
    expect(metadata.tokenUri).toBe(uri);
    expect(connections).toBe(0);
  });

  it.each(["not-json", "null", "[]", "123"])("returns a fallback for invalid metadata %s", async (value) => {
    body = value;
    const metadata = await read();
    expect(metadata.status).toBe("fetch-failed");
    expect(metadata.errorMessage).toBe("Metadata fetch failed: Metadata response is not a valid JSON object.");
  });

  it("does not include transport errors or response bodies in the displayed message", async () => {
    failure = new Error("internal DNS/TLS details secret " + "x".repeat(1000));
    const metadata = await read();
    expect(metadata.status).toBe("fetch-failed");
    expect(metadata.errorMessage).toBe("Metadata fetch failed: Metadata download failed.");
    expect(metadata.errorMessage!.length).toBeLessThan(160);
  });

  it.each([undefined, "data:image/svg+xml,unsafe"])("preserves metadata without a supported image: %s", async (image) => {
    body = JSON.stringify({ name: "No Image NFT", image });
    const metadata = await read();
    expect(metadata.status).toBe("no-image");
    expect(metadata.metadataName).toBe("No Image NFT");
    expect(metadata.imageUrl).toBeUndefined();
  });

  it("does not make a network request for an invalid token ID", async () => {
    const metadata = await readNftMetadata({ client: mockClient(), nft: testAddresses.localNft, tokenId: "invalid" });
    expect(metadata.status).toBe("unavailable");
    expect(connections).toBe(0);
  });
});
