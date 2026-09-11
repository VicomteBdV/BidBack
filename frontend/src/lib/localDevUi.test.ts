import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalDevUiEnabled } from "@/lib/localDevUi";

afterEach(() => vi.unstubAllEnvs());

describe("local dev UI boundary", () => {
  it("enables local controls only for an explicit coherent Anvil configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "31337");
    vi.stubEnv("BIDBACK_CHAIN_ID", "31337");
    vi.stubEnv("ENABLE_LOCAL_DEV_ACTIONS", "true");
    expect(isLocalDevUiEnabled()).toBe(true);

    for (const flag of ["false", undefined]) {
      vi.stubEnv("ENABLE_LOCAL_DEV_ACTIONS", flag);
      expect(isLocalDevUiEnabled()).toBe(false);
    }
  });

  it.each([
    ["84532", "84532"], ["84532", "31337"], ["31337", "84532"],
    ["84532", undefined], [undefined, "84532"],
    ["invalid", "31337"], ["31337", "invalid"], [undefined, undefined]
  ])("hides local controls for public/server targets %s / %s", (publicId, serverId) => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", publicId);
    vi.stubEnv("BIDBACK_CHAIN_ID", serverId);
    vi.stubEnv("ENABLE_LOCAL_DEV_ACTIONS", "true");
    expect(isLocalDevUiEnabled()).toBe(false);
  });
});
