export const distributionVaultAbi = [
  {
    type: "function",
    name: "distributions",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [
      { name: "opened", type: "bool" },
      { name: "totalAssigned", type: "uint256" },
      { name: "totalClaimed", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "entitlementOf",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "recipient", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "recipient", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: []
  }
] as const;