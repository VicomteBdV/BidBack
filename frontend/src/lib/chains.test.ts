import { describe, expect, it, vi } from "vitest";
import { resolveWalletRpcUrl } from "./chains";

describe("browser wallet RPC configuration", () => {
  it("retains Anvil convenience defaults and explicit overrides", () => {
    expect(resolveWalletRpcUrl(31337)).toBe("http://127.0.0.1:8545");
    expect(resolveWalletRpcUrl(31337, " ", "http://localhost:9545")).toBe("http://localhost:9545");
    expect(resolveWalletRpcUrl(31337, "https://rpc.example.invalid")).toBe("https://rpc.example.invalid");
  });

  it.each([84532, 1, 99999])("requires an explicit browser RPC for chain %s", (chainId) => {
    for (const missing of [undefined, "", "  "]) {
      expect(() => resolveWalletRpcUrl(chainId, missing, "http://127.0.0.1:8545")).toThrow(
        "NEXT_PUBLIC_WALLET_RPC_URL is required for a non-local target chain."
      );
    }
  });

  it.each(["garbage", "/rpc", "wss://rpc.example.invalid", "https://", "https://user:secret@rpc.example.invalid"])(
    "rejects malformed or unsuitable URLs without echoing them: %s", (value) => {
      expect(() => resolveWalletRpcUrl(84532, value)).toThrow(
        "NEXT_PUBLIC_WALLET_RPC_URL must be a valid HTTP(S) URL without embedded credentials."
      );
    }
  );

  it("accepts an explicit testnet-shaped endpoint without network access", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(resolveWalletRpcUrl(84532, " https://base-sepolia.example.invalid/rpc ")).toBe(
      "https://base-sepolia.example.invalid/rpc"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
