import { describe, expect, it } from "vitest";
import { isLocalDevEnvironment } from "@/lib/localDevEnvironment";

const local = {
  NEXT_PUBLIC_CHAIN_ID: "31337",
  BIDBACK_CHAIN_ID: "31337",
  ENABLE_LOCAL_DEV_ACTIONS: "true"
};

describe("local development configuration", () => {
  it("accepts explicit, matching local targets and opt-in", () => {
    expect(isLocalDevEnvironment(local)).toBe(true);
  });

  it.each(["NEXT_PUBLIC_CHAIN_ID", "BIDBACK_CHAIN_ID"] as const)("fails closed for an invalid %s", (key) => {
    for (const value of [undefined, "", " ", "84532", "1", "31338", "invalid", "31337junk", "0x7a69", "31337.0", " 31337 "]) {
      expect(isLocalDevEnvironment({ ...local, [key]: value })).toBe(false);
    }
  });

  it.each([undefined, "", "false", "TRUE", "1", "true "])("requires exact opt-in: %s", (value) => {
    expect(isLocalDevEnvironment({ ...local, ENABLE_LOCAL_DEV_ACTIONS: value })).toBe(false);
  });

  it("does not infer local authority from absent configuration", () => {
    expect(isLocalDevEnvironment({})).toBe(false);
  });
});
