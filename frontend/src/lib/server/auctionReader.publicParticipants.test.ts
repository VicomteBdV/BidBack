import { describe, expect, it } from "vitest";
import { publicBidderAccountsFromParticipants } from "@/lib/server/auctionReader";

const bidderA = "0x00000000000000000000000000000000000000a1" as const;
const bidderB = "0x00000000000000000000000000000000000000b2" as const;

describe("public auction participants", () => {
  it("maps the on-chain participant order to the two bounded public bidder views", () => {
    expect(publicBidderAccountsFromParticipants([bidderA, bidderB])).toEqual({
      primary: { role: "primary", address: bidderA, configured: true },
      secondary: { role: "secondary", address: bidderB, configured: true }
    });
  });

  it("does not invent a participant when on-chain data is incomplete", () => {
    expect(publicBidderAccountsFromParticipants([bidderA])).toEqual({
      primary: { role: "primary", address: bidderA, configured: true },
      secondary: { role: "secondary", address: null, configured: false }
    });
  });
});
