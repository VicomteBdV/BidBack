import { describe, expect, it, vi } from "vitest";
import { switchToWalletNetwork, walletNetworkErrorMessage, type WalletNetworkConfig } from "./walletNetwork";

const config: WalletNetworkConfig = {
  chainId: 84532, chainName: "Base Sepolia", rpcUrls: ["https://base-sepolia.example.invalid"],
  blockExplorerUrls: ["https://explorer.example.invalid"],
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
};

describe("wallet network switching", () => {
  it("switches first and adds unknown chains with the configured metadata", async () => {
    const request = vi.fn().mockRejectedValueOnce({ code: 4902 }).mockResolvedValueOnce(null);
    await switchToWalletNetwork({ request }, config);
    expect(request.mock.calls).toEqual([
      [{ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] }],
      [{ method: "wallet_addEthereumChain", params: [{ ...config, chainId: "0x14a34" }] }]
    ]);
  });

  it("does not add a chain after a successful switch", async () => {
    const request = vi.fn().mockResolvedValue(null);
    await switchToWalletNetwork({ request }, config);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    [4001, "Network switch was rejected by the wallet."],
    [-32002, "A wallet request is already pending. Open your wallet to continue."],
    [123, "Unable to switch wallet network. Open your connected wallet and try again."]
  ])("bounds switch and add errors for provider code %s", async (code, message) => {
    for (const adding of [false, true]) {
      const request = vi.fn();
      if (adding) request.mockRejectedValueOnce({ code: "4902" });
      request.mockRejectedValue({ cause: { code }, message: "https://private.invalid/SECRET" });
      await expect(switchToWalletNetwork({ request }, config)).rejects.toThrow(message as string);
      expect(request).toHaveBeenCalledTimes(adding ? 2 : 1);
    }
  });

  it("bounds unknown errors and cyclic causes", () => {
    const error = { message: "SECRET", cause: {} };
    error.cause = error;
    expect(walletNetworkErrorMessage(error)).toBe("Unable to switch wallet network. Open your connected wallet and try again.");
  });
});
