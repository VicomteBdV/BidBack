import { describe, expect, it } from "vitest";
import {
  getBidActionState,
  getClaimNftActionState,
  getClaimRefundActionState,
  getClaimRewardActionState,
  getFinalizeActionState,
  getWithdrawProtocolFeesActionState,
  getWithdrawSellerActionState,
  sameAddress
} from "@/lib/auctionActionState";

const seller = "0x0000000000000000000000000000000000001001";
const winner = "0x0000000000000000000000000000000000001002";
const loser = "0x0000000000000000000000000000000000001003";
const feeRecipient = "0x0000000000000000000000000000000000001004";

function walletContext(overrides: Record<string, unknown> = {}) {
  return {
    isConnected: true,
    wrongNetwork: false,
    targetChainLabel: "Base Sepolia",
    deploymentLoaded: true,
    deploymentError: null,
    auctionIdValid: true,
    loading: false,
    pending: false,
    ...overrides
  };
}

describe("auctionActionState", () => {
  it("detects disconnected and wrong-network wallet states before wallet actions", () => {
    expect(
      getBidActionState({
        ...walletContext({ isConnected: false }),
        bidCapEth: "1",
        minimumNextBid: 1n,
        currentCap: 0n,
        auctionState: 0,
        endTime: "2000",
        nowSeconds: 1000
      }).disabledReason
    ).toBe("Wallet not connected.");

    expect(
      getFinalizeActionState({
        ...walletContext({ wrongNetwork: true }),
        finalized: false,
        endTime: "1000",
        nowSeconds: 2000
      }).disabledReason
    ).toBe("Wallet connected, but not on the target chain (Base Sepolia).");
  });

  it("validates bid cap input and computes only the step-up value to send", () => {
    expect(
      getBidActionState({
        ...walletContext(),
        bidCapEth: "",
        minimumNextBid: 1_000_000_000_000_000_000n,
        currentCap: 0n,
        auctionState: 0,
        endTime: "2000",
        nowSeconds: 1000
      }).disabledReason
    ).toBe("Bid cap is required.");

    expect(
      getBidActionState({
        ...walletContext(),
        bidCapEth: "0.9",
        minimumNextBid: 1_000_000_000_000_000_000n,
        currentCap: 0n,
        auctionState: 0,
        endTime: "2000",
        nowSeconds: 1000
      }).disabledReason
    ).toBe("Bid cap must be at least minimumNextBid.");

    expect(
      getBidActionState({
        ...walletContext(),
        bidCapEth: "1",
        minimumNextBid: 1_000_000_000_000_000_000n,
        currentCap: 1_000_000_000_000_000_000n,
        auctionState: 0,
        endTime: "2000",
        nowSeconds: 1000
      }).disabledReason
    ).toBe("Bid cap must be greater than your current cap.");

    const validStepUp = getBidActionState({
      ...walletContext(),
      bidCapEth: "1.25",
      minimumNextBid: 1_100_000_000_000_000_000n,
      currentCap: 1_000_000_000_000_000_000n,
      auctionState: 0,
      endTime: "2000",
      nowSeconds: 1000
    });

    expect(validStepUp.disabledReason).toBeNull();
    expect(validStepUp.parsedBidCap).toBe(1_250_000_000_000_000_000n);
    expect(validStepUp.valueToSend).toBe(250_000_000_000_000_000n);
  });

  it("blocks wallet bids once the auction has reached its end time", () => {
    expect(
      getBidActionState({
        ...walletContext(),
        bidCapEth: "1.25",
        minimumNextBid: 1_000_000_000_000_000_000n,
        currentCap: 0n,
        auctionState: 0,
        endTime: "1000",
        nowSeconds: 1000
      }).disabledReason
    ).toBe("Auction has reached its end time. Refresh auction state or finalize it.");
  });

  it("allows wallet finalization only after expiration and before finalized state", () => {
    expect(
      getFinalizeActionState({
        ...walletContext(),
        finalized: false,
        endTime: "2000",
        nowSeconds: 1000
      }).disabledReason
    ).toBe("Auction is not expired yet.");

    expect(
      getFinalizeActionState({
        ...walletContext(),
        finalized: true,
        endTime: "1000",
        nowSeconds: 2000
      }).disabledReason
    ).toBe("Auction is already finalized.");

    expect(
      getFinalizeActionState({
        ...walletContext(),
        finalized: false,
        endTime: "1000",
        nowSeconds: 2000
      }).disabledReason
    ).toBeNull();
  });

  it("allows NFT claim only for the expected claimant after finalization", () => {
    expect(sameAddress(winner.toUpperCase(), winner)).toBe(true);

    expect(
      getClaimNftActionState({
        ...walletContext(),
        account: loser,
        claimant: winner,
        claimantRoleLabel: "winner",
        nftClaimed: false,
        finalized: true
      }).disabledReason
    ).toBe("Connected wallet is not the NFT claimant. Expected winner.");

    expect(
      getClaimNftActionState({
        ...walletContext(),
        account: winner,
        claimant: winner,
        claimantRoleLabel: "winner",
        nftClaimed: false,
        finalized: true
      }).disabledReason
    ).toBeNull();
  });

  it("allows refund and reward claims only when claimable data is available", () => {
    expect(
      getClaimRefundActionState({
        ...walletContext(),
        refundableAmount: 0n,
        refundClaimed: false,
        finalized: true
      }).disabledReason
    ).toBe("No refund available.");

    expect(
      getClaimRefundActionState({
        ...walletContext(),
        refundableAmount: 1n,
        refundClaimed: false,
        finalized: true
      }).disabledReason
    ).toBeNull();

    expect(
      getClaimRewardActionState({
        ...walletContext(),
        rewardEntitlement: 0n,
        rewardClaimed: false,
        finalized: true
      }).disabledReason
    ).toBe("No reward available.");

    expect(
      getClaimRewardActionState({
        ...walletContext(),
        rewardEntitlement: 1n,
        rewardClaimed: false,
        finalized: true
      }).disabledReason
    ).toBeNull();
  });

  it("allows proceeds and fee withdrawals only for the expected wallets", () => {
    expect(
      getWithdrawSellerActionState({
        ...walletContext(),
        account: winner,
        seller,
        sellerCredit: 1n,
        finalized: true
      }).disabledReason
    ).toBe("Connect the seller wallet.");

    expect(
      getWithdrawSellerActionState({
        ...walletContext(),
        account: seller,
        seller,
        sellerCredit: 1n,
        finalized: true
      }).disabledReason
    ).toBeNull();

    expect(
      getWithdrawProtocolFeesActionState({
        ...walletContext(),
        account: seller,
        feeRecipient,
        protocolFeeCredit: 1n,
        finalized: true
      }).disabledReason
    ).toBe("Connect the auction fee recipient wallet.");

    expect(
      getWithdrawProtocolFeesActionState({
        ...walletContext(),
        account: feeRecipient,
        feeRecipient,
        protocolFeeCredit: 1n,
        finalized: true
      }).disabledReason
    ).toBeNull();
  });
});
