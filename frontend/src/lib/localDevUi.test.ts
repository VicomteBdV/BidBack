import { describe, expect, it } from "vitest";
import { isLocalDevUiEnabled } from "@/lib/localDevUi";

describe("local dev UI boundary", () => {
  it("enables local controls only for Anvil with the explicit flag", () => {
    expect(isLocalDevUiEnabled(31337, "true")).toBe(true);
    expect(isLocalDevUiEnabled(31337, "false")).toBe(false);
    expect(isLocalDevUiEnabled(31337, undefined)).toBe(false);
  });

  it("never enables local controls on Base Sepolia", () => {
    expect(isLocalDevUiEnabled(84532, "true")).toBe(false);
    expect(isLocalDevUiEnabled(84532, "false")).toBe(false);
    expect(isLocalDevUiEnabled(84532, undefined)).toBe(false);
  });
});
