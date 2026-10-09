import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { auctionDetailFixture, testAddresses } from "@/test/fixtures";
import {
  assertAuctionReferenceBlock, assertWalletAuctionIdentity, assertWalletAuctionTarget,
  displayedWalletAuctionIdentity, preflightWalletAuctionIdentity, walletAuctionIdentityKey,
  WalletAuctionIdentityError
} from "@/lib/walletAuctionIdentity";

const a = auctionDetailFixture.auction;
const liveAuction = () => ({ seller: a.seller, nft: a.nft, tokenId: BigInt(a.tokenId), startPrice: BigInt(a.startPrice),
  startTime: BigInt(a.startTime), initialEndTime: BigInt(a.initialEndTime), endTime: BigInt(a.endTime),
  extensionsUsed: a.extensionsUsed, state: a.state, highestBidder: a.highestBidder, highestBid: BigInt(a.highestBid),
  participantCount: BigInt(a.participantCount), bidCount: BigInt(a.bidCount), nftClaimed: a.nftClaimed });
const identity = () => displayedWalletAuctionIdentity(31337, testAddresses.auctionHouse, a);
const target = { targetChainId: 31337, selectedChainId: 31337, deploymentChainId: 31337, auctionHouse: testAddresses.auctionHouse };
const block = { number: 42n, hash: `0x${"a".repeat(64)}`, timestamp: 1780007200n };
function clients() {
  const getBlock = vi.fn(async () => block);
  const readContract = vi.fn(async () => liveAuction());
  return { getBlock, readContract, client: { getBlock, readContract } as unknown as PublicClient };
}
function kind(run: () => unknown, expected: "context" | "unavailable") {
  try { run(); throw new Error("Expected failure"); }
  catch (error) { expect(error).toBeInstanceOf(WalletAuctionIdentityError); expect(error).toMatchObject({ kind: expected }); }
}

describe("displayed wallet auction identity", () => {
  it("freezes the minimum identity and compares large integers without rounding", () => {
    const displayed = { ...a, tokenId: "9007199254740993", startPrice: "9007199254740995" };
    const id = displayedWalletAuctionIdentity(31337, testAddresses.auctionHouse, displayed);
    expect(Object.isFrozen(id)).toBe(true);
    expect(id.tokenId).toBe(9007199254740993n);
    expect(id.startPrice).toBe(9007199254740995n);
    expect(() => assertWalletAuctionIdentity(id, { ...liveAuction(), tokenId: id.tokenId, startPrice: id.startPrice })).not.toThrow();
    kind(() => assertWalletAuctionIdentity(id, { ...liveAuction(), tokenId: 9007199254740992n, startPrice: id.startPrice }), "context");
  });
  it("accepts legitimate zero token ID and starting price", () => {
    const id = displayedWalletAuctionIdentity(31337, testAddresses.auctionHouse, { ...a, tokenId: "0", startPrice: "0" });
    expect(() => assertWalletAuctionIdentity(id, { ...liveAuction(), tokenId: 0n, startPrice: 0n })).not.toThrow();
  });
  it("normalizes validated addresses without requiring checksum casing", () => {
    const seller = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const id = displayedWalletAuctionIdentity(31337, testAddresses.auctionHouse, { ...a, seller });
    expect(() => assertWalletAuctionIdentity(id, { ...liveAuction(), seller: `0x${seller.slice(2).toUpperCase()}` })).not.toThrow();
  });
  it.each([
    { auctionId: "0" }, { auctionId: "-1" }, { auctionId: "1.5" }, { tokenId: "1e18" }, { tokenId: " 1" },
    { tokenId: Number.MAX_SAFE_INTEGER }, { tokenId: (1n << 256n).toString() }, { startTime: (1n << 64n).toString() },
    { seller: "0x0" }, { nft: `0x${"0".repeat(40)}` }, { initialEndTime: a.startTime }, { startPrice: undefined }
  ])("refuses malformed displayed field %j", (change) => {
    kind(() => displayedWalletAuctionIdentity(31337, testAddresses.auctionHouse, { ...a, ...change } as typeof a), "context");
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN])("refuses invalid chain %s", (chainId) => {
    kind(() => displayedWalletAuctionIdentity(chainId, testAddresses.auctionHouse, a), "context");
  });
  it.each(["0x0", `0x${"0".repeat(40)}`, "garbage"])("refuses invalid displayed house %s", (house) => {
    kind(() => displayedWalletAuctionIdentity(31337, house as `0x${string}`, a), "context");
  });
  it("excludes all evolving fields from the immutable context key", () => {
    const changed = { ...a, endTime: "9999999999", highestBid: "999", highestBidder: testAddresses.primaryBidder,
      participantCount: "7", bidCount: "10", state: 2 as const, nftClaimed: true, finalized: true };
    expect(walletAuctionIdentityKey(displayedWalletAuctionIdentity(31337, testAddresses.auctionHouse, changed))).toBe(walletAuctionIdentityKey(identity()));
    expect(() => assertWalletAuctionIdentity(identity(), { ...liveAuction(), endTime: 9999999999n, highestBid: 999n,
      highestBidder: testAddresses.primaryBidder, participantCount: 7n, bidCount: 10n, state: 2, nftClaimed: true })).not.toThrow();
  });
});

describe("coherent auction identity preflight", () => {
  it.each(["targetChainId", "selectedChainId", "deploymentChainId"] as const)("rejects a different %s before RPC", async (field) => {
    const f = clients();
    await expect(preflightWalletAuctionIdentity(f.client, identity(), { ...target, [field]: 1 })).rejects.toMatchObject({ kind: "context" });
    expect(f.readContract).not.toHaveBeenCalled(); expect(f.getBlock).not.toHaveBeenCalled();
  });
  it("rejects a different or zero deployment house", () => {
    kind(() => assertWalletAuctionTarget(identity(), { ...target, auctionHouse: testAddresses.localNft }), "context");
    kind(() => assertWalletAuctionTarget(identity(), { ...target, auctionHouse: `0x${"0".repeat(40)}` }), "context");
  });
  it.each(["seller", "nft", "tokenId", "startPrice", "startTime", "initialEndTime"] as const)("rejects reused-ID lot with different %s", (field) => {
    const value = liveAuction();
    const change = field === "seller" || field === "nft" ? testAddresses.primaryBidder : value[field] + 1n;
    kind(() => assertWalletAuctionIdentity(identity(), { ...value, [field]: change }), "context");
  });
  it.each([null, {}, { ...liveAuction(), seller: `0x${"0".repeat(40)}` }, { ...liveAuction(), tokenId: "1" },
    { ...liveAuction(), startTime: undefined }, { ...liveAuction(), state: undefined }, { ...liveAuction(), state: 4 },
    { ...liveAuction(), nftClaimed: 1 }, { ...liveAuction(), endTime: -1n }])("refuses unknown or malformed actual tuple case %#", (value) => {
    kind(() => assertWalletAuctionIdentity(identity(), value), "unavailable");
  });
  it("reads the actual contract and ID at one mined reference block", async () => {
    const f = clients();
    const result = await preflightWalletAuctionIdentity(f.client, identity(), target);
    expect(result.liveAuction).toEqual(liveAuction()); expect(result.referenceBlock).toEqual(block);
    expect(f.getBlock).toHaveBeenCalledExactlyOnceWith({ blockTag: "latest" });
    expect(f.readContract).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ address: target.auctionHouse,
      functionName: "getAuction", args: [1n], blockNumber: 42n }));
  });
  it("reuses an existing finalization reference without a second latest-block read", async () => {
    const f = clients();
    await preflightWalletAuctionIdentity(f.client, identity(), target, block);
    expect(f.getBlock).not.toHaveBeenCalled();
  });
  it.each(["block", "auction"])("reports %s RPC failure as unavailable without exposing diagnostics", async (failed) => {
    const f = clients();
    if (failed === "block") f.getBlock.mockRejectedValue(new Error("private RPC diagnostic"));
    else f.readContract.mockRejectedValue(new Error("private RPC diagnostic"));
    const result = preflightWalletAuctionIdentity(f.client, identity(), target);
    await expect(result).rejects.toMatchObject({ kind: "unavailable" });
    await expect(result).rejects.not.toThrow("private RPC diagnostic");
  });
  it.each([{ ...block, number: null }, { ...block, timestamp: "1" }, { ...block, hash: null },
    { ...block, hash: "0xabc" }, { ...block, hash: `0x${"0".repeat(64)}` }])("refuses incomplete reference case %# before auction read", async (invalid) => {
    const f = clients();
    await expect(preflightWalletAuctionIdentity(f.client, identity(), target, invalid)).rejects.toMatchObject({ kind: "unavailable" });
    expect(f.readContract).not.toHaveBeenCalled();
  });
  it("rechecks reference hash at its same number without rejecting ordinary later blocks", async () => {
    const f = clients();
    const result = await preflightWalletAuctionIdentity(f.client, identity(), target);
    await assertAuctionReferenceBlock(f.client, result.referenceBlock);
    expect(f.getBlock).toHaveBeenLastCalledWith({ blockNumber: 42n });
  });
  it.each([{ ...block, hash: `0x${"b".repeat(64)}` }, { ...block, number: 43n }, { ...block, timestamp: block.timestamp + 1n }])(
    "refuses reset or inconsistent block recheck case %#", async (changed) => {
      const f = clients(); const result = await preflightWalletAuctionIdentity(f.client, identity(), target);
      f.getBlock.mockResolvedValue(changed);
      await expect(assertAuctionReferenceBlock(f.client, result.referenceBlock)).rejects.toMatchObject({ kind: "unavailable" });
    });
});
