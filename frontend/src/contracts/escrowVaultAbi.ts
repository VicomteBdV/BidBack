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
  },
  {
    type: "function",
    name: "refundableAmount",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "bidder", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "refundClaimed",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "bidder", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "settlements",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [
      { name: "finalized", type: "bool" },
      { name: "winner", type: "address" },
      { name: "distributionVault", type: "address" },
      { name: "finalPrice", type: "uint256" },
      { name: "sellerProceeds", type: "uint256" },
      { name: "feeAmount", type: "uint256" },
      { name: "distributionReserve", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "sellerCredits",
    stateMutability: "view",
    inputs: [{ name: "seller", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "protocolFeeCredits",
    stateMutability: "view",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "claimRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "withdrawSellerProceeds",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  },
  {
    type: "function",
    name: "withdrawProtocolFees",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  }
] as const;