export const escrowVaultAbi = [
  {
    type: "function",
    name: "capOf",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "bidder", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;