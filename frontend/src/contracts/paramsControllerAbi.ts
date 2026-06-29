export const paramsControllerAbi = [
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "params",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "bidbackFeeBps", type: "uint16" },
          { name: "redistributionBps", type: "uint16" },
          { name: "minParticipants", type: "uint16" },
          { name: "alphaBps", type: "uint16" },
          { name: "betaBps", type: "uint16" },
          { name: "gammaBps", type: "uint16" },
          { name: "minBidIncrementBps", type: "uint16" },
          { name: "perUserRewardCapBps", type: "uint16" },
          { name: "maxParticipants", type: "uint16" },
          { name: "maxInteractionCount", type: "uint16" },
          { name: "minAuctionDuration", type: "uint64" },
          { name: "antiSnipeWindow", type: "uint64" },
          { name: "antiSnipeExtension", type: "uint64" },
          { name: "maxAntiSnipeExtensions", type: "uint8" },
          { name: "minExposure", type: "uint64" },
          { name: "minPremiumNet", type: "uint256" },
          { name: "efCap", type: "uint256" },
          { name: "etCap", type: "uint256" },
          { name: "iiCap", type: "uint256" }
        ]
      }
    ]
  }
] as const;