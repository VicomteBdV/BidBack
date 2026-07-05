import { describe, expect, it } from "vitest";
import {
  parseCreateAuctionValues,
  validateCreateAuctionFields,
  type CreateAuctionValues
} from "@/lib/createAuctionValidation";
import { testAddresses } from "@/test/fixtures";

const validValues: CreateAuctionValues = {
  nftContract: testAddresses.localNft,
  tokenId: "0",
  startPriceEth: "1",
  durationSeconds: "7200"
};

function validate(overrides: Partial<CreateAuctionValues>) {
  return validateCreateAuctionFields({
    ...validValues,
    ...overrides
  });
}

describe("create auction validation", () => {
  it("accepts token ID 0", () => {
    expect(validate({ tokenId: "0" })).toBeNull();

    const parsed = parseCreateAuctionValues({
      ...validValues,
      tokenId: "0"
    });

    expect(parsed.tokenId).toBe(0n);
  });

  it("accepts token ID 1", () => {
    expect(validate({ tokenId: "1" })).toBeNull();

    const parsed = parseCreateAuctionValues({
      ...validValues,
      tokenId: "1"
    });

    expect(parsed.tokenId).toBe(1n);
  });

  it("rejects an empty token ID", () => {
    expect(validate({ tokenId: "" })).toBe("Token ID is required.");
    expect(validate({ tokenId: "   " })).toBe("Token ID is required.");
  });

  it("rejects a negative token ID", () => {
    expect(validate({ tokenId: "-1" })).toBe("Token ID must be a non-negative integer.");
  });

  it("rejects a decimal token ID", () => {
    expect(validate({ tokenId: "1.5" })).toBe("Token ID must be a non-negative integer.");
  });

  it("distinguishes empty and invalid NFT contract addresses", () => {
    expect(validate({ nftContract: "" })).toBe("NFT contract address is required.");
    expect(validate({ nftContract: "not-an-address" })).toBe("Invalid NFT contract address.");
  });

  it("parses large token IDs as bigint without Number conversion", () => {
    const largeTokenId = "1234567890123456789012345678901234567890";
    const parsed = parseCreateAuctionValues({
      ...validValues,
      tokenId: largeTokenId
    });

    expect(parsed.tokenId).toBe(BigInt(largeTokenId));
  });
});
