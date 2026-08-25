# BidBack Roadmap

This roadmap defines evidence-based progression without assigning arbitrary delivery dates. Current status is maintained in [`PRODUCT_STATUS.md`](./PRODUCT_STATUS.md); this document defines what must become true next.

## Gate Model

Gates are earned through retained evidence, not through code presence alone.

| Gate | Measurable criteria |
| --- | --- |
| **Demo-ready** | The supported local environment can be rebuilt; contracts, frontend checks, and build pass in CI; one complete deterministic auction lifecycle is executed; core economics and safety constraints are visible; limitations are documented; no real funds or production claims are involved. |
| **Controlled beta-ready** | A repeatable public-testnet multi-wallet lifecycle passes; the hosted beta environment cannot expose local-dev transaction routes; deployment/source verification evidence is retained; supported wallets and RPCs are defined; basic monitoring, support, and incident handling exist; selected users complete moderated scenarios; blocking architecture decisions are recorded. |
| **Public beta-ready** | Public-scale read architecture and pagination are validated; wallet/device/accessibility coverage meets the chosen support matrix; fuzz/invariant coverage and the required independent security review are complete; governance controls are deployed; monitoring and incident response are tested; legal and real-asset policies approve the beta scope. |
| **Production-ready** | Production chain, governance, hosting, data, wallet, asset, legal, audit, monitoring, recovery, and support decisions are implemented and verified; production deployments are source-verified; critical audit findings are remediated; operational drills pass; launch approval is recorded. |

### Current Gate Assessment

As of the 25 August 2026 checkpoint, **Demo-ready is achieved for a controlled local demonstration**. **One complete canonical Base Sepolia cycle validated:** auction `#2` completed on Base Sepolia (`84532`) across five distinct public role wallets and a separately deployed valueless test-only NFT, with reconciled economics, a passing final verifier, five rejected duplicate-action `eth_call` simulations, and a passing final verifier after those simulations. Economic Model V1 is also completed and evaluated, but that closure does not advance a readiness gate automatically.

This satisfies the single canonical public multi-wallet lifecycle criterion for the recorded run. It does not by itself prove repeatability or close the full **Controlled beta-ready** gate. The read model remains bounded, and hosting, supported wallet/RPC definition, monitoring, support, incident handling, moderated user testing, governance, audit, and legal review remain absent or unresolved. **Controlled beta-ready**, **Public beta-ready**, and **Production-ready** are not achieved.

| Controlled beta criterion | Current evidence status |
| --- | --- |
| One complete canonical public-testnet multi-wallet lifecycle | **Satisfied for the 22 August 2026 Base Sepolia auction `#2` run** |
| Economic reconciliation and final state for that run | **Satisfied for the canonical run** |
| Duplicate-action rejection for that run | **Satisfied through five read-only `eth_call` simulations** |
| Canonical evidence retention | **Partially retained:** confirmed results are recorded; transaction hashes, block metadata, exact timestamps, checksums, and other archival fields remain pending evidence |
| Repeatability and wallet/browser/RPC support matrix | Not satisfied |
| Hosted environment with technical exclusion of local-dev routes | Not satisfied |
| Monitoring, support, and incident handling | Not satisfied |
| Moderated user scenarios | Not satisfied |
| Blocking architecture decisions | Not satisfied |

## Operational V1 Prioritization Lens

The formal roadmap and its gates remain authoritative. This operational lens keeps the first credible V1 distinct from a complete industrial `Production-ready` architecture.

A pre-V1 work item must be justified because it is genuinely necessary for a real user to use BidBack credibly and reasonably safely, or because it prevents a disproportionate risk. A possible improvement is not automatically a V1 launch prerequisite. Open-ended optimization, theoretical research without a practical decision, premature enterprise infrastructure, architecture sized for hypothetical mass adoption, exhaustive wallet support, and technical perfection without material launch impact should not delay V1 by default.

An understood imperfection may remain documented in V1 when it does not compromise custody, solvency, accounting, permissions, fund safety, claims or refunds, network configuration, exclusion of local-development routes, economic transparency, or controls required for real users; creates no disproportionate economic, legal, or security risk; and can safely be corrected later. Product architecture, sequence, and implementation choices must be driven by product and risk evidence, not by their educational value.

| Priority class | Use |
| --- | --- |
| **A. Must-have V1** | Required before a real user can reasonably use BidBack. |
| **B. Strong V1 enabler** | Not strictly required for technical operation, but materially improves adoption, trust, comprehension, or the ability to learn from the market. |
| **C. Post-V1 improvement** | A real improvement that should not normally delay the first release. |
| **D. Scale / Production concern** | Justified when traction, volume, operational constraints, or future risk make the investment relevant. |

This taxonomy is a scope-challenge tool, not an algorithmic score. Every item remains subject to the actual technical, security, governance, operational, legal, and real-value-asset risk of its launch scope.

## Completed Checkpoint — BidBack Economic Model V1

**Status:** `Economic Model V1 — Completed / evaluated`

**Outcome:** `no-current-candidate-acceptable`

Lots A-F delivered:

- **Lot A:** reviewed executable specification and decision boundary;
- **Lot B:** exact Python twin of the Solidity baseline;
- **Lot C:** 14 deterministic normal scenarios and bidder policies;
- **Lot D:** 10 adversarial matched pairs and bounded diagnostics;
- **Lot E:** Candidates A-E, feasibility evidence, and deterministic comparisons;
- **Lot F:** fail-closed deterministic decision reduction and the final decision record.

The baseline and Candidates A-D were not selected. Candidate E is an analytical counterfactual benchmark that is impractical in the current architecture. P2a remains `non-comparable`; `parameter-only` was rejected; no Solidity evolution or automatic application change was approved. The presence of the baseline Solidity implementation in the repository proves functional bounded MVP behavior, not its approval as the selected Economic Model V1 direction.

The P4/P5 observability boundary is recorded only as a known economic limitation, an explicit reopening condition, and a conditional research boundary. It is not a new workstream, an open V1 decision, or a current reason to change Solidity. No Lot G is created.

Exit evidence is retained in [`ECONOMIC_MODEL_V1_SPEC.md`](./ECONOMIC_MODEL_V1_SPEC.md), [`ECONOMIC_MODEL_V1_DECISION.md`](./ECONOMIC_MODEL_V1_DECISION.md), and the versioned artifacts under [`economic-model/`](../economic-model/). Completion does not automatically advance Controlled beta-ready, Public beta-ready, or Production-ready.

## Short Checkpoint — GBM / Competitive & Prior-Art Review

**Classification:** `Strong V1 enabler`; short, documentary, research-oriented, and non-blocking by default.

GBM Auctions / GBM Protocol has been identified as a potentially relevant historical benchmark whose mechanism, adoption evidence, and prior-art implications require a bounded external review. This statement identifies a review target; it does not treat unverified external claims as facts.

The future review will:

- compare positioning, the actual GBM mechanism, proximity to and differences from BidBack, other relevant competitors or precedents, and possible BidBack differentiation;
- compare reward funding, reward-accrual timing, reward/bid relations, seller and winner economics, losing-bidder incentives, farming, shill and sybil exposure, and capital requirements;
- seek empirical evidence about usage, adoption, volume, integrations, incentive effects, documented weaknesses, and documented reasons for success, decline, pivot, or cessation where available;
- identify potentially relevant patents, applications, or claims and whether later professional IP review may be warranted, without making a definitive legal conclusion.

The default exit is `information assimilated — no reason to delay V1`. A blocking work item is created only for a material finding such as a serious directly relevant IP risk, a historically demonstrated economic vulnerability directly applicable to BidBack, a simple design difference that avoids a major risk, or a strong empirical adoption lesson that materially changes launch strategy.

This checkpoint will not build a GBM engine, replay Lots A-F automatically, or open another exploratory economic lot. Any substantive economic reopening requires a separate explicit decision.

## Next Major Product Workstream — Premium Controlled-Experience Readiness

The next major product workstream coordinates two tracks. Track A makes BidBack feel coherent, trustworthy, and premium; Track B supplies only the controlled foundation needed to learn safely from external users. A public V1 must look and behave like a finished, coherent product, not merely a functional prototype.

### Track A — Premium Experience

**Classification:** primarily `Strong V1 enabler`, with critical clarity, safety, and recovery surfaces promoted to `Must-have V1` where their risk requires it.

Progressively establish a coherent premium visual direction, identity and marketplace feel, hierarchy, browse/search and auction-detail surfaces, creation, bidding, step-up, finalization, claims and withdrawals, economic transparency, trust surfaces, wallet and network states, transaction feedback, error/retry/recovery behavior, responsive behavior, baseline accessibility, micro-interactions, and signature-friction mapping.

Perceived quality can affect adoption, confidence, comprehension, and conversion. The pre-launch target is therefore not “good-enough UX,” “functional enough,” or “sufficient MVP polish.”

#### Formative / early UX research

Research may begin when critical flows are coherent, understandable, visually clean enough not to invalidate feedback, and technically stable in a controlled environment. It should test auction and conditional-reward comprehension, bidding, wallets and signatures, claims, recovery, errors, network switching, and trust/risk comprehension. This evidence should shape the premium experience rather than waiting for final polish.

#### Launch-readiness UX validation

Before public V1, validate a materially more qualitative experience: strong visual identity, polished hierarchy, fluid interactions, clear transaction feedback, serious responsive behavior, high economic clarity, and coherent trust presentation. BidBack should learn before perfection, but it must not launch publicly with a mediocre experience merely because it is labelled V1.

### Track B — Controlled Experience Foundation

**Classification:** `Must-have V1` for credible external sessions.

Build only the minimum controlled and repeatable testnet foundation:

- a safe hosted demo or equivalent controlled-access environment;
- technical exclusion of local-development transaction routes;
- explicit minimal wallet and RPC support;
- repeatable Base Sepolia execution;
- minimum retained evidence;
- basic monitoring, support, and incident handling sufficient for moderated sessions.

This track does not automatically require a heavy persistent indexer, production database, multi-region infrastructure, production governance stack, production-chain deployment, or other industrial architecture.

### Moderated User Validation

When Tracks A and B are reasonably `research-ready`, conduct formative and moderated sessions measuring task completion, comprehension, wallet and signature friction, network friction, perceived trust, recovery, error handling, economic-model comprehension, and seller/bidder interest.

The results inform product and architecture decisions. Session keys, account abstraction, delegation, and signed intents are not selected merely because they are technically interesting.

### Evidence-Led V1 Architecture Decisions

After relevant initial user evidence, decide only what V1 needs for indexing/persistence, hosting, RPC, wallet strategy, bidding/signature strategy, environment isolation, and metadata. Challenge each topic with the A/B/C/D taxonomy; do not assume a full indexer or database is `Must-have V1`.

### V1 Security Hardening

Serious, proportionate security work starts as soon as its inputs are stable enough; it is not artificially deferred until all UX and data architecture is fixed. Depending on the approved value-at-risk scope, it includes a dedicated threat model, fuzz/invariant coverage, relevant bounds/gas testing, permissions review, custody/solvency/accounting verification, claims/refunds safety, production-like environment isolation, governance appropriate to real funds, and independent review proportionate to actual risk.

Fundamental custody, solvency, accounting, permissions, fund-safety, claims/refunds, network, environment-isolation, and economic-transparency requirements are never relaxed for V1.

### Initial Adoption / Go-to-Market

**Classification:** `Strong V1 enabler`.

Start bounded preparation when BidBack is genuinely demonstrable and usable. The initial objective is to obtain relevant external users and measure voluntary use, not to build a large NFT marketplace immediately.

Future evidence should challenge the initial NFT niche, relevant communities and channels such as X, Discord, Telegram, or Farcaster, creator/collection partnerships, a launch auction or event, explanatory content, video demonstrations, reasonable launch incentives, referrals only if justified, first-seller acquisition, marketplace chicken-and-egg dynamics, and bidder liquidity.

Potential measures include visitor-to-wallet-connect and wallet-connect-to-first-bid conversion, unique bidders, sellers, competitive auctions, repeat bidders and sellers, volume, possible protocol fees, measurable acquisition cost, and qualitative feedback. No artificial threshold is set at this checkpoint.

## Operational V1 Launch Line

The operational route is:

1. **Completed — MVP technical foundation**
2. **Completed / bounded — canonical Base Sepolia lifecycle**
3. **Completed — Economic Model V1**
4. **GBM / Competitive & Prior-Art Review** — short and non-blocking by default
5. **Premium Controlled-Experience Readiness** — Premium Experience plus Controlled Experience Foundation
6. **Formative / Moderated User Validation**
7. **Evidence-led V1 Architecture Decisions**
8. **V1 Security Hardening**
9. **Premium launch-readiness convergence**
10. **Initial Adoption / Go-to-Market preparation**
11. **V1 launch decision**
12. **Public V1 within an explicitly approved technical, security, governance, operational, legal, and asset-risk scope**
13. **First external users, auctions, volume, and possible protocol fees**
14. **Post-V1 evidence and learning**
15. **V1.x / V2 improvements driven by observed needs**
16. **Industrial Public beta / Production progression when traction or risk justifies it**

This is an operational release line, not a relaxed fifth gate. A V1 can be narrower than full `Production-ready`: it need not support thousands of users, every wallet, every economic refinement, sophisticated indexing, enterprise infrastructure, or industrial operations by default. If it exposes public users, real-value assets, real funds, or protocol fees, its launch decision must explicitly approve the security, governance, legal/regulatory, real-value-asset, and operational controls required by that actual risk scope. A V1 label cannot bypass a gate.

Legal and IP effort remains proportionate to scope: identify principal risks, avoid obvious risks, retain open questions, and obtain the advice necessary for the intended release. Professional freedom-to-operate work becomes more relevant with traction, meaningful revenue, commercial exploitation, investment, major partnerships, or sensitive jurisdictions; a manifestly material legal or IP risk can still block V1 at any scale.

## Explicitly Deferred Unless Later Evidence Justifies Them

- new economic candidates, parameter changes, Solidity economic evolution, or a P4/P5 solution;
- session keys, account abstraction, delegated intents, or other bidding authorization changes;
- a heavy production indexer/database, scale architecture, or exhaustive wallet support;
- production-chain deployment, full production governance, final external audit scope, or broad real-value-asset support;
- mass-market go-to-market activity.

These items require a later demonstrated V1 need, material risk, user evidence, actual traction or volume, or operational constraint. They are not authorized by this roadmap checkpoint.

## Milestone 0 — Product Checkpoint and Workflow

**Objective:** establish one current product status, explicit evidence rules, a gated roadmap, and a repeatable Codex/Git workflow.

- **Entry criteria:** repository capabilities and documentation can be inspected; known validation results are available.
- **Deliverables:** product-status matrix, roadmap, decision register links, agent rules, implementation workflow, historical-document banners.
- **Dependencies:** confirmed local lifecycle result, dated CI status, accurate Base Sepolia qualification.
- **Exit criteria:** `PRODUCT_STATUS.md` is the declared status authority; documentation contains no material Base Sepolia contradiction; the current gate and reservations are explicit; future changes have a documented approval and validation workflow.
- **Risks:** documentation drift, confusing historical evidence with current proof, overstating production readiness.
- **Out of scope:** application changes, new tests, deployment, CI changes, product decisions.

## Milestone 1 — Controlled Testnet Demonstration

**Objective:** prove the production-target wallet-signed lifecycle on Base Sepolia through distinct public wallets.

- **Entry criteria:** Demo-ready; funded test wallets and valueless test NFT approved; target deployment and RPC identified; local-dev actions disabled.
- **Deliverables:** repeatable deployment verification, explorer links, multi-wallet create/bid/step-up/finalize/claim/withdraw evidence, failure and retry notes, hosted demo decision or controlled access method.
- **Dependencies:** Base smoke depth, hosting/RPC, wallet support, strict local-dev exclusion decisions.
- **Exit criteria:** every required public lifecycle step succeeds from the intended actor wallet; balances and contract state reconcile; duplicate actions fail; evidence is retained and repeatable; no server-held testnet key powers user actions.
- **Risks:** faucet/RPC instability, wallet network friction, stale deployment metadata, incomplete explorer verification, accidental exposure of local-dev routes.
- **Out of scope:** real-value assets, broad public access, production chain launch, production governance.

**Checkpoint evidence:** the 22 August 2026 Base Sepolia auction `#2` run satisfies the one-cycle canonical lifecycle portion of this milestone. Evidence retention is incomplete for archival transaction metadata, and the milestone's hosted-access, support-matrix, repeatability, and Controlled beta requirements remain open.

## Milestone 2 — User Validation

**Objective:** test whether intended users understand the auction, conditional rewards, risk language, wallet actions, and recovery paths.

- **Entry criteria:** controlled testnet flow is stable enough for moderated sessions; target user profiles and scenarios are defined.
- **Deliverables:** research plan, consent/privacy handling, moderated test records, comprehension and task-completion results, prioritized UX findings, revised acceptance criteria.
- **Dependencies:** reliable test environment, wallet strategy, legal guidance for research language and data handling.
- **Exit criteria:** representative users complete the critical flow at the agreed success rate; severe comprehension or recovery failures have owners and resolutions; no copy implies guaranteed yield.
- **Risks:** biased sample, wallet familiarity masking UX issues, testnet friction overwhelming product feedback.
- **Out of scope:** uncontrolled public acquisition, binding production economics, real-value auctions.

## Milestone 3 — Architecture Decisions

**Objective:** resolve, from user and risk evidence, the minimum choices required by the intended V1 scope and the additional choices required only by later gates.

- **Entry criteria:** controlled testnet and user evidence expose actual constraints; decision owners and evaluation criteria are assigned.
- **Deliverables:** accepted or explicitly deferred decision records for indexing, bid authorization, hosting/RPC, wallet support, production chain, governance, audit depth, asset policy, legal framework, and local-dev exclusion, classified through the V1 prioritization lens.
- **Dependencies:** user findings, traffic assumptions, security threat model, legal input, operating budget.
- **Exit criteria:** every blocker for the intended release scope has an approved option, rationale, owner, migration path, and gate impact; unresolved items explicitly block the affected gate; later industrial choices are not treated as V1 prerequisites without evidence.
- **Risks:** premature optimization, incompatible choices, hidden operating costs, irreversible vendor or chain coupling.
- **Out of scope:** implementation of the selected beta architecture.

## Milestone 4 — Beta Architecture

**Objective:** implement and validate the selected hosted, data, RPC, and wallet architecture for controlled and then public beta use.

- **Entry criteria:** relevant architecture decisions are approved; capacity and support targets are measurable.
- **Deliverables:** hosted frontend, environment separation, persistent indexed reads if selected, pagination, metadata policy/cache, supported-wallet integration, telemetry, deployment automation and recovery procedures.
- **Dependencies:** Milestone 3 decisions, provider accounts, secrets management, data retention policy.
- **Exit criteria:** controlled-beta criteria pass; load/reorg/staleness behavior meets defined targets; local-dev actions are technically unavailable in hosted environments; operational dashboards expose agreed health signals.
- **Risks:** index inconsistency, provider outage, metadata abuse, secret leakage, wallet incompatibility, migration complexity.
- **Out of scope:** production launch and unapproved real-value assets.

## Milestone 5 — Security and Governance

**Objective:** establish evidence and controls appropriate to the approved public-beta and production risk.

- **Entry criteria:** each review target is stable enough for the selected activity; threat-model and fuzz/invariant work may begin before the complete UX and data architecture is fixed, while final review scope waits for the relevant contracts and launch architecture to stabilize.
- **Deliverables:** fuzz/invariant suites, gas/boundary analysis, independent review or audit at the approved depth, remediation register, multisig/timelock configuration, role and emergency policies, monitoring alerts, incident-response and recovery drills.
- **Dependencies:** governance and audit decisions, stable contracts, signer availability, legal and asset policies.
- **Exit criteria:** required review is complete; critical/high findings are resolved or explicitly accepted by authorized owners; governance handoff and emergency paths are tested; exit claims remain available under pause; incident drill evidence is retained.
- **Risks:** late contract changes invalidating review, signer concentration, unsafe emergency powers, incomplete solvency invariants.
- **Out of scope:** claiming that an audit eliminates risk.

## Milestone 6 — Public Product

**Objective:** launch only the product scope that has satisfied the Public beta-ready or Production-ready gate.

- **Entry criteria:** the target gate is approved with retained technical, operational, security, governance, user, and legal evidence.
- **Deliverables:** source-verified deployment, supported public frontend, status/support channels, disclosures and terms, operational ownership, launch and rollback records.
- **Dependencies:** all selected decisions and prior gate criteria; production funding and organizational approvals.
- **Exit criteria:** the intended gate checklist is signed off; production health and accounting are observable; recovery and communications responsibilities are active; post-launch review is scheduled by event or threshold, not an invented roadmap date.
- **Risks:** contract or provider failure, regulatory change, abusive assets, support overload, governance compromise, misleading market expectations.
- **Out of scope:** guaranteed yield, lending, leverage, derivatives, product minting, or redistribution funded from refundable bidder caps.

## Open Decision Register

No option below is selected merely because an MVP implementation exists.

| Decision | Options | Evaluation criteria | Dependencies | Gate impact |
| --- | --- | --- | --- | --- |
| Indexing strategy | bounded RPC reads; managed indexer; custom event indexer; hybrid | completeness, reorg handling, latency, cost, portability, recovery | traffic/history targets, hosting, data ownership | Controlled beta if current bounds suffice; required resolution for Public beta |
| Bid authorization | signature per bid; session keys; account abstraction; delegated/intents model | custody, revocation, UX, replay protection, chain support, cost | user research, wallet support, threat model | Controlled beta can retain signatures; Public beta decision required if UX is unacceptable |
| Base Sepolia smoke depth | one canonical full cycle completed; repeated matrix across browsers/wallets; automated plus manual runs | actor separation, repeatability, failure coverage, retained evidence | wallets, RPC, hosted access, test assets | Single-cycle criterion satisfied; repetition, support matrix, and evidence-completeness decisions still affect Controlled beta-ready |
| Hosting architecture | managed frontend; container/platform host; self-managed infrastructure; static/edge hybrid | local-dev isolation, secrets, observability, rollback, cost, jurisdiction | data/indexer, RPC, legal/privacy | Blocks Controlled beta-ready |
| Wallet strategy | injected only; multi-connector library; mobile-first WalletConnect; curated support matrix | adoption, chain switching, accessibility, mobile behavior, support burden | user research, hosting, bid authorization | Minimum matrix blocks Controlled beta; broader proof blocks Public beta |
| Production chain | Base; another L2; Ethereum; multi-chain | security, liquidity, fees, NFT ecosystem, RPC/explorer quality, governance, legal | user market, audit, operations, asset policy | Blocks Production-ready; may affect Public beta |
| Governance | EOA during testnet only; multisig; multisig plus timelock; role-separated governance | signer diversity, delay, emergency response, recovery, transparency | organization, threat model, legal entity | Multisig/approved controls block Public beta and Production |
| Audit level | internal review; independent review; focused audit; full audit plus formal methods | contract stability, value at risk, scope, reviewer quality, remediation capacity | threat model, asset policy, budget | Approved level blocks Public beta/Production according to risk policy |
| Real-value asset policy | valueless test assets only; allowlisted low-risk assets; permissionless assets | valuation/manipulation, rights, moderation, insurance, support, legal classification | legal review, security, governance, moderation | Real value blocked until Public beta or Production approval |
| Legal framework | jurisdiction-specific counsel; phased market review; restricted-access pilot terms | product classification, consumer protection, privacy, sanctions, tax, disclosures | target markets, asset policy, entity structure | Blocks Public beta and Production |
| Strict hosted exclusion of local-dev actions | runtime guard; build-time omission; separate application/package; network policy plus code exclusion | fail-closed behavior, auditability, deployment mistakes, maintenance burden | hosting/CI architecture, secrets policy | Technical exclusion blocks Controlled beta-ready |

## Maintenance

Update milestone and gate evidence when accepted proof changes. Record decisions in [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) and reflect their current implementation status in [`PRODUCT_STATUS.md`](./PRODUCT_STATUS.md). Do not add delivery dates without an explicitly approved planning basis.
