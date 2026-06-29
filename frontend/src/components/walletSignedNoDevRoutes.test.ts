import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const walletSignedComponents = [
  "WalletBidPanel.tsx",
  "WalletClaimPanel.tsx",
  "WalletCreateAuctionForm.tsx"
];

describe("wallet-signed component separation", () => {
  it.each(walletSignedComponents)("%s does not fetch /api/dev routes", (fileName) => {
    const componentPath = path.resolve(process.cwd(), "src", "components", fileName);
    const source = readFileSync(componentPath, "utf8");

    expect(source).not.toMatch(/fetch\s*\(\s*["'`]\/api\/dev(?:\/|\b)/);
  });
});