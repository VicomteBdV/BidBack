import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public target local-dev separation", () => {
  it("gates both local-dev surfaces through the server-provided boundary", () => {
    const createPage = readFileSync(path.resolve(process.cwd(), "src/app/create/page.tsx"), "utf8");
    const auctionPage = readFileSync(
      path.resolve(process.cwd(), "src/app/auctions/[auctionId]/page.tsx"),
      "utf8"
    );
    const auctionDetail = readFileSync(
      path.resolve(process.cwd(), "src/components/AuctionDetail.tsx"),
      "utf8"
    );

    expect(createPage).toContain("isLocalDevUiEnabled()");
    expect(createPage).toMatch(/localDevActionsEnabled\s*\?\s*<CreateAuctionForm/);
    expect(auctionPage).toContain("localDevActionsEnabled={localDevActionsEnabled}");
    expect(auctionDetail).toMatch(/localDevActionsEnabled\s*\?\s*\(/);
  });

  it("keeps wallet-signed surfaces rendered independently", () => {
    const createPage = readFileSync(path.resolve(process.cwd(), "src/app/create/page.tsx"), "utf8");
    const auctionDetail = readFileSync(
      path.resolve(process.cwd(), "src/components/AuctionDetail.tsx"),
      "utf8"
    );

    expect(createPage).toContain("<WalletCreateAuctionForm />");
    expect(auctionDetail).toContain("<WalletBidPanel");
    expect(auctionDetail).toContain("<WalletFinalizePanel");
    expect(auctionDetail).toContain("<WalletClaimPanel");
  });
});
