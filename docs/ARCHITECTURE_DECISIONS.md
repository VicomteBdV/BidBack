# Architecture Decisions

This document captures major product and technical architecture decisions that remain open before controlled beta, public beta, and production readiness.

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
* one complete canonical Base Sepolia cycle validated on 22 August 2026 for auction `#2`, with five distinct public role wallets, a separately deployed valueless test-only NFT, reconciled final economics, and duplicate-action simulations; repeatability and archival transaction metadata remain incomplete;
* modular Foundry contracts;
* Next.js frontend under `frontend/`;
* read-only auction views through Next.js server routes;
* event-based auction list discovery from `AuctionCreated` logs with a bounded newest-first `nextAuctionId` fallback;
* client-side auction browsing controls for search, status filters, wallet-scoped filters when a wallet is connected, sorting, and configurable loaded-list limits;
* read-only wallet activity dashboard using wallet-scoped auction events, a bounded general event window, and a bounded fallback;
* opportunistic NFT metadata previews from ERC-721 `name`, `symbol`, `tokenURI`, HTTP metadata JSON, and simple IPFS gateway conversion;
* read-only auction parameter snapshot display;
* per-auction fee recipient snapshot display;
* read-only auction economic transparency / settlement breakdown display;
* guarded local-dev actions under `/api/dev/*` for Codespaces testing;
* wallet-signed create, bid, claim, and withdrawal panels;
* on-chain NFT custody through `NFTVault`;
* on-chain ETH accounting through `EscrowVault`;
* deterministic redistribution through `AuctionHouse` and `DistributionVault`;
* pull-based NFT, refund, reward, seller proceeds, and protocol fee claims;
* explicit tests proving auction parameter snapshots do not change after global parameter updates;
* explicit tests proving fee recipient snapshots do not change after global fee recipient updates;
* on-chain deployment checks for bytecode, critical reads, owners, global fee recipient, parameter sanity, and deployment-level module linkage;
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

* Which wallets are required for the controlled Base Sepolia demonstration?
* Is WalletConnect required before controlled beta or only before broader public beta?
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
* `AuctionHouse` snapshots the settlement fee recipient for each auction at creation;
* `feeRecipient` remains a global configuration value for future auctions;
* `setFeeRecipient(...)` does not retroactively change the recipient used by existing auctions;
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

Each auction has an explicit snapshot of the economic and operational parameters that apply to it.

This prevents a global parameter update from retroactively changing an auction that is already open.

Parameters and references snapshotted today include:

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
* module addresses used by the auction;
* fee recipient used for protocol fee settlement.

Current MVP position:

* the Solidity engine snapshots `ParamsController.Params` per auction;
* the Solidity engine snapshots active modules per auction;
* the Solidity engine snapshots the current `feeRecipient` per auction;
* dedicated Foundry tests now prove that existing auctions keep using their parameter snapshot after `ParamsController.setParams(...)`;
* dedicated Foundry tests now prove that existing auctions keep using their fee recipient snapshot after `setFeeRecipient(...)`;
* the read-only auction detail view now exposes the auction parameter snapshot;
* the read-only auction detail view now exposes the auction fee recipient snapshot;
* global parameter updates apply to future auctions only;
* global fee recipient updates apply to future auctions only;
* `paused` remains a global emergency control.

Fee recipient model:

* `feeRecipient()` remains the current global configuration getter;
* `setFeeRecipient(...)` updates the recipient to be used by future auctions;
* each auction captures the current fee recipient during `createAuction`;
* `finalizeAuction` uses the auction-specific fee recipient snapshot;
* this prevents admin rotation from retroactively changing the protocol fee recipient for an auction that already exists.

Future work:

* include auction-level fee recipient snapshot checks in post-deployment verification;
* consider emitting richer events for indexers;
* document which global parameter changes affect only future auctions;
* make auction-specific rules easier for users to inspect before bidding;
* ensure any future governance model preserves immutable rules for already-created auctions.

---

## Indexing and Read Scaling

The current frontend can discover auctions without iterating over every possible auction ID.

Current MVP position:

* the auction list reads `AuctionCreated` logs from the configured deployment;
* results are shown newest-first with a default limit;
* if event scanning fails, the server route falls back to a bounded newest-first read from `nextAuctionId`;
* the auction list applies client-side browsing controls to the loaded auction window: search, status filters, connected-wallet filters, and deterministic sorting;
* the wallet activity dashboard reads wallet-scoped `AuctionCreated`, `BidPlaced`, `AuctionFinalized`, and `NFTClaimed` logs first;
* if wallet-scoped logs do not identify any auction, the dashboard can scan a bounded general `AuctionCreated` event window and then filter the resulting auctions through direct on-chain reads for wallet balances, seller state, fee recipient snapshots, and next actions;
* if event reads fail, the dashboard falls back to a bounded newest-first `nextAuctionId` window;
* the dashboard exposes its discovery strategy as `event-scoped`, `general-event-window`, `bounded-fallback`, or `unavailable`;
* the auction detail read model builds a JSON-safe economic summary for current highest bid, final price, proceeds, fees, visible refunds, visible rewards, redistribution status, and snapshot values when available;
* bounded dashboard results display a UI warning so users do not confuse the MVP read model with complete production history;
* no persistent database, hosted indexer, or historical cache exists yet.

This is enough for local MVP and controlled smoke testing, but not enough for large public usage.

Events currently used for wallet activity discovery:

* `AuctionCreated`, indexed by seller;
* `BidPlaced`, indexed by bidder;
* `AuctionFinalized`, indexed by winner;
* `NFTClaimed`, indexed by claimant.

Known limits of the MVP event read model:

* it depends on RPC log availability and range limits;
* bounded reads can omit older auctions;
* auction browsing filters and search apply only to the auctions loaded into the current bounded window;
* `recently updated` sorting is not exposed because the current read model does not provide a reliable last-updated timestamp per auction;
* fee recipient activity is inferred from discovered auctions, fee recipient snapshots, and credit reads, not from a dedicated per-auction fee withdrawal index;
* seller proceeds and protocol fee withdrawals still need a production indexer or richer event schema for complete historical reporting;
* the economic transparency panel is a direct-read MVP verification aid, not full historical accounting;
* the frontend should continue to verify settlement-critical values through direct on-chain reads.

Open questions:

* What indexed schema should represent auctions, bids, finalization, claims, withdrawals, rule snapshots, and fee recipient snapshots?
* Should the first indexer be a lightweight server cache, a dedicated database, or a third-party indexing service?
* How should the UI surface stale indexer data versus fresh on-chain reads?
* Which reads must always remain direct on-chain verification paths?
* What pagination model should be exposed for large auction history?

Future work:

* add persistent event indexing for scalable auction history;
* index `BidPlaced`, `AuctionExtended`, `AuctionEnded`, `AuctionFinalized`, and `NFTClaimed`;
* index vault and distribution events once production event surfaces are finalized;
* keep claimable balances and settlement-critical reads verifiable on-chain;
* define monitoring around event ingestion gaps and RPC log range failures.

---

## NFT Metadata Read Model

NFT metadata is optional presentation data, never a source of economic or settlement truth. Failed metadata reads preserve auction access, amounts, lifecycle, and settlement evidence.

### Lot 4 — Approved Server JSON Download Policy

The user approved the Phase A plan and network policy for `BIDBACK-LOT4-METADATA-SAFETY-v1` after Work review. The implementation is in [`nftMetadataHttp.ts`](../frontend/src/lib/server/nftMetadataHttp.ts), called by [`nftMetadataReader.ts`](../frontend/src/lib/server/nftMetadataReader.ts).

* Parse URLs before connecting; allow only HTTP port 80 and HTTPS port 443, including explicit default ports. Reject credentials, other protocols, IPv6 zone identifiers, `localhost` and its subdomains. Use normalized addresses, including alternative numeric IPv4 representations; fragments are not sent.
* Resolve both A and AAAA through a dedicated Node `dns/promises.Resolver`. Both families must finish before connecting; `ENODATA` is acceptable only when the other family supplies public addresses. Reject any forbidden/invalid answer, empty combined results, or other DNS error.
* Connect directly to the selected validated numeric IP, preferring the first A address, otherwise the first AAAA address. Do not resolve the name again, retry another IP, use a shared connection pool, or introduce a proxy. Keep the original HTTP `Host` and DNS hostname SNI. HTTPS requires certificate trust validation and Node's `checkServerIdentity` against the original hostname or IP literal, never merely the selected DNS address.
* Follow no redirects and reject non-2xx responses. Apply the same policy to the final URL produced by simple `ipfs://<cid>` or `ipfs://ipfs/<cid>` conversion, including an environment-configured gateway.
* Request `Accept-Encoding: identity`; reject every content encoding except absent or `identity`. No decompression is performed. Limit the body to 262144 bytes counted as chunks arrive, before accumulation. An excessive `Content-Length` can reject early but cannot authorize a body; reject incomplete HTTP messages. Keep a 16384-byte HTTP header limit.
* Apply one 4000 ms deadline to URL handling, DNS, connection/TLS, and the complete HTTP body. At expiry, cancel this download's resolver, destroy active request/response streams, release retained chunks, and suppress all late results before they can create a connection. Cleanup also occurs on success and failure.
* Parse the bounded body as JSON and accept only a non-null object, not an array or scalar. No extra MIME restriction is imposed. Display only fixed English error messages, without response excerpts, raw DNS/TLS/RPC errors, or internal connection details.

The conservative address policy is based on the [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/) and [IPv6 special-purpose registries](https://www.iana.org/assignments/iana-ipv6-special-registry/):

| Family | Policy |
| --- | --- |
| IPv4 | Reject `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.88.99.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, and `240.0.0.0/4`. |
| IPv6 | Allow only `2000::/3`, excluding `2001::/23`, `2001:db8::/32`, `2002::/16`, and `3fff::/20`; also reject ISATAP interface identifiers with `0000:5efe` or `0200:5efe` before the embedded IPv4. This excludes loopback, unspecified, ULA, link-local, multicast, IPv4 mapped/compatible/translatable, standard NAT64, Teredo, and 6to4 destinations. |

Whole special blocks are refused even where a more specific globally reachable exception exists. The policy does not infer arbitrary network-specific routing or translation from an address; it is not a substitute for deployment network isolation.

### Preserved Behavior and Limits

* ERC-721 `name()`, `symbol()`, and `tokenURI(tokenId)` reads remain optional and read-only. The HTTP budget starts after these RPC calls, not before them; this lot does not change their timeout behavior or fix local NFT `tokenURI` reverts.
* Preserve the `loaded`, `no-image`, `unavailable`, `unsupported-token-uri`, and `fetch-failed` states and the existing metadata fields. The UI renders escaped React text, never injected HTML.
* Images are still fetched directly by the browser, with existing IPFS image conversion. This server JSON policy neither proxies nor validates browser image downloads or external-link destinations.
* Node [`Resolver.cancel()`](https://nodejs.org/download/release/v22.20.0/docs/api/dns.html#resolvercancel) cancels outstanding queries on that resolver; it cannot recall DNS packets already sent. The completion/deadline guard independently prevents late DNS results from initiating connections. Resolver calls use DNS rather than hosts-file lookup. Deadlines are subject to event-loop scheduling, and synchronous parsing of the bounded body is not preemptible; no hard real-time guarantee is claimed.
* Redirect-only, compression-only, nonstandard-port, private-network, mixed-DNS, and conservatively excluded special-address metadata becomes unavailable. Selecting one IP without retry can also lose metadata when another address would have worked. These compatibility tradeoffs are approved.
* Metadata may remain mutable, unavailable, or malicious. There is no shared metadata cache, global rate limiting, new aggregate concurrency budget, image/content moderation pipeline, or production NFT indexer in this lot.

The dedicated transport tests exercise the actual Node HTTP request/parser over simulated connections, with simulated DNS, covering destination pinning, redirects, byte limits, interruption, late resolution, and TLS failure propagation. Certificate hostname checks use Node's real checker; trust/expiry handshake failures are simulated, not proof of a live TLS deployment. Reader and auction tests cover optional metadata and preservation of settlement evidence. Test presence is not execution evidence: retain results, CI run links, and tested revisions in the lot PR for independent Work review. This change does not advance any readiness gate or establish production readiness.

Future choices about a managed metadata service, shared cache, media proxy, moderation, and long-term metadata history remain open. Bidding, settlement, and claim eligibility must never depend on off-chain metadata.

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
* fee recipient used for a given auction;
* module addresses used for a given auction.

The MVP now exposes a first read-only economic transparency panel for several of these values when the current getter coverage and read model can retrieve them. This panel is useful for local and controlled testnet verification, but it does not replace production reporting, a scalable indexer, or direct settlement-critical on-chain reads.

Areas that require additional production work:

* explorer verification;
* external smart contract audit;
* monitoring for failed transactions and abnormal settlement states;
* persistent event indexer for auction history and scalable reads;
* backend persistence for UI convenience where appropriate;
* production NFT metadata cache or media proxy if NFT previews become part of the public UX;
* incident response process;
* documented admin powers;
* governance handoff documentation;
* public status and deployment notes.

The frontend should never ask users to trust an opaque reward calculation when the claim path depends on deterministic on-chain state.

---

## Open Decisions Register

| Decision area                     | Current MVP position                                                                                                  | Options under consideration                                                                | Key risks                                                                             | Impacted components                                     | Decision timing                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Bidding authorization model       | Wallet-signed bids plus local-dev server actions for testing                                                          | Session keys, account abstraction, auction-scoped delegation, signed intents, hybrid model | Unauthorized bids, poor UX, relayer trust, replay risk                                | `AuctionHouse`, wallet layer, frontend, future backend  | Before production UX; prototype before public beta |
| Multi-wallet support              | Wallet-signed panels exist; MetaMask-oriented testing so far                                                          | Injected wallets, Rabby, Coinbase Wallet, WalletConnect                                    | Wallet incompatibility, RPC reachability, mobile UX gaps                              | wagmi config, viem clients, UI, docs                    | Before broad public testnet usage                  |
| Chain selection                   | Local Anvil `31337` plus one validated canonical Base Sepolia `84532` cycle; production chain remains open              | Ethereum L1, L2 EVM, MegaETH, Solana, hybrid settlement, appchain                          | Fees, latency, security assumptions, ecosystem maturity                               | contracts, deployment scripts, frontend config, docs    | Before public beta and production                  |
| Redistribution computation model  | Deterministic on-chain SCR in MVP                                                                                     | Keep on-chain bounded model, Merkle proofs later, batched settlement                       | Gas growth, opaque off-chain computation, solvency errors                             | `AuctionHouse`, `DistributionVault`, tests, indexer     | Reassess after testnet auction volume data         |
| Governance controls               | Owner-controlled MVP params; fee recipient affects future auctions; one-time vault locks                               | Multisig, timelock, emergency pause policy, public governance process                      | Arbitrary rule changes, EOA compromise, blocked claims                                | `ParamsController`, ownership, docs, deployment scripts | Before controlled/public beta progression          |
| Auction parameter snapshots       | Params, modules, and fee recipient are snapshotted, tested, and visible read-only                                      | Richer events, auction-level verification, richer indexer schema                           | User cannot inspect all rules, stale module confusion, incomplete verification         | `AuctionHouse`, frontend, indexer, verification scripts | Snapshot visibility done; verify each deployment   |
| Indexing and persistence          | Event-based auction discovery, client-side browsing over loaded windows, and wallet activity discovery with fallbacks  | Event indexer, backend cache, hosted read API                                              | Missing history, RPC log range failures, scalability limits, stale data               | frontend, backend, deployment, monitoring               | Before many simultaneous auctions                  |
| NFT metadata display              | Opportunistic direct tokenURI reads with HTTP/IPFS support; no cache or media proxy                                    | Metadata cache, media proxy, NFT metadata service, collection indexer                      | Broken media, malicious metadata, stale metadata, external availability                | frontend, future backend, docs                          | Before broader public UX                           |
| Production trust and verification | JSON validation and expanded on-chain verification exist                                                              | Explorer verification, external audit, monitoring, runbooks                                | Wrong deployment, unverified bytecode, incident response gaps                         | docs, scripts, deployment process, governance           | Before public beta and production                  |
| Local-dev tooling boundary        | `/api/dev/*` guarded and local only                                                                                   | Keep local-only, remove from production build, feature flags by environment                | Accidental production exposure, server-held key misuse                                | Next.js routes, env config, docs                        | Before hosted frontend deployment                  |
| Final UI/UX model                 | Functional MVP UI, not final design                                                                                   | Marketplace UX, bidder dashboard, auction discovery, trust panels                          | Confusing economics, wrong financial framing                                          | frontend, copy, docs, user education                    | After core public testnet mechanics are validated  |

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
* fee recipient snapshotting per auction;
* read-only display of auction parameter snapshots;
* read-only display of auction fee recipient snapshots;
* read-only economic transparency / settlement breakdown display;
* read-only NFT metadata previews that do not affect settlement;
* client-side auction browsing controls over the currently loaded read-only window;
* event-based auction list discovery with bounded fallback;
* event-based wallet activity discovery with bounded fallbacks;
* local and wallet-signed testing flows.

Areas likely to evolve before production:

* bidding authorization model for lower-friction bids;
* governance controls and ownership handoff;
* persistent indexer and backend persistence for scalable reads;
* production-grade auction browsing, pagination, and historical search;
* NFT metadata caching, media proxying, and content safety;
* repetition and completion of archival evidence beyond the single validated canonical Base Sepolia multi-wallet lifecycle;
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
