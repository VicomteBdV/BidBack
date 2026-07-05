import { describe, expect, it } from "vitest";
import {
  buildExplorerTxUrl,
  failedTransactionState,
  isUserRejectedTransaction,
  shortenTxHash,
  walletTransactionErrorMessage
} from "@/lib/walletTransaction";

const txHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

describe("walletTransaction", () => {
  it("builds explorer transaction URLs only when an explorer is configured", () => {
    expect(buildExplorerTxUrl(txHash, "https://sepolia.basescan.org/")).toBe(
      `https://sepolia.basescan.org/tx/${txHash}`
    );

    expect(buildExplorerTxUrl(txHash, "")).toBeNull();
    expect(buildExplorerTxUrl(null, "https://sepolia.basescan.org")).toBeNull();
  });

  it("shortens transaction hashes for compact display", () => {
    expect(shortenTxHash(txHash)).toBe("0x11111111...11111111");
  });

  it("classifies user rejected transactions", () => {
    const rejected = { code: 4001, message: "User rejected the request." };

    expect(isUserRejectedTransaction(rejected)).toBe(true);
    expect(walletTransactionErrorMessage(rejected)).toBe("Transaction rejected in wallet.");
    expect(failedTransactionState(rejected).phase).toBe("rejected");
  });

  it("keeps common wallet errors readable", () => {
    expect(walletTransactionErrorMessage(new Error("insufficient funds for gas"))).toBe(
      "Insufficient funds for transaction value or gas."
    );

    expect(failedTransactionState(new Error("execution reverted"), "Fallback").phase).toBe("failed");
  });
});
