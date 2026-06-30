# Architecture Decisions

This document captures major product and technical architecture decisions that remain open for BidBack before public testnet and production readiness.

It does not freeze final choices.

It is a working register for decisions that need explicit review, prototyping, testing, governance input, or security analysis before BidBack moves beyond the local MVP.

---

## Purpose of This Document

BidBack already has a robust local MVP engine, but several structural decisions remain intentionally unresolved.

This document is meant to:

* identify open decision areas;
* clarify the current MVP position;
* list credible options without prematurely selecting one;
* describe risks and impacted components;
* keep future Codex work aligned with BidBack's economic and security principles.

This document must not be read as a production specification, deployment checklist, or security approval.

---

## Current MVP Baseline

The current MVP is centered on a local Anvil workflow and a modular smart contract engine.

Current baseline:

* local Anvil deployment on chain ID `31337`;
* modular Foundry contracts;
* Next.js frontend under `frontend/`;
* read-only auction views through Next.js server routes;
* guarded local-dev actions under `/api/dev/*` for Codespaces testing;
* wallet-signed create, bid, claim, and withdrawal panels;
* on-chain NFT custody through `NFTVault`;
* on-chain ETH accounting through `EscrowVault`;
* deterministic redistribution through `AuctionHouse` and `DistributionVault`;
* pull-based NFT, refund, reward, seller proceeds, and protocol fee claims;
* on-chain checks for deployment bytecode, critical reads, and deployment-level module linkage;
* CI covering Foundry tests, frontend tests, typecheck, and build.

BidBack remains explicitly outside these categories:

* no guaranteed yield;
* no lending;
* no leverage;
* no derivatives;
* no gambling positioning;
* no redistribution funded by losing bidders' refundable caps.

The current MVP proves the core mechanics, but it is not a final production UX, deployment model, governance model, or scalability model.

---

## No-Signature Bidding UX

The current wallet-signed bid flow asks the user to sign each bid transaction.

That is acceptable for MVP verification, but it is probably not the desired end-user bidding experience for rapid auctions.

A production auction UX may need to distinguish between:

* registration or auction entry, where a user grants limited bidding authority;
* bidding actions, which should feel fast and low-friction;
* final sensitive actions such as NFT claims, refunds, reward claims, seller withdrawals, and protocol fee withdrawals.

Claims and withdrawals should remain user-controlled and pull-based.

Any no-signature bidding model must not weaken custody, refund safety, or the rule that losing bidders recover their refundable caps.

### Session Keys

Advantages:

* improves rapid bidding UX;
* can be limited by auction ID, max cap, expiry time, and allowed function;
* keeps final claims and withdrawals wallet-signed by the user.

Risks:

* key management UX can be confusing;
* compromised session keys could place bids up to their configured limit;
* revocation and expiry must be clear.

Impact on current engine:

* likely requires authorization checks beyond direct `msg.sender` bidding;
* must preserve cap step-up accounting and refund ownership.

### Account Abstraction

Advantages:

* strong fit for scoped bidding policies;
* can improve wallet UX;
* supports user operations, session policies, and paymasters.

Risks:

* adds infrastructure and audit surface;
* wallet and chain support varies;
* paymaster design can introduce abuse or economic risks.

Impact on current engine:

* contracts may remain mostly compatible if calls still resolve to the user's account;
* frontend wallet and transaction flow would change significantly.

### Auction-Scoped Delegation

Advantages:

* aligned with BidBack auction boundaries;
* limits delegation to one auction;
* easier to reason about than global delegation.

Risks:

* requires careful revocation and expiry design;
* must not allow delegated claims or withdrawals;
* may add storage and gas cost.

Impact on current engine:

* likely requires a new authorization module or contract extension;
* `AuctionHouse.placeBid` would need to preserve the bidder identity used for caps, refunds, and scoring.

### Off-Chain Signed Intents and Relayer

Advantages:

* bidding can feel fast;
* users do not submit every transaction directly;
* intent validity can include auction ID, cap, deadline, nonce, and allowed executor.

Risks:

* relayer censorship or downtime;
* replay or ordering risks;
* MEV and latency risks remain;
* backend infrastructure becomes part of the UX trust model.

Impact on current engine:

* likely requires signature verification and nonce tracking;
* settlement can remain on-chain;
* frontend and backend/indexer responsibilities increase.

### Backend or Indexer With On-Chain Settlement

Advantages:

* better scalability for many rapid bids;
* lower on-chain transaction count;
* flexible UX experimentation.

Risks:

* weaker real-time on-chain transparency;
* requires proof, audit, or dispute design;
* must not make refunds or rewards depend on opaque computation.

Impact on current engine:

* larger architectural change;
* may require Merkle roots, proofs, or settlement batches;
* the MVP's fully on-chain scoring remains the safer early testnet baseline.

### Hybrid Model

Advantages:

* keeps sensitive actions user-controlled;
* allows progressive UX improvement;
* can start from the current wallet-signed model.

Risks:

* multiple execution paths increase test burden;
* user messaging must stay clear;
* accounting must remain identical across paths.

Impact on current engine:

* likely the most incremental path;
* still requires explicit authorization and monitoring design before production.

---

## Multi-Wallet Support

The target application should not be MetaMask-only.

Wallet support should include at least:

* MetaMask;
* Rabby;
* Coinbase Wallet;
* WalletConnect-compatible mobile and desktop wallets.

Key impacts:

* wagmi connector configuration should expand beyond a single injected-wallet assumption;
* viem client configuration should continue to support deployment JSON files by chain ID;
* UX must explain wrong-network, unsupported-wallet, and unreachable-RPC states clearly;
* mobile wallet and WalletConnect flows may require hosted frontend testing rather than Codespaces only;
* wallet capability differences matter for session keys, account abstraction, and chain support.

Open questions:

* Which wallets are required for first public testnet?
* Is WalletConnect required before public testnet or only before broader beta?
* How should the UI present wallet-specific RPC limitations?
* Which wallets support the selected chain and any future account abstraction model?

---

## Blockchain Scalability Choice

BidBack should not freeze its final blockchain choice yet.

The auction mechanism needs low enough latency and cost to support many simultaneous auctions and active bidding, while preserving security, wallet compatibility, and transparent settlement.

### Ethereum L1

Advantages:

* strongest settlement credibility;
* high composability;
* broad wallet and explorer support.

Risks:

* high transaction costs;
* weak fit for rapid bid updates;
* poor UX for frequent bids.

Likely fit:

* settlement anchor or high-value auctions, not the primary rapid-bidding MVP environment.

### L2 EVM

Advantages:

* EVM compatibility;
* lower cost than L1;
* strong wallet and tooling support;
* easier migration from the current Solidity MVP.

Risks:

* sequencer assumptions;
* variable finality and withdrawal models;
* chain-specific RPC reliability and congestion.

Likely fit:

* strong candidate for public testnet and early production experiments.

### MegaETH

Advantages:

* EVM-oriented high-throughput direction;
* potentially better latency for fast auction interactions;
* current Solidity architecture could remain relevant if the environment is compatible.

Risks:

* ecosystem maturity and availability must be verified at testnet planning time;
* wallet, explorer, RPC, and infrastructure readiness may lag established L2s.

Likely fit:

* candidate to evaluate for rapid-bidding UX once public tooling is ready.

### Solana

Advantages:

* high throughput;
* low transaction cost;
* strong fit for rapid interactions if the product moves away from EVM assumptions.

Risks:

* requires a non-EVM rewrite;
* different wallet, account, and program model;
* current Solidity code and Foundry tests do not carry over directly.

Likely fit:

* possible long-term architecture exploration, not a direct continuation of the current MVP.

### Hybrid Off-Chain Plus On-Chain Settlement

Advantages:

* can support rapid bidding and large auction volume;
* settlement remains verifiable on-chain;
* may reduce gas cost per bid.

Risks:

* requires proofs, replay protection, and dispute or audit model;
* backend/indexer becomes more important;
* risk of opaque computation if not carefully designed.

Likely fit:

* future scalability path after the fully on-chain MVP is tested publicly.

### Future Appchain or Dedicated Rollup

Advantages:

* can optimize latency, fees, and auction-specific execution;
* allows custom infrastructure and policy choices.

Risks:

* major operational burden;
* governance and security assumptions become larger;
* wallet and bridge UX may be harder.

Likely fit:

* later-stage option, not a near-term MVP requirement.

Evaluation criteria:

* latency;
* transaction cost;
* security and finality assumptions;
* wallet compatibility;
* developer experience;
* EVM compatibility;
* composability with NFT ecosystems;
* scalability for many simultaneous auctions;
* support for rapid bids;
* explorer and verification support;
* RPC reliability for both server-side reads and user wallets.

---

## Governance and Rule Mutability

BidBack needs different mutability rules for MVP, testnet, and production.

During MVP and testnet, redistribution rules and safety parameters must remain easy to iterate.

In production, users must be protected against arbitrary or retroactive changes.

The model should distinguish between:

* configurable parameters for future auctions;
* immutable or snapshotted parameters for already-created auctions;
* emergency-only controls;
* multisig ownership;
* timelock delays;
* public governance and change logs.

Current MVP position:

* `ParamsController` stores bounded economic and operational parameters;
* `AuctionHouse` snapshots parameters for each auction at creation;
* vaults use one-time `setAuctionHouse` locks;
* local ownership is not production governance;
* production ownership should move to multisig and timelock governance.

Open governance questions:

* Which parameters can change without a timelock during testnet?
* Which parameters require a timelock before public beta?
* Which emergency controls can pause creation and bidding without blocking claims?
* How should parameter changes be announced and surfaced in the frontend?
* What is the minimum governance setup for a public testnet?

Rules must never be mutable in a way that makes an active auction economically unpredictable or prevents users from recovering funds.

---

## Auction Parameter Snapshots

Each auction should have an explicit snapshot of the economic and operational parameters that apply to it.

This prevents a global parameter update from retroactively changing an auction that is already open.

Parameters that should be snapshotted include:

* protocol fee basis points;
* redistribution fraction;
* minimum participants;
* SCR weights;
* per-user reward cap;
* minimum premium threshold;
* minimum auction duration;
* bid increment;
* anti-sniping window;
* anti-sniping extension;
* max participants;
* scoring caps and exposure thresholds;
* module addresses when relevant.

Current MVP position:

* the Solidity engine already snapshots `ParamsController.Params` per auction;
* the engine also snapshots the active modules per auction;
* this is a good baseline for economic consistency.

Future work:

* expose snapshot details more clearly in the frontend;
* include snapshot checks in post-deployment or auction-level verification;
* consider emitting richer events for indexers;
* document which global parameter changes affect only future auctions;
* make auction-specific rules easy for users to inspect before bidding.

---

## Production Trust Model

Production users should be able to verify how custody, accounting, and rules work for a specific auction.

The product should make these elements inspectable:

* NFT custody;
* bidder caps;
* highest bid and final price;
* refundable balances;
* reward entitlements;
* reward claimed state;
* seller proceeds;
* protocol fees;
* distribution reserve;
* total assigned rewards;
* total claimed rewards;
* rules and parameters used for a given auction;
* module addresses used for a given auction.

Areas that require additional production work:

* explorer verification;
* external smart contract audit;
* monitoring for failed transactions and abnormal settlement states;
* event indexer for auction history and scalable reads;
* backend persistence for UI convenience where appropriate;
* incident response process;
* documented admin powers;
* governance handoff documentation;
* public status and deployment notes.

The frontend should never ask users to trust an opaque reward calculation when the claim path depends on deterministic on-chain state.

---

## Open Decisions Register

| Decision area                     | Current MVP position                                         | Options under consideration                                                                | Key risks                                                     | Impacted components                                     | Decision timing                                    |
| --------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Bidding authorization model       | Wallet-signed bids plus local-dev server actions for testing | Session keys, account abstraction, auction-scoped delegation, signed intents, hybrid model | Unauthorized bids, poor UX, relayer trust, replay risk        | `AuctionHouse`, wallet layer, frontend, future backend  | Before production UX; prototype before public beta |
| Multi-wallet support              | Wallet-signed panels exist; MetaMask-oriented testing so far | Injected wallets, Rabby, Coinbase Wallet, WalletConnect                                    | Wallet incompatibility, RPC reachability, mobile UX gaps      | wagmi config, viem clients, UI, docs                    | Before broad public testnet usage                  |
| Chain selection                   | Local Anvil `31337`; no public testnet yet                   | Ethereum L1, L2 EVM, MegaETH, Solana, hybrid settlement, appchain                          | Fees, latency, security assumptions, ecosystem maturity       | contracts, deployment scripts, frontend config, docs    | Before first public testnet deployment             |
| Redistribution computation model  | Deterministic on-chain SCR in MVP                            | Keep on-chain bounded model, Merkle proofs later, batched settlement                       | Gas growth, opaque off-chain computation, solvency errors     | `AuctionHouse`, `DistributionVault`, tests, indexer     | Reassess after testnet auction volume data         |
| Governance controls               | Owner-controlled MVP params; one-time vault locks            | Multisig, timelock, emergency pause policy, public governance process                      | Arbitrary rule changes, EOA compromise, blocked claims        | `ParamsController`, ownership, docs, deployment scripts | Before public testnet with external users          |
| Auction parameter snapshots       | Params and modules snapshotted internally per auction        | Surface snapshots in UI/events, verify auction snapshots, richer indexer schema            | User cannot inspect rules, stale module confusion             | `AuctionHouse`, frontend, indexer, verification scripts | Before production; improve during testnet          |
| Indexing and persistence          | Bounded read-only routes; no indexer                         | Event indexer, backend cache, hosted read API                                              | Missing history, scalability limits, stale data               | frontend, backend, deployment, monitoring               | Before many simultaneous auctions                  |
| Production trust and verification | JSON validation and partial on-chain verification exist      | Explorer verification, external audit, monitoring, runbooks                                | Wrong deployment, unverified bytecode, incident response gaps | docs, scripts, deployment process, governance           | Before public testnet and production               |
| Local-dev tooling boundary        | `/api/dev/*` guarded and local only                          | Keep local-only, remove from production build, feature flags by environment                | Accidental production exposure, server-held key misuse        | Next.js routes, env config, docs                        | Before hosted frontend deployment                  |
| Final UI/UX model                 | Functional MVP UI, not final design                          | Marketplace UX, bidder dashboard, auction discovery, trust panels                          | Confusing economics, wrong financial framing                  | frontend, copy, docs, user education                    | After core public testnet mechanics are validated  |

---

## Impact on Current Engine

The current engine remains a strong base.

It already provides:

* modular contract boundaries;
* on-chain custody;
* bounded participant counts;
* step-up-only caps;
* deterministic anti-sniping;
* deterministic redistribution;
* pull-based claims;
* parameter snapshotting per auction;
* module snapshotting per auction;
* local and wallet-signed testing flows.

Areas likely to evolve before production:

* bidding authorization model for lower-friction bids;
* user-visible auction parameter snapshotting;
* governance controls and ownership handoff;
* indexer and backend persistence for scalable reads;
* public testnet deployment and verification workflow;
* multi-wallet and network configuration;
* production monitoring and incident response;
* final product UX and trust surfaces.

These evolutions should preserve the current economic invariants:

* no guaranteed yield;
* no redistribution from losing bidders' refundable caps;
* no claim path that can make the system insolvent;
* no pause behavior that blocks refunds, rewards, NFT claims, seller proceeds, or protocol fee withdrawals after finalization.

---

## Non-Goals for This Document

This document must not:

* definitively choose the final blockchain;
* implement account abstraction;
* modify smart contracts;
* define the final UI;
* replace the security audit;
* replace existing testnet or deployment documentation;
* introduce a new documentation framework;
* present any user reward as guaranteed yield.
