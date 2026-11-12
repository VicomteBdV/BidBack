import type { Address, PublicClient } from "viem";
import { auctionFormulaAbi } from "@/contracts/auctionHouseAbi";
import type { AuctionFormulaMetadata } from "@/lib/auctionTypes";

export const AMOUNT_RANK_FORMULA_ID = "amount-rank-v1";
export const AMOUNT_RANK_ARITHMETIC_ID = "floor-delta-q136-muldiv512-v1";
export const AMOUNT_RANK_ROUNDING_ID = "hamilton-first-participation-v1";
export const AMOUNT_RANK_SCORE_SCALE = 1n << 136n;
export const AMOUNT_RANK_MAX_AMOUNT = (1n << 112n) - 1n;

// Getter values identify a supported model; they do not verify deployed bytecode.
export function isSupportedAmountRank(formula?: AuctionFormulaMetadata): boolean {
  return formula?.status === "supported" &&
    formula.formulaId === AMOUNT_RANK_FORMULA_ID &&
    formula.arithmeticId === AMOUNT_RANK_ARITHMETIC_ID &&
    formula.roundingId === AMOUNT_RANK_ROUNDING_ID &&
    formula.scoreScale === AMOUNT_RANK_SCORE_SCALE.toString() &&
    formula.maxAmount === AMOUNT_RANK_MAX_AMOUNT.toString();
}

export function amountRankMaximum(formula?: AuctionFormulaMetadata): bigint | null {
  return isSupportedAmountRank(formula) ? AMOUNT_RANK_MAX_AMOUNT : null;
}

export async function readAuctionFormula(
  client: Pick<PublicClient, "readContract">,
  auctionHouse: Address,
  blockNumber: bigint
): Promise<AuctionFormulaMetadata> {
  const base = { auctionHouse, readBlockNumber: blockNumber.toString() };
  try {
    const [formulaId, arithmeticId, roundingId, scoreScale, maxAmount] = await Promise.all([
      client.readContract({ address: auctionHouse, abi: auctionFormulaAbi, functionName: "FORMULA_ID", blockNumber }),
      client.readContract({ address: auctionHouse, abi: auctionFormulaAbi, functionName: "ARITHMETIC_ID", blockNumber }),
      client.readContract({ address: auctionHouse, abi: auctionFormulaAbi, functionName: "ROUNDING_ID", blockNumber }),
      client.readContract({ address: auctionHouse, abi: auctionFormulaAbi, functionName: "SCORE_SCALE", blockNumber }),
      client.readContract({ address: auctionHouse, abi: auctionFormulaAbi, functionName: "MAX_AMOUNT", blockNumber })
    ]);
    if (typeof formulaId !== "string" || typeof arithmeticId !== "string" || typeof roundingId !== "string" ||
        typeof scoreScale !== "bigint" || typeof maxAmount !== "bigint") return { ...base, status: "unavailable" };
    const reported: AuctionFormulaMetadata = { ...base, status: "supported", formulaId, arithmeticId, roundingId,
      scoreScale: scoreScale.toString(), maxAmount: maxAmount.toString() };
    return isSupportedAmountRank(reported) ? reported : { ...reported, status: "unavailable" };
  } catch {
    // Unsupported getters and failed RPC reads cannot distinguish legacy from unknown.
    return { ...base, status: "unavailable" };
  }
}
