import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const walletSignedComponents = [
  "WalletBidPanel.tsx",
  "WalletFinalizePanel.tsx",
  "WalletClaimPanel.tsx",
  "WalletCreateAuctionForm.tsx"
];

describe("wallet-signed component separation", () => {
  it.each(walletSignedComponents)("%s does not depend on local-only routes or their guard", (fileName) => {
    const componentPath = path.resolve(process.cwd(), "src", "components", fileName);
    const source = readFileSync(componentPath, "utf8");

    expect(source).not.toMatch(/fetch\s*\(\s*["'`]\/api\/(?:dev(?:\/|\b)|local-create-context\b)/);
    expect(source).not.toMatch(/(?:isLocalDevUiEnabled|assertLocalDevActionsEnabled|localDevEnvironment)/);
    expect(source).not.toMatch(/window\s*(?:\.|as\b)|getInjectedEthereum/);
    expect(source).toContain("await createConnectedWalletClients(config, connector,");
  });
});
