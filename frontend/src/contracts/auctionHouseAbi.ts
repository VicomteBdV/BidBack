export const auctionHouseAbi = [
  {
    type: "function",
    name: "nextAuctionId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "getAuction",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [
      {
        name: "auction",
        type: "tuple",
        components: [
          { name: "seller", type: "address" },
          { name: "nft", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "startPrice", type: "uint256" },
          { name: "startTime", type: "uint64" },
          { name: "initialEndTime", type: "uint64" },
          { name: "endTime", type: "uint64" },
          { name: "extensionsUsed", type: "uint8" },
          { name: "state", type: "uint8" },
          { name: "highestBidder", type: "address" },
          { name: "highestBid", type: "uint256" },
          { name: "participantCount", type: "uint256" },
          { name: "bidCount", type: "uint256" },
          { name: "nftClaimed", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getParticipants",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }]
  },
  {
    type: "function",
    name: "getBidCount",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "getBid",
    stateMutability: "view",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "index", type: "uint256" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "bidder", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "timestamp", type: "uint64" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "minimumNextBid",
    stateMutability: "view",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "placeBid",
    stateMutability: "payable",
    inputs: [
      { name: "auctionId", type: "uint256" },
      { name: "newCap", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "finalizeAuction",
    stateMutability: "nonpayable",
    inputs: [{ name: "auctionId", type: "uint256" }],
    outputs: []
  }
] as const;