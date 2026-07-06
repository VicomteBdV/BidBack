import { describe, expect, it } from "vitest";
import { buildAuctionEconomicSummary } from "@/lib/auctionEconomics";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { auctionDetailFixture, testAddresses } from "@/test/fixtures";

function finalizedAuction(): SerializedAuction {
  return {
    ...auctionDetailFixture.auction,
    state: 2,
    stateLabel: "FINALIZED",
    finalized: true,
    economics: {
      ...auctionDetailFixture.auction.economics!,
      settlement: {
        finalized: true,
        winner: testAddresses.secondBidder,
        distributionVault: testAddresses.distributionVault,
        finalPrice: "1200000000000000000",
        sellerProceeds: "1170000000000000000",
        feeAmount: "10000000000000000",
        distributionReserve: "20000000000000000"
      },
      distribution: {
        opened: true,
        totalAssigned: "15000000000000000",
        totalClaimed: "5000000000000000"
      },
      seller: {
        ...auctionDetailFixture.auction.economics!.seller,
        credit: "1170000000000000000",
        canWithdraw: true
      },
      feeRecipient: {
        ...auctionDetailFixture.auction.economics!.feeRecipient,
        credit: "10000000000000000",
        canWithdraw: true
      },
      primaryBidder: {
        ...auctionDetailFixture.auction.economics!.primaryBidder,
        refundableAmount: "1000000000000000000",
        rewardEntitlement: "15000000000000000"
      }
    }
  };
}

describe("buildAuctionEconomicSummary", () => {
  it("marks settlement amounts as pending for an open auction", () => {
    const summary = buildAuctionEconomicSummary(auctionDetailFixture.auction);

    expect(summary.settlement.currentHighestBid).toMatchObject({
      status: "known",
      value: "1200000000000000000"
    });
    expect(summary.settlement.finalPrice.status).toBe("pending");
    expect(summary.settlement.sellerProceeds.status).toBe("pending");
    expect(summary.settlement.protocolFees.status).toBe("pending");
    expect(summary.settlement.refundsAvailable.status).toBe("pending");
    expect(summary.settlement.rewardsAvailable.status).toBe("pending");
    expect(summary.parameters).toMatchObject({
      bidbackFeeBps: "500",
      redistributionBps: "3000",
      minPremiumNet: "100000000000000000"
    });
    expect(summary.notes.join(" ")).toMatch(/not be read as a yield promise/i);
    expect(() => JSON.stringify(summary)).not.toThrow();
  });

  it("uses finalized settlement reads when available", () => {
    const summary = buildAuctionEconomicSummary(finalizedAuction());

    expect(summary.settlement.finalPrice).toMatchObject({
      status: "known",
      value: "1200000000000000000"
    });
    expect(summary.settlement.sellerProceeds).toMatchObject({
      status: "known",
      value: "1170000000000000000"
    });
    expect(summary.settlement.protocolFees).toMatchObject({
      status: "known",
      value: "10000000000000000"
    });
    expect(summary.settlement.redistributionAvailable).toMatchObject({
      status: "known",
      value: "15000000000000000"
    });
    expect(summary.settlement.feeRecipient.value).toBe(testAddresses.feeRecipient);
    expect(summary.settlement.refundsAvailable.value).toBe("1000000000000000000");
    expect(summary.settlement.rewardsAvailable.value).toBe("15000000000000000");
  });

  it("returns unavailable fields without crashing when detailed economics are absent", () => {
    const summary = buildAuctionEconomicSummary({
      ...auctionDetailFixture.auction,
      economics: undefined
    });

    expect(summary.warnings.join(" ")).toMatch(/Detailed economic reads are unavailable/);
    expect(summary.unavailableFields).toContain("settlement");
    expect(summary.settlement.sellerCredit.status).toBe("unavailable");
    expect(summary.settlement.protocolFeeCredit.status).toBe("unavailable");
    expect(() => JSON.stringify(summary)).not.toThrow();
  });
});
