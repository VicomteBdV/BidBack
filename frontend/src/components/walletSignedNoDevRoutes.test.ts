import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const walletSignedComponents = [
  "WalletBidPanel.tsx",
  "WalletClaimPanel.tsx",
  "WalletCreateAuctionForm.tsx"
];

describe("wallet-signed component separation", () => {
  it.each(walletSignedComponents)("%s does not fetch /api/dev routes", (fileName) => {
    const source = readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");

    expect(source).not.toMatch(/fetch\s*\(\s*["'`]\/api\/dev(?:\/|\b)/);
  });
});