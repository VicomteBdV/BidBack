import { describe, expect, it, vi } from "vitest";
import { decodeFunctionResult, encodeFunctionResult, type PublicClient } from "viem";
import { amountRankAuctionHouseAbi, auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { amountRankParamsControllerAbi, paramsControllerAbi } from "@/contracts/paramsControllerAbi";
import { AMOUNT_RANK_MAX_AMOUNT, AMOUNT_RANK_SCORE_SCALE, amountRankMaximum, isSupportedAmountRank, readAuctionFormula } from "@/lib/auctionFormula";
import { amountRankFormulaFixture, testAddresses } from "@/test/fixtures";

function metadataClient(overrides: Record<string, unknown> = {}, error?: string) {
  const values: Record<string, unknown> = { FORMULA_ID: "amount-rank-v1", ARITHMETIC_ID: "floor-delta-q136-muldiv512-v1",
    ROUNDING_ID: "hamilton-first-participation-v1", SCORE_SCALE: AMOUNT_RANK_SCORE_SCALE, MAX_AMOUNT: AMOUNT_RANK_MAX_AMOUNT, ...overrides };
  const readContract = vi.fn(async (request: { functionName: string }) => {
    if (request.functionName === error) throw new Error("unsupported getter or RPC unavailable");
    return values[request.functionName];
  });
  return { client: { readContract } as unknown as PublicClient, readContract };
}

describe("reported auction formula", () => {
  it("requires all identifiers and arithmetic bounds from the same address and block", async () => {
    const { client, readContract } = metadataClient();
    const formula = await readAuctionFormula(client, testAddresses.auctionHouse, 42n);
    expect(formula).toEqual(amountRankFormulaFixture);
    expect(amountRankMaximum(formula)).toBe(AMOUNT_RANK_MAX_AMOUNT);
    for (const [request] of readContract.mock.calls) expect(request).toMatchObject({ address: testAddresses.auctionHouse, blockNumber: 42n });
  });
  it.each(["FORMULA_ID", "ARITHMETIC_ID", "ROUNDING_ID", "SCORE_SCALE", "MAX_AMOUNT"])("keeps %s failure unavailable without guessing legacy", async (getter) => {
    const { client } = metadataClient({}, getter);
    const formula = await readAuctionFormula(client, testAddresses.auctionHouse, 43n);
    expect(formula.status).toBe("unavailable");
    expect(amountRankMaximum(formula)).toBeNull();
  });
  it.each([{ FORMULA_ID: "future-v2" }, { ARITHMETIC_ID: "other" }, { ROUNDING_ID: "other" },
    { SCORE_SCALE: 1n }, { MAX_AMOUNT: AMOUNT_RANK_MAX_AMOUNT + 1n }])("does not adopt unknown reported rules case %#", async (override) => {
    const { client } = metadataClient(override);
    const formula = await readAuctionFormula(client, testAddresses.auctionHouse, 42n);
    expect(isSupportedAmountRank(formula)).toBe(false);
    expect(amountRankMaximum(formula)).toBeNull();
  });
  it("preserves legacy ABI decoding separately from the appended h tuple", () => {
    const base = { bidbackFeeBps: 500, redistributionBps: 5000, minParticipants: 2, alphaBps: 5000, betaBps: 3000, gammaBps: 2000,
      minBidIncrementBps: 500, perUserRewardCapBps: 4000, maxParticipants: 64, maxInteractionCount: 10, minAuctionDuration: 1n,
      antiSnipeWindow: 1n, antiSnipeExtension: 1n, maxAntiSnipeExtensions: 1, minExposure: 1n, minPremiumNet: 1n, efCap: 1n, etCap: 1n, iiCap: 1n };
    const legacy = encodeFunctionResult({ abi: auctionHouseAbi, functionName: "getAuctionParams", result: base });
    expect(decodeFunctionResult({ abi: auctionHouseAbi, functionName: "getAuctionParams", data: legacy })).toEqual(base);
    const current = encodeFunctionResult({ abi: amountRankAuctionHouseAbi, functionName: "getAuctionParams", result: { ...base, rankSoftness: 4 } });
    expect(decodeFunctionResult({ abi: amountRankAuctionHouseAbi, functionName: "getAuctionParams", data: current })).toEqual({ ...base, rankSoftness: 4 });
    expect(() => decodeFunctionResult({ abi: amountRankAuctionHouseAbi, functionName: "getAuctionParams", data: legacy })).toThrow();
    expect(paramsControllerAbi[1].outputs[0].components).toHaveLength(19);
    expect(amountRankParamsControllerAbi[1].outputs[0].components).toHaveLength(20);
  });
});
