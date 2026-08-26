# GBM Competitive, Mechanism, Empirical and Prior-Art Review

**Cutoff:** 26 August 2026  
**Review type:** bounded factual checkpoint; descriptive product, mechanism, empirical and patent-family screen  
**BidBack baseline:** `solidity-baseline-v1`  
**Economic Model V1 outcome:** `no-current-candidate-acceptable`  
**Decision owner:** BidBack steering  

## 1. Executive Summary

**Exit decision:** `Proceed — information assimilated, no reason to delay V1`

GBM is the closest deployed comparator located in the reviewed corpus because it combines an ascending auction, compensation for displaced bidders and seller proceeds reduced by those incentives. It is not the same mechanism as BidBack. In GBM's documented Web3 reference design, when a bid becomes standing, its potential incentive is calculated from its increase over the preceding standing bid; if it is later displaced, that bidder receives its bid back plus the preset incentive, funded through the final bid. BidBack instead settles only after close, conditionally forms a redistribution pool from net premium actually created above the starting price, scores losing bidder identities through EF/ET/II and reputation, excludes the winner, refunds losing caps in full and leaves unassigned pool remainder with the seller.

The strongest empirical evidence is a March 2026 author-connected paper and supplement covering 11,900 Aavegotchi Haunt 2 auctions from 26–29 August 2021. The reported treatment medians and within-wallet estimates are consistent with higher bids in incentivized treatments. They do not isolate a general causal effect of rewards from all auction-design changes: MEDIUM and HIGH change both incentive and minimum step; bidders could select auctions; the setting is crypto-native; wallets are not persons; a shared bidder pool prevents a clean entry test. The paper reports lower same-wallet self-outbidding in the incentivized treatments, but cannot observe common control across wallets. No independently reconciled dataset or executable analysis location was supplied in the papers inspected.

The GBM retrospective reports more than $200 million in bidding volume, 90,000 auctions and more than $6 million returned to losing bidders. These are issuer-authored aggregates without a published reconciliation in the bounded review. They must not be restated as settled sales, seller proceeds, revenue or distinct capital. Evidence states differ by integration: Aavegotchi and Song A Day have dated contract activity, while The Sandbox has an integrator launch post but no separate activity/result record in the bounded review. The central GBM product and open protocol were wound down, and Perpetual Altruism Ltd entered creditors' voluntary liquidation in March 2026. Those facts do not establish the cause of the cessation or the outcome of every partner integration. Partner-level contract activity was recorded after the liquidation resolution.

The descriptive family screen located a GBM-linked family with earliest priority on 7 August 2018, PCT publication WO2020030891A1 and US publication US20210174432A1. Statuses `observed in the cited register as of 26 August 2026`: US entry — `Pending`; PCT entry — `Ceased`. The live US file history was not independently inspected. The independent US claims displayed at the cutoff describe, among other elements, sequential standing bids, incentive payments to parties associated with nonfinal standing bids and seller receipt of the final payment less incentives. This is meaningful descriptive overlap with the broad problem space, alongside important differences in funding base, accrual, entitlement and settlement. The four-part threshold for targeted expert review is not met because a materially relevant V1 jurisdiction and plausible commercial stake are not yet established in BidBack's approved scope. This checkpoint makes no legal conclusion.

Three bounded precedents passed the inclusion filter: the Amsterdam auction, US20050267834A1 and TopBidder. Together they make broad positioning such as inventing bidder compensation, rewarding losing bids or attributing rewards to bidding history unsuitable. BidBack can accurately describe observed mechanism differences within the reviewed corpus: premium-only conditional funding, full losing-cap recovery, post-close scoring and pull claims, and separation between a mechanical price-lift trace and EF/ET/II entitlement scoring. These are potential positioning distinctions, not exclusivity statements.

No finding is a `Material blocker candidate`. The review creates no Must-have V1 mechanism change, no Candidate F or Lot G, no parameter recommendation and no P4/P5 mitigation design. P4 remains the bounded D6 actor-observability failure; P5 remains passed for all six consolidated models. The next workstream remains `Premium Controlled-Experience Readiness`.

## 2. Cutoff, Scope, Exclusions and Method

### 2.1 Cutoff and questions

This review uses information observed no later than **26 August 2026** and answers four bounded questions:

1. **Competitive and positioning:** What was GBM, where was it deployed, what adoption evidence exists, and what can BidBack responsibly say?
2. **Mechanism benchmark:** How do the documented GBM designs compare with `solidity-baseline-v1`?
3. **Empirical evidence:** What evidence exists on bidding, adoption, bidder behavior and cessation, with what limitations?
4. **Prior-art and IP family screen:** What earlier mechanisms and GBM-linked published claim families appear materially close at a descriptive level?

The review is a factual checkpoint, not an economic-model selection, a legal opinion, a production-readiness approval or a recommendation to copy GBM.

### 2.2 Frozen scope

The following are frozen inputs rather than questions reopened here:

- BidBack's authoritative baseline is `solidity-baseline-v1`.
- Economic Model V1 is complete and its outcome is `no-current-candidate-acceptable`.
- Lots A–F are not reassessed.
- P4 means only `winnerActorIndirectReward == 0` on D6.
- P5 is the declared existential representative-auction result and passes for all consolidated models.
- The P4/P5 observability boundary is only a conditional reopening boundary under the Economic Model V1 decision record.

### 2.3 Exclusions

This work does not create a Candidate F, Lot G, simulator, Monte Carlo analysis, optimizer, parameter sweep, replay, Solidity change, parameter recommendation, identity primitive, P4/P5 mitigation, GTM strategy or product roadmap. It does not infer a person from a wallet, treat an announced integration as a launch, treat a launch as sustained activity, treat bidding turnover as settled value, or treat a theoretical attack surface as an observed exploit.

The patent-family screen is descriptive. It separates product, company, applicant, inventor and displayed assignee; groups related publications by family; focuses on independent claims; and does not opine on any party's legal rights or any product's legal exposure.

### 2.4 Method

Evidence was collected through bounded searches of:

- current BidBack governing documents;
- GBM's final retrospective, archived/current documentation and March 2026 paper plus supplement;
- integrator announcements, public repositories, verified contract pages and an observed transaction;
- official corporate notices;
- scholarly publications and field evidence;
- Google Patents family pages, displayed claims and events, plus USPTO access guidance;
- close mechanism precedents admitted only when at least two of these three conditions were met: a losing or displaced participant receives value; the value is tied to a bid, increment or bidding history; the value is funded inside the auction's economics.

Every material proposition maps to an atomic entry in Section 14. Source tiers mean:

| Tier | Meaning | Typical limitation |
| --- | --- | --- |
| 1 | Repository authority, official register, verified contract/transaction, or peer-reviewed scholarly source | Still limited to the scope and measurement of the record |
| 2 | Direct paper, code repository, product documentation or integrator statement | May be author-connected or lack independent reconciliation |
| 3 | Issuer-authored marketing, retrospective or case study | Useful for the issuer's account; not independent proof of performance |
| 4 | Secondary report, mirror or community statement | Corroborative or discovery value only |

Absolute rule: `not located != false`. `not located in bounded search` means only that this review did not locate the evidence; it does not mean the proposition is false. Event date and document date are separated where possible. Web-source pages were inspected on 26 August 2026 except where the register records a pointer-only observation, notably G36, whose linked explorer contents were not independently inspected.

### 2.5 Materiality and action rules

Findings use exactly three materiality categories:

- `Informational`
- `V1-relevant`
- `Material blocker candidate`

A `Material blocker candidate` requires all five conditions: credible direct or sufficiently corroborated evidence; direct applicability to the current BidBack mechanism or V1 scope; potentially severe consequence; identifiable action needed before the affected scope; and a precise decision or action that steering can evaluate. Each finding explicitly answers: **Does this finding actually require action before a credible, attractive and reasonably safe V1?**

Actions are separated into `Must-have V1`, `Strong V1 enabler`, `Post-V1 improvement`, and `Scale / Production concern`. No composite score is used.

## 3. BidBack Baseline

The comparison baseline below is frozen from B01–B06. It is functional in the current MVP and describes current behavior; it was not selected as Economic Model V1.

| Baseline element | Frozen fact | Evidence / Claim |
| --- | --- | --- |
| Auction and price | First-price cap auction; the final price is the **highest valid cap**. A cap step-up transfers only the additional deposit. | B04; C-001 |
| Minimum next bid | `increment = max(floor(H * minBidIncrementBps / 10_000), 1)` and `minimumNextBid = H + increment`; a new cap must reach that amount and exceed the participant's prior cap. | B04; C-002 |
| Mechanical trace | `premiumLift_j = max(H_j - max(H_(j-1), startPrice), 0)` and `sum(premiumLift_j) = grossPremium` for a completed accepted trace. This is analytical trace accounting only. It is not EF, ET, II, `finalScore`, or causal contribution. | B04; C-003 |
| Premium | `grossPremium = max(finalPrice - startingPrice, 0)`. | B04; C-004 |
| Fee and costs | If no gross premium exists, the fee is zero. Otherwise the fee is floored from gross premium. Current contracts contain no additional configured-cost deduction; `netPremium = grossPremium - feeAmount`. | B04; C-005 |
| Pool eligibility | Net-premium threshold, participant-count threshold and minimum initial duration must all pass. The pool is a bounded fraction of net premium and can never exceed it. | B04; C-006 |
| Beneficiaries | Only losing bidder identities can be scored. The winner is skipped before scoring. | B04; C-007 |
| EF | Squared, independently floored ratio of capped maximum cap to final price, bounded by `efCap`. | B04; C-008 |
| ET | Initial-end-time exposure from the bidder's initial bid; auction extensions do not expand its measurement window. | B04; C-009 |
| II | Bounded count of accepted takeovers of another current leader; not the opening bid and not a current leader's own step-up. | B04; C-010 |
| Final score | `weightedScore_i = floor((alphaBps*EF_i + betaBps*ET_i + gammaBps*II_i)/10_000)`; `finalScore_i = floor(weightedScore_i*reputationBps_i/10_000)`. Reputation is read live at finalization from the snapshotted adapter. | B04; C-011 |
| Allocation | Proportional to losing identities' positive `finalScore`, then bounded by a per-user cap. Cap remainder, zero-score amount and integer dust are not reallocated. | B04; C-012 |
| Seller proceeds | `finalPrice - feeAmount - assignedDistribution`. Only assigned distribution is reserved; unassigned candidate-pool remainder remains with the seller. | B04; C-013 |
| Refunds | Each loser can recover 100% of its locked cap. Winner surplus over final price is recoverable, though normally zero on the current path. Refunds do not depend on reward eligibility or claim order. | B04; C-014 |
| Custody and exits | Modular auction, escrow, NFT, distribution, reputation and parameter responsibilities; pull-based ETH claims and NFT release after finalization. Emergency pause must preserve economic exits. | B01, B03, B04; C-015 |
| Boundedness | Participant count and settlement work are bounded; the documented default maximum is 64 participants. Anti-sniping extensions are bounded. | B04; C-016 |
| Model decision | No current consolidated model is acceptable. P4 fails for every feasible actor-blind model in the declared D6 evidence; Candidate E's D6 result depends on external actor labels and is not implementable from current on-chain inputs. P5 passes for all models. | B05, B06; C-017, C-067, C-068 |

For avoidance of ambiguity: `mechanical contribution = sum(premiumLift)` in the analytical trace; `mechanical contribution != EF / ET / II / finalScore`; and `mechanical contribution != causal contribution`. No current BidBack model is described here as sybil proof or sybil resistant. A wallet-level winner exclusion is not an actor-level exclusion. `P4/P5 = conditional reopening boundary only` under B05/B06.

## 4. GBM Factual Profile and Timeline

### 4.1 Product, people and entity

GBM described itself as an incentivized ascending-auction system in which a bidder displaced by a later bid receives its bid back plus an incentive. Its 2018–2026 retrospective names Guillaume Gonnaud, Edouard Bessire and Hugo McDonaugh as founders/inventors, says the mechanism was devised for Cryptograph in 2018, and reports a Cryptograph launch in 2020. The retrospective is an issuer-authored final account and is used as such, not as independent corroboration. [C-018]

GBM terms identify **Perpetual Altruism Ltd**, UK company 11219425, as the company behind the service. Companies House displays the company status as liquidation. The London Gazette records a creditors' voluntary winding-up resolution and appointment of liquidators on 5 March 2026, with the business described as blockchain-based auction and marketplace technology. These records establish corporate events, not why they occurred and not the status of every contract, integration or asset. [C-019, C-081]

The GBM retrospective states that its fiat product and later open `$GBM` protocol were wound down, while verified contracts remained available. It also reports white-label work across seven chains. An Aavegotchi transaction was observable after the March 2026 corporate event, so the bounded conclusion is: **central operator/product cessation with dated partner-level contract activity after the corporate resolution**. [C-020, C-040]

### 4.2 Timeline

| Event date | Observed event | Evidence nature | Claim |
| --- | --- | --- | --- |
| 7 Aug 2018 | Earliest GB priority shown for the GBM-linked patent family | Patent-family record | C-050 |
| 2018 | GBM says the mechanism was devised for Cryptograph | Issuer-authored retrospective | C-018 |
| 8 Jul 2020 | GBM dates the initial Cryptograph auction to this day | Issuer-authored retrospective | C-018 |
| 26–29 Aug 2021 | Aavegotchi Haunt 2 produced the 11,900-auction analytical sample after stated exclusions | Direct paper and supplement | C-028 |
| 1 Dec 2022 | Aavegotchi announced its permissionless secondary Auction House as live | Integrator announcement | C-026 |
| Jan 2023 | Song A Day's creator described a recent move to GBM; this is later than the retrospective's broad 2022 integration date | Direct interview/case evidence; date tension retained | C-074 |
| Jan 2024 | Decentraland governance favored a separate GBM dApp rather than native marketplace integration | Governance record; approval is not usage | C-025 |
| Jul 2025 | The Sandbox published a launch post for a scheduled bounded GBM sale; separate activity/results were not located | Integrator announcement | C-094 |
| 24 Nov–1 Dec 2025 | GBM documented an incentive-driven token sale on Base | Product documentation | C-079 |
| 5 Mar 2026 | Perpetual Altruism Ltd liquidation resolution and liquidator appointments | Official corporate records | C-019 |
| Mar 2026 | Bessire paper and supplement dated March 2026 | Direct author-connected research | C-028 |
| 31 May 2026 | A 100 GHST Aavegotchi auction bid was recorded on Base | Transaction and address registry | C-020 |
| By 26 Aug 2026 | GBM's retrospective says the central fiat product and open protocol were wound down | Issuer-authored retrospective | C-040 |

### 4.3 Documented deployment and adoption states

The evidence supports different states, which must not be collapsed:

| Example | Announced | Launched / implemented | Observable activity | Sustained adoption or settled-value evidence |
| --- | --- | --- | --- | --- |
| Aavegotchi | Yes | Yes | Yes, including an observed Base transaction on 31 May 2026 | Repeated issuer-authored aggregates; no independent full reconciliation located |
| Song A Day | Yes | Yes | Verified Ethereum contract history and dated case evidence | Before/after case study only; no controlled attribution |
| The Sandbox July 2025 sale | Yes | Integrator launch post exists | No separate transaction/result activity located | Final settled result not located in bounded search [C-094] |
| Decentraland | Proposal and vote | Separate dApp path favored; deployment unresolved | No usage activity established | Unresolved |
| Singular | Prospective announcement | Unresolved | No quantitative activity located | Unresolved |
| myNFT | Retrospective and launch-era accounts | Retrospective says late-2022 launch | No auditable activity series located | Retrospective says later shelved |
| GBM fiat / Equippo | Yes | Eleven-lot event reported | Event evidence only | Result dataset not located |
| Open `$GBM` protocol | Yes | Retrospective says live in 2026 | Retrospective links a Base explorer pointer; explorer contents not independently inspected | Retrospective says later wound down [C-040, C-065] |

## 5. Mechanism Comparison

GBM had version-specific implementations. The grid uses the March 2026 reference model and the Aavegotchi implementation where they agree, and flags the fiat terms where they differ. A claim about one version is not generalized to every GBM deployment.

| Dimension | BidBack baseline | GBM | Other precedent if material | Same / different / unknown | Evidence status | Implication | Claim IDs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auction format | Time-bounded on-chain cap auction | Time-bounded open ascending reference auction | Amsterdam: ascending premium auction; TopBidder: perpetual displacement | Partly same | Supported for reference versions | Both expose ascending competition, but TopBidder has no ordinary terminal format | C-001, C-043, C-046, C-056 |
| Price rule | First-price; winner pays highest cap | Winner pays final standing bid | Amsterdam and TopBidder differ in payment/displacement details | Same at broad level for GBM | Supported | Broad first-price similarity is not enough to equate economics | C-001, C-058 |
| Minimum increment | Basis-point increment with minimum unit | `new bid >= alpha × standing bid`; implementation presets vary | TopBidder reports a 10% minimum next bid | Similar form, different controls | Supported | Parameter resemblance is generic and version-specific | C-002, C-046, C-057 |
| Cap/deposit method | Participant deposits only cap delta on step-up | Web3 reference/Aavegotchi transfers each full bid; fiat terms authorize only a portion and winner owes balance | TopBidder transfers the new price under its protocol | Different; GBM versions differ | Supported / partially supported | Fully funded is not a universal GBM attribute | C-001, C-021, C-022, C-047 |
| Anti-sniping | Bounded extension near end | Time extension described in claims/code; exact deployment rules vary | No cross-precedent conclusion | Similar concept, parameters unknown | Partially supported | Compare deployed configuration, not only mechanism label | C-016, C-022, C-052 |
| Closing condition | Scheduled end plus bounded anti-sniping extension, then explicit finalization | Time-limited reference auction; deployed extension rules vary | Amsterdam is terminal; TopBidder is perpetual | Different around perpetual precedent; similar broad terminal GBM form | Partially supported | Closing and incentive timing must be compared together | C-016, C-043, C-046, C-052, C-056 |
| Reward funding base | Only net premium above starting price, after protocol fee and configured costs; current configured costs are zero | Incentives deducted from final standing bid/seller amount; not restricted to premium above a starting price in the reference model | Amsterdam premium and TopBidder displacement share are internal to auction cash flows | Materially different | Supported | BidBack protects starting-price principal from redistribution by formula | C-004, C-005, C-006, C-021, C-043, C-046 |
| Funding priority | Fee from gross premium, then conditional candidate pool from net premium; only assigned amount reduces seller proceeds | Reward obligations accumulate and seller receives final bid less total incentives | Earlier loyalty patent ties points/rewards to contribution history | Different | Supported | BidBack's conditional pool and assignment remainder have no located GBM equivalent | C-005, C-006, C-013, C-021, C-045 |
| Reward accrual | No bidder entitlement during live bidding; allocations arise at finalization | A potential incentive is calculated when a bid becomes standing; refund plus that preset amount is released if the bid is later displaced | Amsterdam premium is terminal; TopBidder transfer follows displacement | Different | Supported for reference model | Timing changes incentives, accounting and attack surface | C-007, C-012, C-021, C-043, C-046, C-066 |
| Entitlement timing | Losing-identity entitlements are recorded only in settlement | The possible amount is set at standing-bid placement and becomes payable on later displacement | Amsterdam is terminal; TopBidder follows displacement | Different | Supported for referenced versions | “Rewarded bidder” means different state transitions across mechanisms | C-007, C-012, C-021, C-043, C-046, C-066 |
| Entitlement basis | Losing identity's EF/ET/II weighted score times live reputation | A bidder's own standing bid and the immediately preceding standing bid determine its configured rate/amount | Earlier patent uses bid history/contribution; Amsterdam uses terminal rank/gap | Different | Supported | BidBack does not pay each displaced bid or directly use `premiumLift` | C-003, C-008, C-009, C-010, C-011, C-012, C-021, C-043, C-045 |
| Claim timing | Pull claim after settlement | Paper describes refund plus incentive when outbid; code/version operations may create debt or claim flow | Varies | Different / version-specific | Partially supported | Avoid claiming all GBM versions paid synchronously in the same way | C-015, C-021, C-022 |
| Bid/increment/reward relation | `premiumLift` is trace-only; reward depends on final relative state and interactions | Reward rate fixed when the bid is placed; reward to displaced bid depends on prior and new standing bids within bounds | Earlier patent expressly links rewards to contribution/minimum increments | Different | Supported | This is one of the strongest observed mechanism distinctions | C-003, C-011, C-021, C-045 |
| Beneficiary | Scored losing bidder identity | Each displaced standing bidder; winner may retain incentives earned on earlier displaced bids | Amsterdam rewards runner-up; TopBidder rewards displaced holder | Different | Supported | GBM can pay the eventual winner for earlier states; BidBack excludes winner identity | C-007, C-043, C-046, C-059, C-063 |
| Winner exclusion | Winner identity skipped before scoring | Final standing bid earns no displacement incentive, but its bidder may have earlier earned incentives | Mixed | Materially different | Supported | Do not describe both systems simply as winner-excluded | C-007, C-059, C-063 |
| Losing bidder economics | Entire locked cap refundable plus any post-close reward entitlement | Outbid standing bidder receives refund plus incentive; bidders who never held standing position need not earn | Amsterdam only terminal runner-up; TopBidder prior holder | Different coverage | Supported | “Losing bidders are paid” overstates GBM coverage unless qualified | C-014, C-059 |
| Winner economics | Pays final price, usually no cap surplus, receives NFT; no distribution | Pays final bid, receives item; may retain incentives earned before its final bid | TopBidder has temporary/perpetual-holder economics | Different | Supported | Earlier reward retention matters to actor-level analysis | C-014, C-046, C-058, C-063 |
| Seller economics | Starting price plus retained premium after fee and assigned distribution | Final bid less accumulated bidder incentives and applicable fees | TopBidder predetermines artist/reserve shares | Different | Supported | GBM paper itself models an approximate revenue sacrifice at fixed participation | C-013, C-036, C-046, C-060 |
| Protocol economics | Fee only when gross premium exists; taken from gross premium | Archived protocol docs proposed 2% of final winning bid plus publishing fee; Aavegotchi code uses a separate post-incentive proceeds split | TopBidder allocates 2% to inviter, not directly comparable | Different | Partially supported | Archived pricing and partner splits should not be generalized across GBM history | C-005, C-023, C-064 |
| Refundable capital / capital at risk | Losing caps fully recoverable; rewards never funded from refundable caps | Displaced standing bid refunded in documented Web3 design; current winner bears final payment | Precedents vary | Broad similarity, accounting differs | Supported | Both can reduce ordinary losing-bid principal risk, not actor or opportunity-cost risk | C-014, C-059, C-066 |
| Capital lock duration | Cap remains locked until settlement/claim | Sequential full bids and refund timing depend on implementation; fiat version uses authorizations | Varies | Different / version-specific | Partially supported | Capital-time comparisons require deployment-level data | C-014, C-022, C-047 |
| Pool | Conditional bounded candidate pool | No common post-close candidate pool in the reference design; accumulated per-displacement obligations | No direct match in selected precedents | Different | Supported | “Redistribution pool” should be reserved for BidBack's actual accounting | C-006, C-012, C-021 |
| Per-user cap | Yes, as a fraction of candidate pool | No analogous post-close per-user normalization in reference model; reward rate has per-bid bounds | Not comparable | Different | Supported | A cap by identity does not establish an actor-level cap | C-012, C-021, C-067 |
| Dust/remainder | Unassigned candidate amount stays with seller | Rounding and unpaid/debt handling are implementation-specific; no equivalent candidate remainder located | Unknown | Different / unknown | Partially supported | Do not infer parity from headline payout formulas | C-013, C-022 |
| Eligibility conditions | Premium, participant count and initial-duration gates | Each qualifying displacement can accrue a reward; auction/reserve configuration differs | Amsterdam/TopBidder have different triggers | Different | Supported | BidBack can produce no pool even with bidding activity | C-006, C-021 |
| Participant count | Bounded, default maximum 64; minimum gate includes winner | Paper assumes a bidder environment; deployed count bounds depend on contract version | Varies | Unknown at system-wide level | Partially supported | Scalability and settlement-loop claims require code-specific review | C-016, C-021, C-022 |
| Participant-count effects | Participant count is an eligibility gate, not a performance guarantee | Paper's fixed-bidder model predicts seller sacrifice and depends on extra entry/bidding for its value proposition | Amsterdam field study found no higher positive-bid entry in its setting | Different mechanisms; transfer unknown | Supported only within each study/model | Do not import a participation-uplift assumption into BidBack | C-006, C-036, C-044 |
| Identity | Address-level state plus external reputation adapter; no actor oracle | Address/account-level implementations; no cross-wallet actor proof located | Same broad limitation for on-chain examples | Similar limitation | Supported / unresolved beyond wallets | Neither product should be characterized with actor-level abuse assurances from wallet data alone | C-034, C-067 |
| Same-wallet self-outbid | Current leader may step up; II does not increase for that action | Aavegotchi FAQ permits it; paper reports it and models non-profitability under stated assumptions | Not central | Different reward effect | Supported | A permitted behavior is not evidence of an exploit | C-010, C-033, C-037 |
| Farming | P4 identifies a winner-actor sibling channel in D6; no mitigation selected | Same-wallet self-outbid is permitted in Aavegotchi; paper derives a model result | TopBidder adds token-mining incentives | Unknown at actor level | Partially supported / unresolved | Permitted behavior and incentive overlays do not establish profitable exploitation | C-033, C-035, C-037, C-046, C-067 |
| Shill / wash | No current BidBack actor-level assurance | Paper derives non-profitability under stated assumptions; quantified attributed incident not located | No selected precedent adds transferable evidence | Unknown in the field | Model supported; field evidence not located | Do not turn theory into production assurance | C-035, C-075 |
| Sybil | Feasible actor-blind models fail the bounded D6 P4 condition | Same-address measurements cannot detect common control across addresses; quantified incident not located | On-chain precedents share address/person limits | Unknown in the field | BidBack diagnostic supported; GBM field question unresolved | Wallet-level evidence cannot resolve actor-level exclusion | C-034, C-067 |
| Collusion | No selected mitigation or assurance | Quantified attributed incident not located | No transferable field evidence in selected precedents | Unknown | not located in bounded search | Absence of located evidence is not absence of risk | C-076 |
| Custody | Separate escrow and NFT vault responsibilities | Aavegotchi facet/diamond arrangement and deployment-specific custody | Varies | Different architecture | Supported | No inference that one architecture's controls transfer to another | C-015, C-022 |
| Settlement | Finalization calculates fee, assigned rewards, seller proceeds and pull exits | Sequential incentive accounting plus final winner/seller settlement | Varies | Different | Supported | Accounting invariants must be compared end to end | C-013, C-014, C-015, C-021, C-022 |
| On-chain/off-chain computation and payment | Current MVP settlement is on-chain with local/testnet scope | Web3 contracts across chains; the inspected Aavegotchi path includes backend-signed bid authorization; the fiat variant used payment authorization and promotional credits | Amsterdam has off-chain historical use | Version-specific | Supported | “GBM” denotes a family of deployments, not one invariant computation or payment rail | C-020, C-022, C-047 |
| Integration model | Modular marketplace MVP | Cryptograph product, white-label integrations, partner code and later open protocol | TopBidder standalone protocol | Different history | Supported at announcement level; durability mixed | Architecture and commercial distribution are separate questions | C-018, C-025, C-026, C-040, C-065 |
| Standalone vs embedded | BidBack is currently its own marketplace MVP | GBM alternated between owned product, embedded/white-label integration and open protocol | Mixed | Different | Supported | Logo count does not measure sustained marketplace activity | C-025, C-040, C-065 |

### 5.1 GBM reference formulas and constraints

The March 2026 paper describes a reward rate selected from the relationship between the prior standing bid `x` and new bid `y`, bounded by configured minimum and maximum incentive rates. It requires `y >= alpha*x`, with `alpha = 1 + step_min`, and gives `step_min >= inc_max` as the stated solvency condition. The opening standing bid receives the maximum configured incentive rate if displaced. The paper's fixed-bidder benchmark predicts seller revenue below the English-auction benchmark by an amount approximately tied to the incentive parameter; its value proposition therefore depends on inducing additional entry or bidding. These are model results under stated assumptions, not universal field facts. [C-021, C-035, C-036, C-057, C-061, C-062]

The inspected Aavegotchi code follows the core sequential pattern but contains integration-specific payment splits, backend authorization and operational rules. After subtracting recorded auction debt from the highest bid, that facet directs 5% of the remaining proceeds to a burn address, 40% to Pixelcraft, 40% to player rewards and the remainder (nominally 15%) to the DAO treasury. This is Aavegotchi-specific, not the reference paper's general seller rule. The fiat terms instead describe a payment authorization, a later balance obligation for the winner and promotional credit when reserve conditions are met. Those differences prevent one payment/custody statement from covering every GBM-labelled auction. [C-022, C-047, C-064]

## 6. Empirical Adoption and Behavior Evidence

### 6.1 Aavegotchi Haunt 2 study

The strongest located quantitative evidence is E. Bessire's March 2026 paper, **“The GBM Auction,”** and its supplementary material. The author discloses being a co-inventor of GBM and a principal at the company. The disclosed connection does not erase the evidence; it raises the need for replication and careful separation of reported measurements from independent confirmation. [C-028]

The study covers simultaneous 72-hour Aavegotchi Haunt 2 portal auctions from 26–29 August 2021. After excluding special IDs and Degen auctions, it reports 11,900 auctions, 67,200 accepted bids, 2,563 wallet addresses, 44,965 incentive payments and approximately 434,236 GHST in incentives, reported as about $869,000. A wallet address is not necessarily a person. [C-029]

| Treatment | Auctions | Minimum incentive | Maximum incentive | Minimum bid step | Median final sale | Median seller revenue | Median seller share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| English | 1,190 | 0% | 0% | 5% | 100.0 GHST | 100.0 GHST | 100.0% |
| LOW | 3,571 | 0.5% | 5% | 5% | 115.4 GHST | 108.2 GHST | 93.7% |
| MEDIUM | 3,569 | 1% | 10% | 10% | 142.7 GHST | 129.3 GHST | 90.6% |
| HIGH | 3,570 | 1.5% | 15% | 15% | 175.3 GHST | 155.4 GHST | 88.7% |

These are reported medians, not adjusted causal effects. LOW is the cleaner reward contrast because it retains the 5% bid step used by the English treatment. MEDIUM and HIGH jointly alter reward parameters and minimum bid steps. [C-030]

The supplement reports wallet fixed-effect coefficients of +54.95, +65.46 and +115.81 GHST for LOW, MEDIUM and HIGH respectively, with robust standard errors of 1.68, 1.84 and 2.29, across 62,460 bids and 1,746 wallets that participated in at least two treatment types. A balanced subset contains 980 wallets active in all four types and is reported to give results within 5%. These estimates compare bids from recurring wallets; they do not establish person-level treatment assignment or a general marketplace effect. [C-031]

The paper reports same-wallet self-outbids as 22.9% of accepted bids in English auctions, 15.5% in LOW, 4.6% in MEDIUM and 5.3% in HIGH. This is evidence about the same address only. It cannot detect one actor using multiple addresses, and a lower observed rate does not prove actor-level resistance. [C-033]

### 6.2 Study limitations and reproducibility

The study's main limitations are material to interpretation:

- bidders could filter and choose among auction types rather than being assigned as persons;
- assets and bidders were crypto-native and self-selected, with speculative and affiliated-value features that weaken standard private-value assumptions;
- simultaneous auctions shared a bidder pool, preventing a clean test of whether rewards increased aggregate entry;
- MEDIUM and HIGH confound incentive rates with larger bid steps;
- the data are address-level;
- the paper's numerical-method section contains a literal `[repository URL]` placeholder, so the review did not receive an executable repository location from the document;
- no independent peer-reviewed replication of this Haunt 2 analysis was located in the bounded search.

The paper and supplement were directly inspected and their core counts, treatment table and regression table were cross-checked against each other. The absence of a supplied analysis location is a reproducibility limitation, not a finding that the reported numbers are wrong. [C-032, C-069]

### 6.3 Wider adoption evidence

GBM's final retrospective reports more than 90,000 auctions, more than $200 million in bidding volume and more than $6 million returned to losing bidders. A separate issuer-authored token-sale page used the nearby headlines of 80,000+ auctions, 7,000+ bidders, $200 million+ on-chain volume, $6 million+ rewards and 30+ clients. Definitions and a chain-by-chain reconciliation were not supplied in the inspected materials. [C-024]

The numbers are evidence of what GBM reported, not independent evidence that:

- bidding volume equals final settled value;
- final settled value equals seller proceeds or company revenue;
- “bidders” means deduplicated persons;
- repeated use of refunded capital has been removed;
- announced clients all reached sustained activity.

The GBM Aavegotchi case study reports 65,000 auctions, $52 million in NFT sales, $6 million in payouts and a 158% revenue increase for an early drop. Aavegotchi's own announcements corroborate repeated deployment and large issuer-authored figures, but the bounded review did not locate the underlying complete auction-level reconciliation or a design supporting the causal `+158%` wording. [C-026]

The Song A Day case study compares 100 earlier English auctions with 100 later GBM auctions and reports average sale price rising from $118 to $396 and net revenue from roughly $11,870 to $35,534. It is a before/after comparison with changing works, dates, audience and ETH/USD conditions, not randomized evidence. [C-027]

An independent 2022 Aavegotchi ecosystem study analyzed 3,241,236 transactions and 31,464 addresses across five contracts from February 2021 to February 2022. It found activity spikes around GBM events and later decline. Multiple events and design changes overlap, so the evidence does not attribute the rise or decline to GBM. Addresses remain addresses, not persons. [C-038]

The 2025 GBM token sale is also a useful measurement warning: issuer-authored reporting distinguished more than $1.2 million of bidding turnover from more than $520,000 raised and more than $40,000 of bidder earnings. Raffles, XP and other campaign incentives were also documented. Recycled/refunded capital can contribute more than once to turnover. The figures are not independently reconciled here, but the categories themselves show why BidBack should keep them separate. [C-039, C-080]

### 6.4 Abuse evidence boundary

The paper derives non-profitability propositions for self-outbidding, shill/wash bidding and related strategies only inside its stated model and assumptions. Aavegotchi's FAQ also says a participant may outbid its own address to earn an incentive, provided it does not overpay. That is a documented permitted behavior, not by itself a profitable exploit. [C-033, C-035, C-037]

The bounded review did not locate a credible public incident report that identifies and quantifies a GBM sybil network, wash-bidding or shill scheme, collusive ring or ordering extraction in production. Each absence has the status `not located in bounded search`, not false. GBM documentation describing XP, referrals, raffles or abuse penalties establishes an incentive surface and operator awareness, not exploitation. [C-034, C-075, C-076, C-077]

### 6.5 Cessation and survival

The corporate liquidation and central product wind-down are direct facts. Their cause is unresolved. It would be unsupported to infer that the auction mechanism caused the liquidation, or that cessation proves bidder incentives commercially failed. It would also be unsupported to describe GBM as continuously operating as the same central product at the cutoff. The observed Aavegotchi Base transaction on 31 May 2026 shows only that one partner-level bid was recorded after the corporate resolution. [C-019, C-020, C-040]

## 7. Other Material Precedents or Competitors

Exactly three additional mechanisms passed the at-least-two-of-three proximity filter. The list is intentionally bounded and is not an exhaustive market or patent landscape.

### 7.1 Amsterdam auction

The Amsterdam auction studied by Goeree and Offerman is an ascending premium auction in which the runner-up can receive a premium tied to late-order bids, while the winner pays under the mechanism's terminal rule. It predates GBM and shows that rewarding a losing/runner-up participant inside ascending-auction economics is an established mechanism family. [C-043]

An independent online field experiment published in 2020 compared premium auctions with Vickrey auctions in a symmetric setting. It did not find premium auctions outperforming Vickrey on revenue or positive-bid entry and found lower revenue dispersion for the Amsterdam format. This is a counterweight to universal performance claims, not a direct test of GBM or BidBack. [C-044]

**Filter:** losing/runner-up participant receives value — yes; value tied to bidding order/gap — yes; internally funded auction economics — yes.

### 7.2 US20050267834A1

US20050267834A1, “Electronic Auction Loyalty and Incentive System using Demonstrated Contributions to Final Sell Price,” was published in 2005 from a 1 June 2004 priority. Its displayed claims describe points or rewards for nonwinning bidders based on bid history, demonstrated contribution and minimum increments. Status `observed in the cited register as of 26 August 2026`: `Abandoned`. It is a strong reason not to attribute the broad idea of rewarding nonwinning bid contribution to BidBack or GBM. [C-045]

**Filter:** nonwinning participant receives value — yes; value tied to bidding history/increments — yes; auction-linked incentive economics — yes.

### 7.3 TopBidder

TopBidder's April 2021 protocol description presents a perpetual radical-NFT auction. A new bid must exceed the prior one by a stated minimum; the displaced holder receives its full prior bid plus 30% of the price difference, with additional shares directed to the artist, reserve and inviter. A separate BID token-mining overlay rewards activity. The temporary holder/displaced bidder relationship, perpetual contestability and token overlay make it materially different from both GBM and BidBack. It postdates GBM's reported 2018 origin and 2020 launch. [C-046]

**Filter:** displaced participant receives value — yes; value tied to the bid difference — yes; funded within the transfer economics — yes.

## 8. What BidBack Should Not Claim

BidBack should not claim or imply any of the following:

1. That BidBack invented compensating a losing or displaced bidder, rewarding bidding history, or tying rewards to auction price movement.
2. That BidBack is the only auction to fund bidder rewards from auction economics.
3. That BidBack is “GBM with better scoring,” a GBM implementation, or economically equivalent to GBM.
4. That every losing bidder receives redistribution. Eligibility, a positive score, normalization, a cap and rounding can produce no entitlement.
5. That `premiumLift` proves causal contribution, willingness to pay, incremental seller value or the counterfactual price without a bidder.
6. That EF, ET, II or `finalScore` is direct marginal price contribution.
7. That wallet-level winner exclusion is actor-level winner exclusion.
8. That any current model is sybil proof, sybil resistant, farming proof, collusion proof or shill proof.
9. That fully refundable deposits remove capital cost, timing risk, transaction cost, opportunity cost or coordination risk.
10. That the Aavegotchi study proves rewards alone caused all reported bid or revenue differences.
11. That the study's 2,563 wallets are 2,563 distinct people.
12. That GBM's more than $200 million bidding-volume headline is settled sales, seller proceeds, company revenue or distinct capital.
13. That every announced GBM integration launched, every launch achieved observable activity, or every active integration persisted.
14. That GBM's liquidation or product wind-down was caused by its incentive mechanism.
15. That no GBM abuse occurred because none was located in this bounded review.
16. That theoretical non-profitability under GBM's model establishes production behavior across coordinated wallets, ordering actors or non-financial objectives.
17. That the observed patent-family status, ownership or scope is conclusively resolved by aggregator pages or by the company liquidation.
18. That an observed mechanism difference provides an exclusivity right or a legal conclusion.

## 9. Potential BidBack Differentiation

The following are bounded descriptions, not market-superiority or exclusivity claims. Each is framed only as an **observed difference**, a **potential positioning distinction**, or a **difference within reviewed corpus**.

| Potential positioning distinction | Accurate bounded formulation | Boundary |
| --- | --- | --- |
| Premium-only funding | “BidBack can fund fees and redistribution only from auction premium above the starting price; if no premium is created, neither is funded.” | Current configured costs are zero; future configured costs must remain inside the net-premium definition. |
| Conditional rather than per-displacement rewards | “BidBack forms no bidder reward obligation during live bidding. A pool may arise only after finalization and only if its threshold conditions pass.” | A pool is not guaranteed, and an eligible pool may not be fully assigned. |
| Full losing-cap recovery | “A losing bidder's locked cap remains fully refundable independently of whether it earns redistribution.” | This does not remove transaction, timing, opportunity or coordination costs. |
| Winner identity exclusion | “The final winner identity is omitted from redistribution scoring.” | This does not establish actor-level exclusion across wallets. |
| Score/trace separation | “BidBack separates an observed mechanical premium-lift trace from the EF/ET/II/reputation score used for allocation.” | Neither object is presented as causal contribution. |
| Seller remainder | “Only assigned redistribution reduces seller proceeds; cap remainder and integer dust remain with the seller.” | The distinction must be communicated alongside the candidate-pool headline. |
| Post-close pull exits | “Refunds, proceeds, fees, NFT release and redistribution are claimed through bounded post-finalization paths.” | This is an architectural property, not evidence of production security. |
| Modular responsibilities | “Custody, escrow, distribution, reputation and parameter control are separated in the MVP architecture.” | The MVP remains pre-beta and has no confirmed external audit or production governance. |

The defensible umbrella wording is: **“BidBack uses a premium-funded, post-close redistribution design that is observably different from per-displacement bidder-incentive auctions in the reviewed corpus.”** It should always be followed by the refund, winner-exclusion and non-causal-scoring qualifications. [C-048]

## 10. Adoption / GTM Lessons

These are evidence-bounded adoption lessons, not a GTM strategy.

1. **Track states separately.** Use an explicit funnel of announced → integrated → launched → observable auction activity → settled value → repeat activity. GBM's public record contains examples at every stage, and substituting one for another materially overstates adoption.
2. **Define money measures before publishing them.** Record submitted-bid turnover, distinct deposited capital, final price, settled value, seller proceeds, fees, assigned redistribution, claimed redistribution and refunds separately. Recycled refunded capital can appear in turnover more than once.
3. **Do not translate wallet counts into people.** Report addresses or connected wallets with the measurement window and deduplication rule. Any person-level estimate needs additional evidence and consent-aware methodology.
4. **Separate mechanism activity from campaign subsidy.** XP, raffle, referral or token rewards can increase actions while making organic demand harder to interpret. Label any overlaid incentive and preserve an unblended series.
5. **Recurring inventory creates better evidence than logo count.** Aavegotchi's repeated drops and secondary auctions and Song A Day's recurring cadence provide more interpretable usage histories than one-off integration announcements. This is an observed pattern, not a universal commercial rule.
6. **Retain auction-level reconciliation.** Headline aggregates without definitions or exports are difficult to audit later, especially across chains and changing implementations.
7. **Measure post-incentive continuity.** A launch spike and later decline do not identify a cause. Cohort recurrence and activity after a campaign are needed before describing retention.
8. **Keep operator continuity distinct from contract continuity.** A partner contract can continue after a central vendor winds down. Support, maintenance, governance and ownership evidence require separate fields.
9. **Use controlled experience language for V1.** The current BidBack gate is a controlled local demonstration with one bounded Base Sepolia cycle, not beta or production. Competitive evidence does not advance that gate.
10. **Seller access and bidder access are separate observations.** Repeated seller inventory is visible in Aavegotchi drops/secondary auctions and Song A Day's cadence, while bidder activity largely appears inside existing partner communities. The corpus provides no deduplicated person-level acquisition measure for either side. [C-026, C-027]
11. **Partner distribution and standalone demand are not interchangeable.** GBM's history moved across an owned product, white-label/partner integrations, a fiat product and an open protocol. The evidence shows partner dependence in much of the observable activity but does not isolate whether that dependence caused later pivots or cessation. [C-018, C-020, C-025, C-040]
12. **Event liquidity is not durable marketplace liquidity.** Large simultaneous drops can concentrate bidding and produce visible spikes; the Aavegotchi ecosystem study also observes later decline. Neither fact by itself measures sustained two-sided liquidity or its cause. [C-028, C-038]
13. **The marketplace chicken-and-egg question remains unresolved.** Existing collections/games supplied inventory and communities, but the bounded evidence does not quantify whether GBM independently acquired durable sellers and bidders outside those ecosystems. [C-024, C-026, C-041]
14. **Mechanism messaging needs metric qualifiers.** “Bid-to-earn,” bidding volume and bidder counts can each be technically accurate while referring to different economic objects. The corpus supports explicit definitions; it does not establish a measured user-confusion rate. [C-024, C-039]
15. **Observed user confusion was not located.** FAQs explain self-outbidding and incentives, but an explanatory FAQ is not itself proof that users were confused. No controlled comprehension or support-ticket evidence was found in the bounded search. [C-037, C-078]

## 11. Prior-Art / IP Family Screen

### 11.1 Nature and search boundary

This is a descriptive screen of public records, not a legal opinion. The bounded search used names of the product and company; the three named inventors; phrases around incentivized bidding, standing bids, losing-bidder rewards, final-sale-price contribution and auction loyalty; linked citations; and classification neighborhoods shown by the located family pages. The primary auction classification inspected was `G06Q30/08` (auctions). Additional displayed neighborhoods included `G06F16/2379` (online database updates), `G06Q20/02` and `G06Q20/401` (payment/transaction verification), `H04L9/50` (hash chains/blockchains), `G06Q2220/00` and `H04L2209/56` (cryptographic business/payment processing). The screen grouped publications sharing the GBM application chain and separately retained earlier non-family material.

Live register data can change after the cutoff. Every status statement below means only **`observed in the cited register as of 26 August 2026`**. Google Patents is an aggregator. USPTO Patent Center states that identity verification is required for all users from 11 September 2025; the review did not obtain and inspect the current official US file wrapper. [C-049]

### 11.2 Parties and assets must remain separate

| Category | Observed record | Limit | Evidence / Claim |
| --- | --- | --- | --- |
| Product / mechanism name | GBM Auction; historical Cryptograph references | A brand or product name does not identify a legal owner of every asset. | G01, G22, G23; C-018, C-086 |
| Operating entity | Perpetual Altruism Ltd, company 11219425 | Liquidation does not itself establish disposition of a patent application or code rights. | G20, G21, G39; C-019, C-081 |
| Inventors displayed on family pages | Guillaume Gonnaud, Edouard Bessire, Hugo McDonaugh | Inventorship is distinct from applicant and assignee fields. | G22, G23; C-085 |
| Applicant at filing displayed | Perpetual Altruism Ltd | The entry is an aggregator display and was not independently reconciled with an official filing copy. | G22, G23; C-082 |
| Original assignee displayed | Perpetual Altruism Ltd | Separate from the applicant-at-filing and later assignment-event fields. | G22, G23; C-083 |
| Current assignee displayed | Perpetual Altruism Ltd | Aggregator display was not reconciled with the live official file history or insolvency records. | G22, G23; C-071 |
| Assignment event displayed | Assignment of assignors' interest to Perpetual Altruism Limited on 5 September 2024 | Event display does not resolve later control or insolvency disposition. | G22; C-084 |
| Aavegotchi implementation notice | Repository attributes GBM IP to Perpetual Altruism and describes transparency/licensing conditions | Repository notice is version-specific and not a chain-of-title determination. | G07, G08; C-087 |

### 11.3 GBM-linked family

| Family item | Observed bibliographic data | Status wording and limitation | Evidence / Claim |
| --- | --- | --- | --- |
| Earliest priority | GB1812796.9 / GB201812796D0, “Cryptograph,” 7 August 2018 | Bibliographic event shown on the family pages. | G22, G23; C-050 |
| Additional GB priority | GB1910210.2 / GB201910210D0, “Cryptograph II,” 17 July 2019 | Bibliographic event shown on the family pages. | G22, G23; C-088 |
| PCT application | PCT/GB2019/052174, filed 2 August 2019 | Family record. | G22, G23; C-089 |
| PCT publication | WO2020030891A1, published 13 February 2020 | Status: `observed in the cited register as of 26 August 2026` — `Ceased`; this is the aggregator's display. | G23; C-070, C-090 |
| US application/publication | US application 15/734,382, filed 2 August 2019; US20210174432A1, published 10 June 2021 | Status: `observed in the cited register as of 26 August 2026` — `Pending`; the official live file wrapper was not inspected. | G22; C-051, C-091, C-093 |
| Jurisdictions displayed | US and WO entries on the family pages inspected | No broader national-phase register search was completed. | G22, G23; C-092 |

The review treats these as one family for counting and analysis. The corporate liquidation does not answer whether the cutoff status later changes, who may control the application, or how any insolvency process treats it. Those points remain unresolved in this checkpoint. [C-051, C-070, C-071]

### 11.4 Independent-claim screen

On the US page inspected, claims 1–24 are shown as canceled. Displayed independent claim 25 describes a computer-implemented auction that receives an initial standing bid, promotes later bids above a threshold, repeats until a condition, receives final payment from the final standing bidder, makes incentive payments to parties associated with each standing bid other than the final one, and provides the seller the final payment less those incentives. Displayed dependent claims add, among other details, immediate payments, an incentive based on an increment, time extension, a digital item, blockchain records, a current-bid reference, cryptocurrency and fully funded bids. [C-052]

Displayed independent claim 48 describes bidding for a previously purchased digital item, repeated standing-bid promotion, an incentive to a party associated with the prior standing bid, and seller termination. Its displayed dependent claims add retraction/penalty, full funding and commission features. This second claim cluster is closer to perpetual-resale/displacement designs than to BidBack's ordinary terminal auction. [C-053]

### 11.5 Descriptive claim-theme map

| Family | Member / claim | Incentive trigger | Funding flow | Calculation | Eligibility | Asset / escrow / network elements | Descriptive technical overlap | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GBM-linked family, earliest priority 7 Aug 2018 | US20210174432A1, displayed independent claim 25 | A received bid becomes the standing bid only above a threshold; incentive payments relate to nonfinal standing bids | Final payment funds incentive payments; seller receives final payment less their sum | No numeric formula in the independent claim; displayed dependent matter links an incentive to a portion of an increment | Parties associated with each standing bid other than the final standing bid | Independent claim uses a server, terminals and a general item; displayed dependent matter adds digital items, blockchain records, cryptocurrency and fully funded bids | Broad overlap in repeated threshold bidding, nonfinal-party incentives and seller residual. Observed differences: BidBack creates no live-bid entitlement, restricts funding to net premium, excludes the winner identity across scoring, calculates EF/ET/II/reputation at close and uses pull claims | G22; C-052, C-054 |
| GBM-linked family, earliest priority 7 Aug 2018 | US20210174432A1, displayed independent claim 48 | A higher bid replaces the prior standing bid and an incentive relates to the previous standing bid; seller command terminates the auction | Independent claim states the prior-standing-bid incentive; displayed dependent matter adds bid funding, seller payment and commissions | No numeric formula in the independent claim; displayed dependent matter links incentive to a portion of the bid increase | Party associated with the previous standing bid | Previously purchased digital item; displayed dependent matter adds full funding, blockchain records, smart contracts and cryptocurrency | Broad overlap in displaced-bidder value only. Observed differences: claim cluster is perpetual/resale-oriented, while BidBack is time-bounded, terminal, premium-only, post-close and losing-identity scored | G22; C-053, C-054 |

The screen found credible descriptive technical overlap with part of the broad V1 problem space. It also found multiple differences within the reviewed corpus. The map is not a claim chart and supports no legal conclusion. [C-054]

### 11.6 Four-part expert-review threshold

The threshold is conjunctive:

| Criterion | Checkpoint result | Reason |
| --- | --- | --- |
| 1. Pending or apparently active family in a materially relevant jurisdiction | **Not established for V1 scope** | US status `observed in the cited register as of 26 August 2026`: `Pending`; BidBack has not selected the US or another reviewed jurisdiction as materially relevant V1 launch scope. |
| 2. Credible descriptive technical overlap with essential V1 scope | **Yes, bounded** | Broad ascending-bid, nonfinal-party incentive and seller-residual elements overlap descriptively. Funding, accrual, beneficiary and settlement differ. |
| 3. Plausible commercial stake | **Not established for V1 scope** | Current approved status is controlled-experience readiness, without selected production market, monetization scope or commercial launch. |
| 4. Remaining uncertainty impossible to resolve in factual checkpoint | **Yes for live file history and legal interpretation** | The official live US wrapper and legal analysis were outside this checkpoint. |

Because all four are not met, targeted expert review is **not recommended now** and V1 should not be delayed on this basis. At the `Scale / Production concern` checkpoint, rerun the threshold after a launch jurisdiction and commercial scope are selected. Only if all four are then met should the conclusion be: **`targeted expert review warranted before the affected scope`**. [C-055, C-072, C-073]

## 12. Findings, Materiality and V1 Actions

### 12.1 Findings

| Finding | Evidence-backed conclusion | Materiality | Does this finding actually require action before a credible, attractive and reasonably safe V1? | Steering implication |
| --- | --- | --- | --- | --- |
| F-01 — Close comparator, different mechanism | GBM is a close deployed comparator, but per-displacement accrual from final-bid economics differs from BidBack's conditional post-close net-premium pool and EF/ET/II allocation. | `V1-relevant` | **No mechanism change.** Accurate explanation is required before external positioning. | Preserve baseline vocabulary and comparison boundaries. |
| F-02 — Empirical signal with identification limits | Haunt 2 reports higher bids/revenue in incentive treatments and lower same-wallet self-outbids, but selection, confounding, wallet identity and setting limit attribution. | `V1-relevant` | **No.** It supports disciplined hypotheses and measurement, not adoption of GBM logic or a V1 redesign. | Treat the paper as evidence to assimilate, not a performance guarantee. |
| F-03 — Aggregate adoption is not reconciled | GBM reported substantial auctions, bidding turnover and payouts, but definitions and complete reconciliation were not located. | `V1-relevant` | **No product mechanism action.** Metric definitions are a strong V1 enabler. | Keep turnover, settled value, proceeds, refunds and people/address measures separate. |
| F-04 — Abuse evidence remains bounded | Theory and same-wallet observations do not resolve coordinated-wallet behavior. No quantified public incident was located in the bounded search. | `V1-relevant` | **No new action from this review.** P4 already captures the relevant BidBack observability boundary. | Do not reopen P4/P5 or market actor-level assurances. |
| F-05 — Operator cessation is not mechanism causation | Perpetual Altruism Ltd entered liquidation and the central products were wound down, while partner activity remained observable. Cause is unresolved. | `Informational` | **No.** It warrants continuity-aware interpretation, not mechanism redesign. | Avoid both “GBM failed” and “GBM is still operating unchanged.” |
| F-06 — Earlier bidder-reward precedents exist | Amsterdam-auction literature and a 2004-priority auction-loyalty publication predate GBM; TopBidder provides a later adjacent implementation. | `V1-relevant` | **No engineering action.** Positioning claims must remain narrow. | Use potential positioning distinctions only. |
| F-07 — GBM-linked family deserves a later checkpoint | A US entry carrying the cutoff status recorded in Section 11 has broad descriptive overlap plus material mechanism differences. Current V1 has no selected material jurisdiction or commercial stake. | `V1-relevant` | **No, at current scope.** The four-part threshold is not met. | Recheck under `Scale / Production concern` after jurisdiction and commercial scope selection. |
| F-08 — No blocker threshold crossed | No finding satisfies all five blocker conditions. | `Informational` | **No.** Proceed with the already selected next workstream. | Use exit 1. |

There are **zero** findings categorized as `Material blocker candidate`.

### 12.2 Actions by horizon

| Horizon | Action | Owner / trigger | Scope boundary |
| --- | --- | --- | --- |
| `Must-have V1` | **None created by this review.** | — | Existing approved readiness requirements remain authoritative. |
| `Strong V1 enabler` | Adopt a metric dictionary separating bids, addresses, declared participants, distinct deposited capital, bidding turnover, final settled value, seller proceeds, fees, assigned/claimed redistribution and refunds. | Premium Controlled-Experience Readiness | Instrumentation/definition only; no economic-model redesign. |
| `Strong V1 enabler` | Keep external mechanism wording consistent with Sections 8 and 9, including the non-causal score/trace boundary and wallet/actor boundary. | Any copy or demo review | No competitive superiority or exclusivity language. |
| `Strong V1 enabler` | Retain auction-level reconciliation sufficient to reproduce every published aggregate. | Premium Controlled-Experience Readiness | No public launch commitment implied. |
| `Post-V1 improvement` | If a later approved study is run, compare recurring cohorts and post-incentive behavior using predeclared measures and explicit treatment/version labels. | Separate approved evidence lot | No simulator or parameter search is authorized here. |
| `Scale / Production concern` | Re-run the four-part family threshold when launch jurisdiction, commercial scope and material features are selected; inspect relevant official registers at that time. | Scope-selection gate | If and only if all four criteria pass: `targeted expert review warranted before the affected scope`. |

No P4/P5 mitigation, identity architecture, Candidate F, Lot G, parameter change or Solidity change follows from these actions.

## 13. Unknowns, Contradictions and Limitations

| Topic | What is known | What remains unknown / contradictory | Consequence |
| --- | --- | --- | --- |
| GBM aggregate performance | Issuer-authored totals and several partner case studies exist | Definitions, complete exports, duplicate-capital handling and independent reconciliation were not located | Use reported-as wording and precise metric labels |
| Haunt 2 reproducibility | Paper and supplement provide detailed tables and methods | Literal repository placeholder; no independent replication located | Do not elevate estimates to universal forecasts |
| Entry effect | Shared simultaneous auctions and wallet movement are observed | Whether incentives increased total distinct-person entry is unresolved | No acquisition/entry causal claim |
| Same-wallet behavior | Paper reports treatment differences | Cross-wallet common control is unobserved | No actor-level conclusion |
| Abuse incidents | Theory, FAQ permissions and campaign surfaces are documented | No quantified attributed incident located | Absence of located evidence is not evidence of absence |
| Integration counts | Multiple announcements, launches and contracts exist | Current state and sustained usage of every named integration are unresolved | Keep per-integration state and date |
| Song A Day timing | Creator described a recent switch in Jan 2023 | Retrospective broadly says 2022 | A preparation/go-live split is plausible but not established |
| myNFT | Funding, intended launch and retrospective account exist | Exact go-live date, activity series and reason for shelving were not located | Do not count funding announcement as adoption |
| The Sandbox / Equippo outcomes | Published launch/event accounts exist | Final settled results were not located | Do not infer volume from lot count |
| Wind-down cause | Corporate records and retrospective establish cessation events | Economic, operational and governance causes are unresolved | No causal claim about mechanism |
| Contract continuity | Specific post-resolution activity exists | Ongoing maintenance, support and all later activity are unresolved | Date every activity statement |
| Fiat GBM | Terms show authorization, balance and promotional-credit structure | Complete settlement/risk behavior across events is not documented here | Do not generalize Web3 full-funding logic |
| GBM family live status | Cutoff status wording and labels are recorded in Section 11 | Official current US file history was not inspected; post-liquidation control is unresolved | Recheck official records only when scope becomes material |
| National coverage | US and WO pages were inspected | Broader national-phase coverage was not completed | This is not a complete landscape |
| Earlier mechanisms | Three close precedents passed the filter | The search is bounded and cannot prove completeness | Use “within reviewed corpus” language |
| BidBack model | Current baseline and `no-current-candidate-acceptable` are documented | A future acceptable redistribution model is not selected | Do not imply this review selects one |

## 14. Claim Ledger

Statuses are limited to the vocabulary defined in Section 2. A dash means no contradicting evidence was identified for that proposition; it is not a completeness assertion.

| Claim ID | Proposition | Version / period | Supporting Evidence IDs | Contradicting Evidence IDs | Status | Confidence | Caveat | Finding |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-001 | BidBack's final price is the highest valid cap and an own-cap increase deposits only the delta. | `solidity-baseline-v1` | B04 | — | supported | High | Current authoritative baseline only. | F-01 |
| C-002 | BidBack's minimum next cap is the standing high plus a floored basis-point increment bounded below by one unit. | `solidity-baseline-v1` | B04 | — | supported | High | Parameter values are snapshotted per auction. | F-01 |
| C-003 | BidBack's accepted-trace premium lifts sum mechanically to gross premium but are not a causal or score measure. | `solidity-baseline-v1` | B04, B06 | — | supported | High | Equality applies to a completed accepted trace. | F-01 |
| C-004 | BidBack gross premium is the positive part of final price minus starting price. | `solidity-baseline-v1` | B04 | — | supported | High | Integer arithmetic and actual settlement inputs govern. | F-01 |
| C-005 | BidBack charges no fee without gross premium and currently deducts no additional configured costs. | `solidity-baseline-v1` | B04 | — | supported | High | A future approved cost configuration could change the second fact. | F-01 |
| C-006 | BidBack forms a candidate pool only after net-premium, participant-count and duration conditions pass. | `solidity-baseline-v1` | B04 | — | supported | High | Candidate pool is not assigned distribution. | F-01 |
| C-007 | BidBack skips the winner identity before redistribution scoring. | `solidity-baseline-v1` | B04 | — | supported | High | Identity-level result only. | F-04 |
| C-008 | BidBack EF is a bounded squared ratio of losing cap to final price. | `solidity-baseline-v1` | B04 | — | supported | High | Independent integer floors apply. | F-01 |
| C-009 | BidBack ET uses exposure to the initial end time, not extension time. | `solidity-baseline-v1` | B04 | — | supported | High | Minimum-exposure and cap rules also apply. | F-01 |
| C-010 | BidBack II counts bounded takeovers of another current leader. | `solidity-baseline-v1` | B04 | — | supported | High | Opening bids and current-leader step-ups do not increment II. | F-01 |
| C-011 | BidBack `finalScore` is the floored EF/ET/II weighted score multiplied by live reputation. | `solidity-baseline-v1` | B04 | — | supported | High | Adapter address is snapshotted; score input is read at finalization. | F-01 |
| C-012 | BidBack allocates proportionally by positive losing `finalScore`, applies a per-user cap and does not reallocate cap remainder or dust. | `solidity-baseline-v1` | B04 | — | supported | High | Zero-rounded allocations are omitted. | F-01 |
| C-013 | Only BidBack's assigned distribution reduces seller proceeds; unassigned candidate remainder stays with the seller. | `solidity-baseline-v1` | B04 | — | supported | High | Fee is separately deducted. | F-01 |
| C-014 | Every BidBack loser can recover its entire locked cap independently of reward entitlement. | `solidity-baseline-v1` | B04 | — | supported | High | Does not measure transaction or opportunity costs. | F-01 |
| C-015 | BidBack separates auction, escrow, NFT, distribution, reputation and parameter responsibilities and uses pull exits. | MVP at 25 Aug 2026 | B01, B03, B04 | — | supported | High | Code presence is not production assurance. | F-01 |
| C-016 | BidBack bounds participant work and anti-sniping extension; the documented default maximum participant count is 64. | `solidity-baseline-v1` | B04 | — | supported | High | Default is not every future deployment configuration. | F-01 |
| C-017 | Economic Model V1 ended `no-current-candidate-acceptable`. | Decision through 25 Aug 2026 | B05, B06 | — | supported | High | This review does not reopen that decision. | F-04 |
| C-018 | GBM's retrospective attributes the mechanism's 2018 Cryptograph origin to Gonnaud, Bessire and McDonaugh. | 2018–2026 retrospective | G01 | — | partially supported | Medium | Direct founder account; no independent contemporaneous 2018 record inspected. | F-01 |
| C-019 | Perpetual Altruism Ltd entered creditors' voluntary liquidation with liquidators appointed on 5 March 2026. | 5 Mar 2026 | G20, G21 | — | supported | High | Does not identify cause or asset disposition. | F-05 |
| C-020 | An Aavegotchi bid transaction using its registered GBM address was observable on Base on 31 May 2026. | 31 May 2026 | G11, G12 | — | supported | High | One transaction does not establish later continuity or aggregate adoption. | F-05 |
| C-021 | In the GBM paper's reference auction, a standing bid's potential incentive is set from that bid and the immediately preceding standing bid. | Mar 2026 reference model | G02, G03 | — | supported | High | The amount becomes payable only if that standing bid is later displaced; deployments vary. | F-01 |
| C-022 | The inspected Aavegotchi implementation follows sequential full-bid, refund and incentive accounting with integration-specific rules. | Repository snapshot through cutoff | G07, G08 | — | supported | High | Code branch/version and production deployments must be matched separately. | F-01 |
| C-023 | Archived GBM protocol documentation proposed a 2% final-winning-bid fee plus publishing fee. | Protocol-doc period, pre-wind-down | G06 | — | partially supported | Medium | Proposed protocol business model; not every historical integration. | F-01 |
| C-024 | GBM reported headline aggregates above $200 million bidding volume, 90,000 auctions and $6 million bidder returns. | By 26 Aug 2026 | G01 | — | partially supported | Medium | The fact supported is the issuer's report, not independent reconciliation. | F-03 |
| C-025 | Public GBM integration evidence spans announcements, governance approvals, launches and usage states that are not interchangeable. | 2021–2026 | G01, G30, G31, G32 | — | supported | High | Status must be determined per partner and date. | F-03 |
| C-026 | Aavegotchi repeatedly deployed GBM and reported large auction/sales/payout aggregates. | 2021–2024 | G10, G15, G16, G17, G34, G37 | — | partially supported | Medium | Deployment is corroborated; performance totals are not fully reconciled here. | F-03 |
| C-027 | Song A Day's before/after case study reports higher average sale price and net revenue after adopting GBM. | Approx. 100 auctions before and 100 after, 2022–2023 | G13 | — | supported | High | Design is uncontrolled; works, period, audience and exchange rate differ. | F-02 |
| C-028 | The March 2026 GBM paper is author-connected and analyzes Haunt 2 auctions from 26–29 August 2021. | Paper dated Mar 2026; event Aug 2021 | G02, G03 | — | supported | High | Connection is disclosed; independent peer review not located. | F-02 |
| C-029 | The Haunt 2 sample reports 11,900 auctions, 67,200 accepted bids and 2,563 wallet addresses after exclusions. | 26–29 Aug 2021 | G02, G03 | — | supported | High | Wallets are not persons. | F-02 |
| C-030 | Reported median final sale and seller revenue rise across English, LOW, MEDIUM and HIGH treatments. | 26–29 Aug 2021 | G02, G03 | — | supported | High | MEDIUM/HIGH also change minimum steps; medians are not causal estimates. | F-02 |
| C-031 | The supplement reports positive within-wallet treatment coefficients on accepted bid amount. | 26–29 Aug 2021 | G03 | — | supported | High | Recurring-wallet sample and treatment selection limit generalization. | F-02 |
| C-032 | The inspected paper's numerical-method section contains the literal placeholder `[repository URL]`. | Mar 2026 paper | G02 | — | supported | High | No executable location is supplied by that field. | F-02 |
| C-033 | The paper reports lower same-wallet self-outbid shares in incentivized treatments than English. | 26–29 Aug 2021 | G02, G03 | — | supported | High | Cross-wallet common control is not observable in this measure. | F-04 |
| C-034 | A quantified, attributed public GBM sybil-network incident was not located. | Search through 26 Aug 2026 | G02, G09, G17, G35 | — | not located in bounded search | Medium | Cross-wallet control was not measurable in the main paper. | F-04 |
| C-035 | GBM's paper derives non-profitability results for self-outbid/shill/wash strategies under stated assumptions. | Mar 2026 model | G02, G03 | — | supported | High | Model result, not actor-level field confirmation. | F-04 |
| C-036 | GBM's fixed-bidder benchmark predicts lower seller revenue than its English benchmark absent induced participation effects. | Mar 2026 model | G02, G03 | — | supported | High | Depends on the paper's assumptions and parameterization. | F-02 |
| C-037 | Aavegotchi documentation permits same-user self-outbidding to earn an incentive if the user does not overpay. | Documentation observed at cutoff | G09, G34 | — | supported | High | Permission is not evidence of profitability or abuse. | F-04 |
| C-038 | An independent Aavegotchi study found GBM-event activity spikes and later decline but cannot assign a single cause. | Feb 2021–Feb 2022 data; paper 2022 | G18 | — | partially supported | Medium | Five selected contracts and address-level measurement. | F-02 |
| C-039 | GBM's 2025 token-sale reporting separates bidding turnover above $1.2 million from funds raised above $520,000. | Nov–Dec 2025 | G38 | — | partially supported | Medium | Issuer-authored figures; no independent reconciliation was located. | F-03 |
| C-040 | GBM's retrospective says the central fiat product and open protocol were wound down. | By 26 Aug 2026 | G01 | — | partially supported | Medium | Issuer-authored final account; exact cessation dates and each partner state are not supplied. | F-05 |
| C-041 | A complete independent reconciliation of GBM's headline aggregates was not located. | Search through 26 Aug 2026 | G01, G15, G38 | — | not located in bounded search | Medium | Does not mean no private or unpublished reconciliation exists. | F-03 |
| C-042 | The current operational state of every named GBM integration is unresolved. | At 26 Aug 2026 | G01, G12, G14, G30, G31, G32 | — | unresolved | Medium | Some dated activity exists; complete partner-by-partner status does not. | F-05 |
| C-043 | The Amsterdam auction literature predates GBM and gives a premium to a highest losing/runner-up bidder inside auction economics. | Published 2004; historical mechanism | G26 | — | supported | High | Exact variants differ, and it is not a BidBack test. | F-06 |
| C-044 | A 2020 field experiment found its premium-auction treatments did not raise more revenue or positive-bid entry than Vickrey. | Experiment 2016; publication 2020 | G27 | — | supported | High | Symmetric online-poster setting; not GBM or BidBack. | F-02 |
| C-045 | US20050267834A1 describes nonwinning-bidder incentives tied to contribution/bid history and has 1 June 2004 priority. | Priority 2004; publication 2005 | G25 | — | supported | High | Status `observed in the cited register as of 26 August 2026`: `Abandoned`; descriptive prior-publication evidence only. | F-06 |
| C-046 | TopBidder's 2021 design refunds a displaced holder and allocates 30% of the bid difference to that holder. | Apr 2021 description | G28 | — | partially supported | Medium | Issuer-authored protocol description; perpetual holding and token mining differ materially. | F-06 |
| C-047 | GBM's fiat terms use payment authorization, later winner balance and conditional promotional credit rather than the Web3 full-bid flow. | 2025 fiat terms | G29 | — | supported | High | Terms may be event/version-specific. | F-01 |
| C-048 | Premium-only post-close funding, full losing-cap recovery and score/trace separation are observed BidBack differences within the reviewed corpus. | Baseline and corpus at cutoff | B04, G02, G03, G08, G26, G28 | — | supported | High | Potential positioning distinction only; corpus is bounded. | F-01 |
| C-049 | The official live US application file history was not inspected in this checkpoint. | 26 Aug 2026 | G24 | — | supported | High | USPTO guidance explains current access constraints; future official inspection may change understanding. | F-07 |
| C-050 | The GBM-linked family pages show earliest priority on 7 August 2018. | 7 Aug 2018 | G22, G23 | — | supported | High | Aggregator family display; broader national-phase search incomplete. | F-07 |
| C-051 | Status `observed in the cited register as of 26 August 2026` for US20210174432A1: `Pending`. | Display at cutoff | G22 | — | partially supported | Medium | Aggregator display; current official file was not inspected. | F-07 |
| C-052 | Displayed US independent claim 25 includes repeated threshold standing bids, incentives associated with nonfinal standing bids and seller receipt of final payment less incentives. | Claims displayed at cutoff | G22 | — | supported | High | Descriptive reading of displayed text; no legal interpretation. | F-07 |
| C-053 | Displayed US independent claim 48 concerns repeated bidding for a previously purchased digital item with prior-standing-party incentive and seller termination. | Claims displayed at cutoff | G22 | — | supported | High | Closer to perpetual-displacement context; no legal interpretation. | F-07 |
| C-054 | The family has broad descriptive technical overlap with part of BidBack's V1 scope and material observed differences in funding, accrual, beneficiary treatment and settlement. | Comparative screen at cutoff | B04, G22, G23 | — | partially supported | Medium | High-level factual comparison, not a claim chart. | F-07 |
| C-055 | The conjunctive four-part targeted-review threshold is not met for current V1. | BidBack scope at 26 Aug 2026 | B01, B02, B03, G22, G23, G24 | — | supported | High | Two scope-dependent criteria are not established. | F-07 |
| C-056 | The GBM paper's reference format is a time-limited open ascending auction. | Mar 2026 reference model | G02, G03 | — | supported | High | Deployment-specific interfaces and conditions vary. | F-01 |
| C-057 | The GBM paper requires a new bid to meet `y >= alpha*x`, where `alpha = 1 + step_min`. | Mar 2026 reference model | G02, G03 | — | supported | High | Parameter notation belongs to the paper's model. | F-01 |
| C-058 | In the GBM reference auction, the final standing bidder pays the final standing bid and receives the item. | Mar 2026 reference model | G02, G03 | — | supported | High | Fiat authorization terms differ operationally. | F-01 |
| C-059 | In the GBM reference auction, a displaced standing bidder receives its bid back plus an incentive. | Mar 2026 reference model | G02, G03 | — | supported | High | This does not mean every participant that loses earns an incentive. | F-01 |
| C-060 | In the GBM reference auction, seller proceeds are the final standing bid less accumulated incentives. | Mar 2026 reference model | G02, G03 | — | supported | High | Deployment fees and other splits can differ. | F-01 |
| C-061 | The GBM paper states `step_min >= inc_max` as its solvency condition. | Mar 2026 reference model | G02, G03 | — | supported | High | Model condition; not an audit of every deployment. | F-01 |
| C-062 | The GBM paper assigns the maximum configured incentive rate to the opening standing bid if it is displaced. | Mar 2026 reference model | G02, G03 | — | supported | High | Reference-model rule; deployment configuration can differ. | F-01 |
| C-063 | An eventual GBM winner may retain incentives earned when its earlier standing bids were displaced. | Mar 2026 reference model | G02, G03 | — | supported | High | Actor identity is assumed at the address/account level in the evidence. | F-01 |
| C-064 | The inspected Aavegotchi facet splits post-debt proceeds 5% to burn, 40% to Pixelcraft, 40% to player rewards and the remainder to the DAO treasury. | Repository snapshot through cutoff | G08 | — | supported | High | Integration-specific source code; deployment matching remains separate. | F-01 |
| C-065 | GBM's retrospective links a Base explorer address as the open-protocol contract pointer. | Retrospective observed at cutoff | G01, G36 | — | partially supported | Medium | The explorer contents were not independently inspected in this review. | F-05 |
| C-066 | GBM's product documentation describes a displaced standing bidder receiving its bid back plus an incentive. | Documentation observed at cutoff | G04, G05 | — | partially supported | Medium | Pages may represent a particular product/documentation version. | F-01 |
| C-067 | P4 is the bounded D6 condition `winnerActorIndirectReward == 0`, and feasible actor-blind models fail it in the decision evidence. | Decision through 25 Aug 2026 | B05, B06 | — | supported | High | This is not a universal sybil result. | F-04 |
| C-068 | P5 passes for every consolidated Economic Model V1 model under its declared representative aggregation. | Decision through 25 Aug 2026 | B05, B06 | — | supported | High | Individual scenario outcomes and the declared existential aggregation remain distinct. | F-04 |
| C-069 | An independent replication of the March 2026 Haunt 2 analysis was not located. | Search through 26 Aug 2026 | G02, G03 | — | not located in bounded search | Medium | This does not mean no private or later replication exists. | F-02 |
| C-070 | Status `observed in the cited register as of 26 August 2026` for WO2020030891A1: `Ceased`. | Display at cutoff | G23 | — | partially supported | Medium | Aggregator display; national-phase records were not comprehensively searched. | F-07 |
| C-071 | Perpetual Altruism Ltd is the original and current assignee displayed on the family pages inspected. | Display at cutoff | G22, G23 | — | partially supported | Medium | Aggregator display was not reconciled with official live files or insolvency asset records. | F-07 |
| C-072 | BidBack has not selected a materially relevant V1 launch jurisdiction in the approved scope. | Scope at 26 Aug 2026 | B01, B02, B03 | — | supported | High | A later scope decision can change this fact. | F-07 |
| C-073 | BidBack's approved V1 scope does not establish a plausible production commercial stake. | Scope at 26 Aug 2026 | B01, B02, B03 | — | supported | High | Controlled-experience readiness is not commercial launch. | F-07 |
| C-074 | Song A Day integrated GBM in 2022. | 2022–Jan 2023 | G01 | G33 | contested | Medium | A late-2022 preparation followed by Jan-2023 go-live is plausible but not established. | F-02 |
| C-075 | A quantified, attributed public GBM wash- or shill-bidding incident was not located. | Search through 26 Aug 2026 | G02, G09, G17, G35 | — | not located in bounded search | Medium | Theoretical treatment and marketing assertions are not incident evidence. | F-04 |
| C-076 | A quantified, attributed public GBM collusion incident was not located. | Search through 26 Aug 2026 | G02, G17, G35 | — | not located in bounded search | Medium | Absence in the bounded search does not establish absence in operation. | F-04 |
| C-077 | A quantified, attributed public GBM transaction-ordering extraction incident was not located. | Search through 26 Aug 2026 | G02, G08 | — | not located in bounded search | Medium | A theoretical ordering surface is not an observed incident. | F-04 |
| C-078 | Controlled evidence of GBM user confusion was not located. | Search through 26 Aug 2026 | G04, G05, G09, G17 | — | not located in bounded search | Low | Explanatory documentation is not itself evidence of confusion or comprehension. | F-03 |
| C-079 | GBM documented its token sale on Base/USDC for 24 November–1 December 2025. | 2025 campaign | G19 | — | supported | High | Campaign schedule/design, not proof of the final result. | F-03 |
| C-080 | GBM campaign documentation describes XP, referral, raffle or related behavioral overlays around bidding activity. | 2025 campaign period | G35, G38 | — | partially supported | Medium | Overlay documentation does not quantify its causal effect. | F-03 |
| C-081 | GBM service terms identify Perpetual Altruism Ltd as the company behind the service. | Terms observed at cutoff | G39 | — | supported | High | Product-entity attribution only; it does not determine ownership of every asset. | F-05 |
| C-082 | The family pages display Perpetual Altruism Ltd as applicant at filing. | Filing 2 Aug 2019; display at cutoff | G22, G23 | — | partially supported | Medium | Aggregator display was not reconciled with an official filing copy. | F-07 |
| C-083 | The family pages display Perpetual Altruism Ltd as original assignee. | Display at cutoff | G22, G23 | — | partially supported | Medium | Applicant and assignee fields remain separate. | F-07 |
| C-084 | The US family page displays an assignment event to Perpetual Altruism Limited on 5 September 2024. | 5 Sep 2024 event; display at cutoff | G22 | — | partially supported | Medium | Event display does not resolve later control or insolvency disposition. | F-07 |
| C-085 | The family pages display Guillaume Gonnaud, Edouard Bessire and Hugo McDonaugh as inventors. | Display at cutoff | G22, G23 | — | supported | High | Inventorship is distinct from applicant and assignee. | F-07 |
| C-086 | The family pages display “Cryptograph” and “Cryptograph II” as titles of the two GB priority records. | 2018–2019 priority records | G22, G23 | — | supported | High | Bibliographic titles only. | F-07 |
| C-087 | The Aavegotchi repository notice attributes GBM IP to Perpetual Altruism Ltd and describes transparency/licensing conditions. | Repository snapshot at cutoff | G07, G08 | — | supported | High | Version-specific repository notice; not an asset-disposition record. | F-07 |
| C-088 | The family pages show an additional GB priority on 17 July 2019 for GB1910210.2 / GB201910210D0. | 17 Jul 2019 | G22, G23 | — | supported | High | Aggregator family display. | F-07 |
| C-089 | The family pages show PCT/GB2019/052174 filed on 2 August 2019. | 2 Aug 2019 | G22, G23 | — | supported | High | Aggregator family display. | F-07 |
| C-090 | The family pages show publication WO2020030891A1 on 13 February 2020. | 13 Feb 2020 | G23 | — | supported | High | Publication bibliographic fact, separate from cutoff status. | F-07 |
| C-091 | The US family page shows application 15/734,382 filed on 2 August 2019. | 2 Aug 2019 | G22 | — | supported | High | Bibliographic event, separate from cutoff status. | F-07 |
| C-092 | The inspected family pages display country-status entries for US and WO. | Display at cutoff | G22, G23 | — | supported | High | No broader national-phase register search was completed. | F-07 |
| C-093 | The US family page shows publication US20210174432A1 on 10 June 2021. | 10 Jun 2021 | G22 | — | supported | High | Publication bibliographic fact, separate from cutoff status. | F-07 |
| C-094 | The Sandbox published a July 2025 post announcing a GBM sale scheduled for 15–22 July 2025. | Jul 2025 | G30 | — | supported | High | Announcement evidence; separate auction activity and results were not located. | F-03 |

## 15. Source Register

For dynamic pages, “document date” is the date shown by the page where available; otherwise it is marked undated/current snapshot. “Event date” is the date of the underlying event relevant to this review.

| Evidence ID | Title | Publisher / origin | URL / archive | Document date | Event date | Access date | Nature | Tier | Limits |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |
| B01 | BidBack Product Status | BidBack repository | [PRODUCT_STATUS.md](./PRODUCT_STATUS.md) | 25 Aug 2026 checkpoint | Through 25 Aug 2026 | 26 Aug 2026 | Current internal status authority | 1 | Repository state; later evidence can supersede it. |
| B02 | BidBack Roadmap | BidBack repository | [ROADMAP.md](./ROADMAP.md) | Current repository snapshot; no explicit page date | Current gate model | 26 Aug 2026 | Internal gate authority | 1 | Defines gates, not a delivery schedule. |
| B03 | Architecture Decisions | BidBack repository | [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md) | Current repository snapshot; no explicit page date | Current open decisions | 26 Aug 2026 | Internal architecture register | 1 | Explicitly does not freeze final choices. |
| B04 | BidBack Economic Model V1 — Solidity Baseline Specification | BidBack repository | [ECONOMIC_MODEL_V1_SPEC.md](./ECONOMIC_MODEL_V1_SPEC.md) | Version `1.0.0-draft` | Solidity baseline at Lot A | 26 Aug 2026 | Authoritative internal specification | 1 | Solidity remains ultimate behavioral authority. |
| B05 | Economic Model V1 Decision Record | BidBack repository | [ECONOMIC_MODEL_V1_DECISION.md](./ECONOMIC_MODEL_V1_DECISION.md) | Current decision record | Evidence through Lot F | 26 Aug 2026 | Internal decision authority | 1 | Selects no model and authorizes no new mechanism. |
| B06 | Economic Model V1 — Python baseline and deterministic scenarios | BidBack repository | [README.md](../economic-model/README.md) | Current repository snapshot | Lots B–F | 26 Aug 2026 | Internal evidence/method boundary | 1 | Python twin is subordinate to Solidity. |
| B07 | BidBack Agent Instructions | BidBack repository | [AGENTS.md](../AGENTS.md) | Current repository snapshot | Current workflow | 26 Aug 2026 | Internal product/workflow authority | 1 | Governs this work but is not external evidence. |
| B08 | BidBack Codex Workflow | BidBack repository | [CODEX_WORKFLOW.md](./CODEX_WORKFLOW.md) | Current repository snapshot | Current workflow | 26 Aug 2026 | Internal procedure | 1 | Procedure only. |
| G01 | GBM: The auction where losing bidders were paid — 2018–2026 | GBM / founders | [gbm.auction](https://gbm.auction/) | 2026 retrospective | 2018–2026 | 26 Aug 2026 | Issuer-authored final retrospective | 3 | Rich chronology and aggregates; issuer-authored, no full reconciliation. |
| G02 | The GBM Auction | Edouard Bessire / GBM | [Main paper PDF](https://gbm.auction/paper/gbm-auction.pdf) | Mar 2026 | Haunt 2, 26–29 Aug 2021 | 26 Aug 2026 | Direct theoretical and empirical paper | 2 | Author discloses co-inventor/company role; analysis repository field is a placeholder. |
| G03 | The GBM Auction — Supplementary Material | Edouard Bessire / GBM | [Supplement PDF](https://gbm.auction/paper/gbm-auction-supplementary.pdf) | Mar 2026 | Haunt 2, 26–29 Aug 2021 | 26 Aug 2026 | Direct tables, robustness and derivations | 2 | Same author connection; no independently run analysis. |
| G04 | How a GBM Auction Works | GBM documentation | [Documentation](https://docs.gbm.auction/how-a-gbm-auction-works) | Undated archived/current page | Product period before wind-down | 26 Aug 2026 | Issuer-authored mechanism documentation | 2 | Documentation may redirect/change and may not match every deployment. |
| G05 | GBM Auction Incentives | GBM documentation | [Incentive presets](https://docs.gbm.auction/how-a-gbm-auction-works/gbm-auction-incentives) | Undated archived/current page | Product period before wind-down | 26 Aug 2026 | Issuer-authored parameter documentation | 2 | Presets are product examples, not universal configuration. |
| G06 | Protocol Business Model | GBM documentation | [Protocol fee page](https://docs.gbm.auction/the-gbm-protocol/protocol-business-model) | Undated protocol-era page | Open-protocol period | 26 Aug 2026 | Issuer-authored commercial documentation | 2 | Proposed/open-protocol model; not every integration. |
| G07 | aavegotchi-gbm | Aavegotchi / GitHub | [Repository](https://github.com/aavegotchi/aavegotchi-gbm) | Repository snapshot at cutoff | Implementation history from 2021 | 26 Aug 2026 | Public source repository and licensing notice | 2 | Branch snapshot may not equal every deployed bytecode version. |
| G08 | GBMFacet.sol | Aavegotchi / GitHub | [Facet source](https://github.com/aavegotchi/aavegotchi-gbm/blob/master/contracts/facets/GBMFacet.sol) | Repository snapshot at cutoff | Aavegotchi GBM implementation | 26 Aug 2026 | Direct implementation source | 2 | Integration-specific split and backend authorization; deployment matching incomplete. |
| G09 | Aavegotchi FAQ | Aavegotchi Wiki | [FAQ](https://wiki.aavegotchi.com/en/faq) | Current page; no explicit date | Product behavior through cutoff | 26 Aug 2026 | Integrator documentation | 2 | Current wording may summarize multiple versions. |
| G10 | Auction House | Aavegotchi documentation | [Auction House docs](https://docs.aavegotchi.com/own/trading/auction-house) | Current page | Current documented implementation | 26 Aug 2026 | Integrator documentation | 2 | Describes supported UX; not aggregate activity evidence. |
| G11 | Aavegotchi Deployed Contract Addresses | Aavegotchi / GitHub | [Address registry](https://github.com/aavegotchi/deployed-contract-addresses) | Repository snapshot at cutoff | Base deployment through cutoff | 26 Aug 2026 | Integrator address registry | 1 | Repository authority for addresses; not usage analysis. |
| G12 | Base transaction `0x5407e…35dce` | BaseScan | [Transaction](https://basescan.org/tx/0x5407eb6c1a0fadd4f6ababa81abf4b47db8b8d8bcf0bdb64e63cae16b6c35dce) | Chain record | 31 May 2026 | 26 Aug 2026 | On-chain transaction display | 1 | One observed action; actor and later continuity not established. |
| G13 | Song A Day case study | GBM Web3 case studies | [Case study](https://web3.gbm.auction/case-studies/song-a-day) | Undated page | Compared auction periods around 2022–2023 | 26 Aug 2026 | Issuer-authored before/after case study | 3 | No randomization; works, audience, period and exchange rate change. |
| G14 | Song A Day GBM contract | Etherscan | [Verified contract/address](https://etherscan.io/address/0x1e51339ba83171e65c09132567b0bf0478bad392) | Chain history through cutoff | Activity including Jan 2026 | 26 Aug 2026 | Verified code and transaction history | 1 | Address activity is not a complete commercial dataset. |
| G15 | How Aavegotchi used GBM auctions… | GBM / Medium | [Case study](https://medium.com/gbm-auction/how-aavegotchi-used-gbm-auctions-to-revolutionise-their-nft-distributions-and-marketplace-since-23646cd55140) | 11 Aug 2023 | 2021–2023 | 26 Aug 2026 | Issuer-authored partner case study | 3 | Marketing totals and performance uplift lack supplied dataset/method. |
| G16 | Now anyone can launch Bid-to-Earn auctions in Aavegotchi's Auction House | Aavegotchi | [Launch post](https://blog.aavegotchi.com/now-anyone-can-launch-bid-to-earn-auctions-in-aavegotchis-auction-house/) | 1 Dec 2022 | 1 Dec 2022 launch | 26 Aug 2026 | Integrator launch announcement | 2 | Launch and issuer aggregates; not independent reconciliation. |
| G17 | Three new features now live in the Aavegotchi Auction House | Aavegotchi | [Feature post](https://blog.aavegotchi.com/3-new-features-now-live-in-the-aavegotchi-auction-house/) | 24 Apr 2024 | Apr 2024 | 26 Aug 2026 | Integrator product update | 2 | “Curb bots” wording identifies concern, not a quantified incident. |
| G18 | Towards Understanding Player Behavior in Blockchain Games: A Case Study of Aavegotchi | Jiang, Min, Fan, Tao and Cai / arXiv; FDG paper | [arXiv 2210.13013](https://arxiv.org/abs/2210.13013) | 24 Oct 2022 | Data 2 Feb 2021–25 Feb 2022 | 26 Aug 2026 | Independent scholarly ecosystem study | 1 | Five selected contracts; addresses treated as players in parts of analysis; causal attribution limited. |
| G19 | Key IDA Information | GBM documentation | [Campaign design and schedule](https://docs.gbm.auction/the-gbm-ida/key-ida-information) | 2025 campaign page | 24 Nov–1 Dec 2025 | 26 Aug 2026 | Issuer-authored campaign design | 2 | Establishes intended schedule and mechanics, not final results. |
| G20 | Perpetual Altruism Ltd, company 11219425 | UK Companies House | [Company record](https://find-and-update.company-information.service.gov.uk/company/11219425) | Current register display | Liquidation events in Mar 2026 | 26 Aug 2026 | Official company register | 1 | Corporate status only; no mechanism-causation or asset-disposition conclusion. |
| G21 | Notice in London Gazette issue 65013 | The Gazette / UK official public record | [Notice 5074578](https://www.thegazette.co.uk/notice/5074578) | Mar 2026 notice | 5 Mar 2026 resolution/appointments | 26 Aug 2026 | Official insolvency notice | 1 | Records resolutions and appointments, not underlying commercial cause. |
| G22 | US20210174432A1 — Computer implemented method and system for updating a database system for a blockchain version control system; computer implemented methods of auctioning an item for a seller, and computer implemented method of updating a smart contract | Google Patents aggregation of US record | [US family member](https://patents.google.com/patent/US20210174432A1/en) | Published 10 Jun 2021 | Priorities 7 Aug 2018 and 17 Jul 2019 | 26 Aug 2026 | Bibliography, events and displayed claims | 2 | Aggregator status/assignee display; official live wrapper not inspected. |
| G23 | WO2020030891A1 — Computer implemented method and system for updating a database system for a blockchain version control system; computer implemented methods of auctioning an item for a seller, and computer implemented method of updating a smart contract | Google Patents aggregation of WIPO record | [PCT publication](https://patents.google.com/patent/WO2020030891A1/en) | Published 13 Feb 2020 | PCT filed 2 Aug 2019; earlier GB priorities | 26 Aug 2026 | Family bibliography and displayed claims | 2 | Aggregator display; national-phase search incomplete. |
| G24 | Checking application status and Patent Center access | US Patent and Trademark Office | [USPTO guidance](https://www.uspto.gov/patents/apply/checking-application-status/check-filing-status-your-patent-application) | Current guidance at cutoff | Identity-verification requirement from 11 Sep 2025 | 26 Aug 2026 | Official access/status guidance | 1 | Guidance is not the file history for this application. |
| G25 | US20050267834A1 — Electronic Auction Loyalty and Incentive System using Demonstrated Contributions to Final Sell Price | Google Patents aggregation of US record | [Publication](https://patents.google.com/patent/US20050267834A1/en) | Published 1 Dec 2005 | Priority 1 Jun 2004 | 26 Aug 2026 | Earlier publication and displayed claims | 2 | Status `observed in the cited register as of 26 August 2026`: `Abandoned`; descriptive screen only. |
| G26 | The Amsterdam Auction | Goeree and Offerman / Econometrica; RePEc index | [RePEc record](https://ideas.repec.org/a/ecm/emetrp/v72y2004i1p281-294.html) | Vol. 72, 2004; initially online Dec 2003 | Experiments reported in article; historical format | 26 Aug 2026 | Peer-reviewed theory/laboratory evidence | 1 | Amsterdam variants differ; not a direct product comparison. |
| G27 | Premium auctions in the field | Sander Onderstal / Review of Economic Design | [Article](https://link.springer.com/article/10.1007/s10058-020-00228-1) | 2 Mar 2020 | Field experiment 5 May 2016 | 26 Aug 2026 | Peer-reviewed online field experiment | 1 | Poster auction and symmetric setting; not GBM or BidBack. |
| G28 | TopBidder Protocol Introduction | TopBidder / Medium | [Protocol post](https://medium.com/topbidder/topbidder-protocol-introduction-75920b169ccc) | 13 Apr 2021 | Apr 2021 launch period | 26 Aug 2026 | Issuer-authored protocol description | 3 | No independent usage reconciliation; perpetual format and token overlay. |
| G29 | GBM ROTD Terms of Use | RightOfTheDot / GBM fiat auction | [Terms](https://gbm.rotd.com/terms-of-use) | 2025 event terms; exact page date not shown | 2025 domain-auction events | 26 Aug 2026 | Direct contractual product terms | 2 | Event/version-specific; not every fiat or Web3 implementation. |
| G30 | The Sandbox Training Grounds LAND Sale | The Sandbox | [Launch post](https://www.sandbox.game/en/blog/training-grounds-land-sale-ft-cirque-du-soleil-scc-napoli-open-circus-metafight-deepak-chopra-casio-g-shock-and-kun-aguero/3481/) | Jul 2025 | Scheduled 15–22 Jul 2025 sale | 26 Aug 2026 | Integrator launch announcement | 2 | Separate activity and final settled results were not located. |
| G31 | Integration of GBM Auctions in Decentraland's Marketplace | Decentraland DAO | [Governance proposal](https://forum.decentraland.org/t/dao-d7a7fa3-integration-of-gbm-auctions-in-decentraland-s-marketplace/21715) | Jan 2024 | Vote 19–27 Jan 2024 | 26 Aug 2026 | Governance proposal and result | 2 | Approval favored a separate dApp; does not establish volume. |
| G32 | Introducing GBM Auctions on Singular | RMRK / Singular | [Announcement](https://rmrk.app/blog/introducing-gbm-auctions-on-singular/) | 24 Jan 2024 | 2024 integration period | 26 Aug 2026 | Integrator announcement | 2 | Prospective wording; launch and usage are unresolved in this evidence record. |
| G33 | Song A Day with Jonathan Mann and Edouard Bessire | Web3 Galaxy Brain | [Podcast page](https://web3galaxybrain.com/episode/Song-A-Day-with-Jonathan-Mann-and-Edouard-Bessire-from-GBM-Auctions) | 24 Jan 2023 | Recent Jan 2023 switch described | 26 Aug 2026 | Direct participant interview | 2 | Conversational account; creates date tension with retrospective. |
| G34 | Aavegotchi Bid-to-Earn auctions are coming to Polygon | Aavegotchi | [Announcement](https://aavegotchi.medium.com/aavegotchi-bid-to-earn-auctions-are-coming-to-polygon-4bf26a09db29) | Jul 2021 | Haunt 2 preparation | 26 Aug 2026 | Integrator mechanism explanation | 2 | Pre-event announcement and product framing. |
| G35 | The GBM Auction Festival | GBM documentation | [Campaign page](https://docs.gbm.auction/community/community-rewards/the-gbm-auction-festival) | Campaign-era page | 2025 reward campaign | 26 Aug 2026 | Issuer-authored XP/referral/abuse-rule documentation | 2 | Establishes overlay and stated rules, not observed abuse. |
| G36 | GBM-linked Base explorer address | BaseScan URL linked from the GBM retrospective | [Explorer pointer](https://basescan.org/address/0xB5f1c23D2480b57DD16b54189579659E40449cD3#code) | Page not independently inspected | Open-protocol deployment reported in 2026 | 26 Aug 2026 | Official-site-linked explorer pointer | 3 | Explorer contents were not inspected; the link alone does not establish code state or activity. |
| G37 | Haunt 2 dates confirmed | Aavegotchi | [Announcement](https://aavegotchi.medium.com/haunt-2-dates-confirmed-f2d2029b0794) | 11 Aug 2021 | 26–29 Aug 2021 | 26 Aug 2026 | Contemporary integrator announcement | 2 | Planned lot count; paper supplies analyzed sample after exclusions. |
| G38 | GBM token-sale result page | GBM | [Token-sale page](https://testido.gbm.auction/tokenSale) | 2025 campaign/result page | Nov–Dec 2025 | 26 Aug 2026 | Issuer-authored headline results | 3 | Page was partially degraded; definitions and independent reconciliation were not supplied. |
| G39 | GBM Terms and Conditions | GBM / Perpetual Altruism Ltd | [Terms](https://gbm.domains/terms) | Undated terms page | Service/operator relationship through the product period | 26 Aug 2026 | Direct product terms | 2 | Version/date history was not reconstructed; entity attribution only. |

## 16. Exit Decision

`Proceed — information assimilated, no reason to delay V1`

Decision rationale:

- GBM supplies a close mechanism benchmark and useful empirical evidence, but no controlled result requires BidBack to adopt GBM's per-displacement logic.
- Earlier precedents constrain broad positioning claims but do not require a V1 mechanism change.
- No finding meets all five `Material blocker candidate` conditions.
- The four-part targeted-review threshold is not met in current V1 scope.
- P4 and P5 remain exactly where the Economic Model V1 decision record left them; no material new actor-observability input was found.
- The bounded actions in Section 12 improve measurement and wording without delaying the existing readiness sequence.

## 17. Next Workstream

The next workstream remains **`Premium Controlled-Experience Readiness`**.

This review contributes only three inputs to that already selected workstream:

1. a metric dictionary that prevents bidding turnover, settled value, seller proceeds, wallets and people from being conflated;
2. a defensible explanation of the premium-only funding, refund, winner-exclusion and score/trace boundaries;
3. auction-level evidence retention sufficient to reconcile any later controlled-experience aggregate.

It does not authorize implementation, new economic-model work, identity work, parameter work, public positioning, deployment or transaction activity. Any `Scale / Production concern` family checkpoint remains dormant until a materially relevant jurisdiction and plausible commercial stake are actually selected.
