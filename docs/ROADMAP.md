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

As of the 31 July 2026 checkpoint, **Demo-ready is achieved for a controlled local demonstration**. The evidence includes dated green `main` CI and a successful complete Anvil lifecycle in Codespaces. Reservations: Base Sepolia is only partially validated; the public multi-wallet smoke is incomplete; the read model is bounded; and hosting, monitoring, user testing, governance, audit, and legal review are absent. No later gate is achieved.

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

## Milestone 2 — User Validation

**Objective:** test whether intended users understand the auction, conditional rewards, risk language, wallet actions, and recovery paths.

- **Entry criteria:** controlled testnet flow is stable enough for moderated sessions; target user profiles and scenarios are defined.
- **Deliverables:** research plan, consent/privacy handling, moderated test records, comprehension and task-completion results, prioritized UX findings, revised acceptance criteria.
- **Dependencies:** reliable test environment, wallet strategy, legal guidance for research language and data handling.
- **Exit criteria:** representative users complete the critical flow at the agreed success rate; severe comprehension or recovery failures have owners and resolutions; no copy implies guaranteed yield.
- **Risks:** biased sample, wallet familiarity masking UX issues, testnet friction overwhelming product feedback.
- **Out of scope:** uncontrolled public acquisition, binding production economics, real-value auctions.

## Milestone 3 — Architecture Decisions

**Objective:** resolve the choices that determine beta scope, cost, trust, and operational ownership.

- **Entry criteria:** controlled testnet and user evidence expose actual constraints; decision owners and evaluation criteria are assigned.
- **Deliverables:** accepted decision records for indexing, bid authorization, hosting/RPC, wallet support, production chain, governance, audit depth, asset policy, legal framework, and local-dev exclusion.
- **Dependencies:** user findings, traffic assumptions, security threat model, legal input, operating budget.
- **Exit criteria:** every Controlled/Public beta blocker has an approved option, rationale, owner, migration path, and gate impact; unresolved items explicitly block the affected gate.
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

- **Entry criteria:** beta architecture and contract scope are stable; threat model and governance owners exist.
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
| Base Sepolia smoke depth | one canonical full cycle; repeated matrix across browsers/wallets; automated plus manual runs | actor separation, repeatability, failure coverage, retained evidence | wallets, RPC, hosted access, test assets | Blocks Controlled beta-ready |
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
